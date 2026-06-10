"""Unit tests for ``scripts/validate-source-checksums.py``.

The guard fails a PR when an added/modified ``firmware/sources.json`` entry's
binary has no checksum line on its upstream release. These tests run
hermetically: the importer network helpers (reused by the guard) are patched so
no real HTTP happens.

Covered:

* missing checksum line for a changed entry fails (the June 10 failure mode),
* present checksum line passes,
* unchanged entries are skipped (never fetched / validated),
* a network/API failure is reported as an error, not a pass,
* the added/modified diff selection (added, modified, unchanged, duplicates).
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Load the guard, then bind to the *guard's* importer instance. The guard loads
# its own copy of import-firmware-sources.py via importlib, so patching that
# exact instance (guard.importer) is what makes the network mocks take effect.
guard = _load_module(
    "validate_source_checksums", SCRIPTS_DIR / "validate-source-checksums.py"
)
importer = guard.importer

ImportValidationError = importer.ImportValidationError
ChecksumGuardError = guard.ChecksumGuardError


# ---- Fixtures -----------------------------------------------------------


def _entry(**overrides: Any) -> Dict[str, Any]:
    base = {
        "source_repo": "sense360store/esphome-public",
        "release_tag": "v1.0.0-preview",
        "release_url": "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview",
        "version": "1.0.0",
        "channel": "preview",
        "config_string": "Ceiling-POE-AirIQ-FanDAC-RoomIQ",
        "asset_name": "Sense360-Ceiling-POE-AirIQ-FanDAC-RoomIQ-v1.0.0-preview.bin",
        "expected_sha256": "0" * 64,
        "min_size_bytes": 102_400,
        "block_tokens": ["FanTRIAC", "LED"],
    }
    base.update(overrides)
    return base


def _release_with_checksums(
    *,
    asset_name: str,
    include_asset_line: bool = True,
    include_checksums_asset: bool = True,
) -> Dict[str, Any]:
    """A GitHub-release-shaped payload whose checksums-sha256.txt content is
    materialised by the fake ``download_to_path`` from the asset's marker url."""

    assets = [
        {
            "name": asset_name,
            "url": f"https://api.github.example/{asset_name}",
            "browser_download_url": f"https://download.example/{asset_name}",
        }
    ]
    if include_checksums_asset:
        # Encode whether the asset line is present into the url so the fake
        # downloader can produce the right file body.
        flag = "with-line" if include_asset_line else "without-line"
        assets.append(
            {
                "name": "checksums-sha256.txt",
                "url": f"https://api.github.example/checksums-sha256.txt#{flag}#{asset_name}",
                "browser_download_url": f"https://download.example/checksums-sha256.txt#{flag}#{asset_name}",
            }
        )
    return {
        "html_url": "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview",
        "body": "## Changelog\n- x\n",
        "assets": assets,
    }


class _FakeNetwork:
    """Patches importer.fetch_release_metadata + importer.download_to_path."""

    def __init__(self, release: Dict[str, Any]):
        self.release = release
        self.fetch_calls = 0
        self.download_calls: List[str] = []

    def fetch_release_metadata(self, *_args, **_kwargs):
        self.fetch_calls += 1
        return self.release

    def download_to_path(self, url: str, dest: Path, _token):
        self.download_calls.append(url)
        # The checksums url carries "#with-line#<asset>" or "#without-line#<asset>".
        if "checksums-sha256.txt" not in url:
            raise importer.ImportValidationError(
                f"Fake network only serves checksums-sha256.txt, got {url!r}"
            )
        _, flag, asset_name = url.split("#", 2)
        if flag == "with-line":
            dest.write_text(f"{'a' * 64}  {asset_name}\n", encoding="utf-8")
        else:
            # A narrowed checksums file that lists some *other* asset but not
            # the one this source pins.
            dest.write_text(f"{'b' * 64}  some-other-asset.bin\n", encoding="utf-8")


def _run(net: _FakeNetwork, fn, *args, **kwargs):
    with mock.patch.object(
        importer, "fetch_release_metadata", side_effect=net.fetch_release_metadata
    ), mock.patch.object(
        importer, "download_to_path", side_effect=net.download_to_path
    ):
        return fn(*args, **kwargs)


# ---- select_changed_entries --------------------------------------------


class SelectChangedTests(unittest.TestCase):
    def test_added_entry_is_changed(self):
        base = [_entry(config_string="A", asset_name="a.bin")]
        current = base + [_entry(config_string="B", asset_name="b.bin")]
        changed = guard.select_changed_entries(current, base)
        self.assertEqual([e["config_string"] for e in changed], ["B"])

    def test_modified_entry_is_changed(self):
        base = [_entry(expected_sha256="0" * 64)]
        current = [_entry(expected_sha256="f" * 64)]
        changed = guard.select_changed_entries(current, base)
        self.assertEqual(len(changed), 1)
        self.assertEqual(changed[0]["expected_sha256"], "f" * 64)

    def test_unchanged_entry_is_skipped(self):
        base = [_entry(config_string="A", asset_name="a.bin")]
        current = [_entry(config_string="A", asset_name="a.bin")]
        self.assertEqual(guard.select_changed_entries(current, base), [])

    def test_empty_base_validates_all(self):
        current = [_entry(config_string="A"), _entry(config_string="B")]
        self.assertEqual(len(guard.select_changed_entries(current, [])), 2)

    def test_duplicate_added_copy_is_changed(self):
        base = [_entry(config_string="A", asset_name="a.bin")]
        current = [
            _entry(config_string="A", asset_name="a.bin"),
            _entry(config_string="A", asset_name="a.bin"),
        ]
        # One matches the base copy and is consumed; the second is "added".
        self.assertEqual(len(guard.select_changed_entries(current, base)), 1)


# ---- validate_entry_checksum -------------------------------------------


class ValidateEntryTests(unittest.TestCase):
    def test_present_checksum_line_passes(self):
        entry = _entry()
        net = _FakeNetwork(
            _release_with_checksums(
                asset_name=entry["asset_name"], include_asset_line=True
            )
        )
        # No exception == pass.
        _run(net, guard.validate_entry_checksum, entry, token=None)
        self.assertEqual(net.fetch_calls, 1)

    def test_missing_checksum_line_fails(self):
        entry = _entry()
        net = _FakeNetwork(
            _release_with_checksums(
                asset_name=entry["asset_name"], include_asset_line=False
            )
        )
        with self.assertRaises(ChecksumGuardError) as ctx:
            _run(net, guard.validate_entry_checksum, entry, token=None)
        message = str(ctx.exception)
        # Names the entry and the missing asset.
        self.assertIn("Ceiling-POE-AirIQ-FanDAC-RoomIQ", message)
        self.assertIn(entry["asset_name"], message)
        self.assertIn("no", message.lower())
        self.assertIn("checksums-sha256.txt", message)

    def test_missing_checksums_asset_fails(self):
        entry = _entry()
        net = _FakeNetwork(
            _release_with_checksums(
                asset_name=entry["asset_name"], include_checksums_asset=False
            )
        )
        with self.assertRaises(ChecksumGuardError):
            _run(net, guard.validate_entry_checksum, entry, token=None)

    def test_network_failure_reports_error_not_pass(self):
        entry = _entry()

        def _boom(*_args, **_kwargs):
            raise importer.ImportValidationError(
                "GitHub API request for sense360store/esphome-public "
                "v1.0.0-preview failed: 503 Service Unavailable"
            )

        with mock.patch.object(
            importer, "fetch_release_metadata", side_effect=_boom
        ):
            with self.assertRaises(ImportValidationError):
                guard.validate_entry_checksum(entry, token=None)


# ---- validate_changed_sources ------------------------------------------


class ValidateChangedSourcesTests(unittest.TestCase):
    def test_unchanged_entries_never_fetched(self):
        entry = _entry()
        net = _FakeNetwork(
            _release_with_checksums(
                asset_name=entry["asset_name"], include_asset_line=False
            )
        )
        # current == base, so nothing is validated even though the (unchanged)
        # entry would fail if it were checked.
        failures = _run(
            net,
            guard.validate_changed_sources,
            [entry],
            [dict(entry)],
            token=None,
        )
        self.assertEqual(failures, [])
        self.assertEqual(net.fetch_calls, 0)

    def test_changed_missing_line_collected_as_failure(self):
        entry = _entry()
        net = _FakeNetwork(
            _release_with_checksums(
                asset_name=entry["asset_name"], include_asset_line=False
            )
        )
        failures = _run(
            net, guard.validate_changed_sources, [entry], [], token=None
        )
        self.assertEqual(len(failures), 1)
        self.assertIn(entry["asset_name"], failures[0])

    def test_network_failure_collected_as_failure(self):
        entry = _entry()

        def _boom(*_args, **_kwargs):
            raise importer.ImportValidationError("network down")

        with mock.patch.object(
            importer, "fetch_release_metadata", side_effect=_boom
        ):
            failures = guard.validate_changed_sources([entry], [], token=None)
        self.assertEqual(len(failures), 1)
        self.assertIn("network down", failures[0])

    def test_changed_present_line_passes(self):
        entry = _entry()
        net = _FakeNetwork(
            _release_with_checksums(
                asset_name=entry["asset_name"], include_asset_line=True
            )
        )
        failures = _run(
            net, guard.validate_changed_sources, [entry], [], token=None
        )
        self.assertEqual(failures, [])


# ---- shared logic with the importer ------------------------------------


class SharedLogicTests(unittest.TestCase):
    def test_importer_exposes_shared_checksum_helper(self):
        # The guard reuses this exact helper; verify_sha256 also routes through
        # it, so they cannot drift.
        self.assertTrue(hasattr(importer, "assert_checksum_line_present"))
        digest = importer.assert_checksum_line_present(
            f"{'a' * 64}  foo.bin\n", "foo.bin"
        )
        self.assertEqual(digest, "a" * 64)
        with self.assertRaises(ImportValidationError):
            importer.assert_checksum_line_present(
                f"{'a' * 64}  other.bin\n", "foo.bin"
            )


# ---- live sources.json sanity ------------------------------------------


class RepoSourcesTests(unittest.TestCase):
    def test_repo_sources_load_and_diff_is_clean_against_self(self):
        sources = importer.load_sources(REPO_ROOT / "firmware" / "sources.json")
        # Diffing the live file against itself yields no changed entries: the
        # guard is a no-op when nothing changed.
        self.assertEqual(guard.select_changed_entries(sources, list(sources)), [])


if __name__ == "__main__":
    unittest.main()
