"""Unit tests for ``scripts/import-firmware-sources.py``.

Covers the cross-repo importer's validation gates with mocked GitHub responses
so the suite runs hermetically (no network, no pip installs, stdlib only).

Each gate gets at least one negative test (the failure mode the issue calls
out) plus a positive smoke test that the happy path passes when everything
lines up.
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import sys
import tempfile
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


# Load gen_manifests + sync_releases first so the importer reuses the same
# module instances (matches how the script loads them at runtime).
_load_module("gen_manifests", SCRIPTS_DIR / "gen-manifests.py")
_load_module("sync_releases", SCRIPTS_DIR / "sync-from-releases.py")
importer = _load_module(
    "import_firmware_sources", SCRIPTS_DIR / "import-firmware-sources.py"
)

ImportValidationError = importer.ImportValidationError


# ---- Fixtures -----------------------------------------------------------


VALID_BODY = """\
## Changelog

- First production stable release for Ceiling-POE-VentIQ-RoomIQ.
- Adds VentIQ bathroom air-quality sensing and RoomIQ presence/comfort sensing.

## Known Issues

- None.

## Features

- PoE-powered Sense360 Core with VentIQ and RoomIQ modules.

## Hardware Requirements

- Sense360 Core (S360-100 R4 or newer).
- Sense360 VentIQ (S360-211 R4).
- Sense360 RoomIQ (S360-200 R4).
"""


def _make_bin(size: int = 200_000) -> bytes:
    # Deterministic non-zero bytes so SHA256 is stable across runs.
    return (b"sense360-firmware-test-fixture\n" * 8000)[:size]


def _release_payload(
    *,
    body: str = VALID_BODY,
    asset_names: Optional[List[str]] = None,
    asset_bytes: Optional[Dict[str, bytes]] = None,
) -> Dict[str, Any]:
    if asset_names is None:
        asset_names = [
            "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
            "checksums-sha256.txt",
            "checksums-md5.txt",
            "manifest.json",
        ]
    asset_bytes = asset_bytes or {}
    assets = []
    for name in asset_names:
        assets.append(
            {
                "name": name,
                "url": f"https://api.github.example/{name}",
                "browser_download_url": f"https://download.example/{name}",
            }
        )
    return {
        "html_url": "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0",
        "body": body,
        "assets": assets,
    }


def _entry(**overrides: Any) -> Dict[str, Any]:
    base = {
        "source_repo": "sense360store/esphome-public",
        "release_tag": "v1.0.0",
        "release_url": "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0",
        "version": "1.0.0",
        "channel": "stable",
        "config_string": "Ceiling-POE-VentIQ-RoomIQ",
        "asset_name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
        "min_size_bytes": 102_400,
        "required_assets": [
            "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
            "checksums-sha256.txt",
            "checksums-md5.txt",
            "manifest.json",
        ],
        "required_release_body_sections": [
            "Changelog",
            "Known Issues",
            "Features",
            "Hardware Requirements",
        ],
        "block_tokens": ["FanTRIAC", "LED"],
    }
    base.update(overrides)
    return base


class _FakeNetwork:
    """Stand-in for fetch_release_metadata + download_to_path.

    Holds a dict of asset bytes plus a release payload; patched into the
    importer so no real HTTP happens.
    """

    def __init__(self, release: Dict[str, Any], asset_bytes: Dict[str, bytes]):
        self.release = release
        self.asset_bytes = asset_bytes
        self.calls: List[str] = []

    def fetch_release_metadata(self, *_args, **_kwargs):
        self.calls.append("fetch_release_metadata")
        return self.release

    def download_to_path(self, url: str, dest: Path, _token):
        self.calls.append(f"download:{url}")
        # url is whatever the importer chose; map back to the asset name.
        name = url.rsplit("/", 1)[-1]
        if name not in self.asset_bytes:
            raise importer.ImportValidationError(
                f"Test fixture has no bytes for asset '{name}'."
            )
        dest.write_bytes(self.asset_bytes[name])


def _build_network(
    bin_bytes: bytes,
    *,
    extra_assets: Optional[List[str]] = None,
    body: str = VALID_BODY,
    asset_name: str = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
    override_sha: Optional[str] = None,
    upstream_manifest: Optional[Dict[str, Any]] = None,
) -> _FakeNetwork:
    sha_hex = hashlib.sha256(bin_bytes).hexdigest()
    if override_sha is not None:
        sha_hex = override_sha
    checksum_text = f"{sha_hex}  {asset_name}\n"
    manifest_blob = json.dumps(
        upstream_manifest
        or {
            "name": "Sense360 ESPhome public build",
            "version": "1.0.0",
            "source_commit": "abc123def456",
            "esphome_version": "2025.10.1",
        }
    ).encode("utf-8")
    asset_bytes = {
        asset_name: bin_bytes,
        "checksums-sha256.txt": checksum_text.encode("utf-8"),
        "checksums-md5.txt": b"placeholder\n",
        "manifest.json": manifest_blob,
    }
    asset_names = [asset_name, "checksums-sha256.txt", "checksums-md5.txt", "manifest.json"]
    if extra_assets:
        for name in extra_assets:
            asset_names.append(name)
            asset_bytes.setdefault(name, b"placeholder\n")
    release = _release_payload(body=body, asset_names=asset_names)
    return _FakeNetwork(release, asset_bytes)


def _run_import(
    entry: Dict[str, Any],
    network: _FakeNetwork,
    *,
    dry_run: bool = False,
    repo_root: Optional[Path] = None,
) -> Path:
    with mock.patch.object(
        importer, "fetch_release_metadata", side_effect=network.fetch_release_metadata
    ), mock.patch.object(
        importer, "download_to_path", side_effect=network.download_to_path
    ):
        return importer.import_source_entry(
            entry,
            repo_root=repo_root or REPO_ROOT,
            token=None,
            dry_run=dry_run,
            imported_at="2026-05-13T00:00:00+00:00",
        )


# ---- Tests --------------------------------------------------------------


class HappyPathTests(unittest.TestCase):
    def test_valid_v1_release_passes_import_validation(self):
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            target = _run_import(_entry(), net, repo_root=tmp_root)
            self.assertTrue(target.exists())
            self.assertEqual(target.stat().st_size, len(bin_bytes))
            sidecar = target.with_suffix(".meta.json")
            self.assertTrue(sidecar.exists(), "sidecar should be written")
            payload = json.loads(sidecar.read_text(encoding="utf-8"))
            self.assertEqual(
                payload["source"]["source_repo"], "sense360store/esphome-public"
            )
            self.assertEqual(payload["source"]["release_tag"], "v1.0.0")
            self.assertEqual(
                payload["source"]["source_asset_name"],
                "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
            )
            self.assertEqual(
                payload["source"]["source_asset_sha256"],
                hashlib.sha256(bin_bytes).hexdigest(),
            )
            self.assertEqual(
                payload["source"]["source_manifest_git_sha"], "abc123def456"
            )
            self.assertEqual(
                payload["source"]["source_manifest_esphome_version"], "2025.10.1"
            )
            self.assertEqual(payload["source"]["imported_at"], "2026-05-13T00:00:00+00:00")
            self.assertEqual(payload["artifact_type"], "application")
            self.assertGreater(len(payload["changelog"]), 0)
            self.assertEqual(payload["known_issues"], [])

    def test_dry_run_does_not_touch_disk(self):
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            target = _run_import(_entry(), net, repo_root=tmp_root, dry_run=True)
            self.assertFalse(target.exists())
            self.assertFalse(target.with_suffix(".meta.json").exists())


class MissingAssetTests(unittest.TestCase):
    def test_missing_required_asset_fails(self):
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        # Drop checksums-sha256.txt from the release so the gate fires.
        net.release["assets"] = [
            a for a in net.release["assets"] if a["name"] != "checksums-sha256.txt"
        ]
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(_entry(), net)
        self.assertIn("checksums-sha256.txt", str(ctx.exception))

    def test_missing_bin_asset_fails(self):
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        net.release["assets"] = [
            a
            for a in net.release["assets"]
            if a["name"] != "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
        ]
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(_entry(), net)
        self.assertIn(
            "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
            str(ctx.exception),
        )


class WrongFilenameTests(unittest.TestCase):
    def test_asset_name_mismatch_fails(self):
        bin_bytes = _make_bin()
        bad_name = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.1-stable.bin"
        net = _build_network(bin_bytes, asset_name=bad_name)
        entry = _entry(
            required_assets=[
                bad_name,
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ]
        )
        # Asset name in entry doesn't match what we'll find on the release.
        # The importer should fail because `entry.asset_name` (the v1.0.0 form)
        # cannot be retrieved from the release index.
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(entry, net)
        # We declared the entry's asset_name as the original v1.0.0 filename
        # but the release only exposes v1.0.1, so required-asset check fires.
        self.assertIn("Sense360-Ceiling-POE-VentIQ-RoomIQ", str(ctx.exception))


class TinyBinTests(unittest.TestCase):
    def test_tiny_bin_under_min_size_fails(self):
        tiny = b"x" * 1024
        net = _build_network(tiny)
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(_entry(min_size_bytes=102_400), net)
        self.assertIn("bytes", str(ctx.exception))
        self.assertIn("placeholder or truncated", str(ctx.exception))


class ChecksumMismatchTests(unittest.TestCase):
    def test_checksum_mismatch_fails(self):
        bin_bytes = _make_bin()
        wrong_sha = "0" * 64
        net = _build_network(bin_bytes, override_sha=wrong_sha)
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(_entry(), net)
        self.assertIn("SHA256 mismatch", str(ctx.exception))


class ReleaseBodyTests(unittest.TestCase):
    def test_missing_changelog_section_fails(self):
        body = VALID_BODY.replace("## Changelog", "## NotChangelog")
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes, body=body)
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(_entry(), net)
        self.assertIn("## Changelog", str(ctx.exception))

    def test_missing_known_issues_section_fails(self):
        body = VALID_BODY.replace("## Known Issues", "## NotKnownIssues")
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes, body=body)
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(_entry(), net)
        self.assertIn("## Known Issues", str(ctx.exception))

    def test_missing_features_section_fails(self):
        body = VALID_BODY.replace("## Features", "## NotFeatures")
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes, body=body)
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(_entry(), net)
        self.assertIn("## Features", str(ctx.exception))

    def test_missing_hardware_requirements_section_fails(self):
        body = VALID_BODY.replace("## Hardware Requirements", "## NotHardwareRequirements")
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes, body=body)
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(_entry(), net)
        self.assertIn("## Hardware Requirements", str(ctx.exception))


class BlockedTokenTests(unittest.TestCase):
    def test_fantriac_blocked_for_release_one(self):
        # Synthesize a release that smuggles in a FanTRIAC binary as well.
        bin_bytes = _make_bin()
        triac_name = "Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin"
        net = _build_network(bin_bytes, asset_name=triac_name)
        entry = _entry(
            asset_name=triac_name,
            config_string="Ceiling-POE-VentIQ-FanTRIAC-RoomIQ",
            required_assets=[
                triac_name,
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ],
        )
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(entry, net)
        self.assertIn("FanTRIAC", str(ctx.exception))
        self.assertIn("blocked token", str(ctx.exception))

    def test_led_blocked_for_release_one(self):
        bin_bytes = _make_bin()
        led_name = "Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-stable.bin"
        net = _build_network(bin_bytes, asset_name=led_name)
        entry = _entry(
            asset_name=led_name,
            config_string="Ceiling-POE-VentIQ-RoomIQ-LED",
            required_assets=[
                led_name,
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ],
        )
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(entry, net)
        self.assertIn("LED", str(ctx.exception))
        self.assertIn("blocked token", str(ctx.exception))

    def test_led_preview_source_accepts_led_asset(self):
        # WF-LED-002: the LED preview source uses block_tokens=["FanTRIAC"]
        # only — LED must NOT be globally blocked, or the importer would
        # reject the LED preview's own asset. This positive test pins that
        # the per-source policy is per-entry, not global.
        bin_bytes = _make_bin()
        led_name = "Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin"
        net = _build_network(bin_bytes, asset_name=led_name)
        entry = _entry(
            release_tag="v1.0.0-led-preview",
            channel="preview",
            asset_name=led_name,
            config_string="Ceiling-POE-VentIQ-RoomIQ-LED",
            required_assets=[
                led_name,
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ],
            block_tokens=["FanTRIAC"],
        )
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            target = _run_import(entry, net, repo_root=tmp_root)
            self.assertTrue(target.exists())
            self.assertTrue(target.name.endswith("-preview.bin"))

    def test_led_preview_source_still_rejects_fantriac(self):
        # Companion to the test above: the LED preview source's per-source
        # block list must still reject FanTRIAC. If someone accidentally
        # uploads a FanTRIAC-bearing asset under the LED preview tag, the
        # importer refuses it.
        bin_bytes = _make_bin()
        triac_name = "Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-LED-v1.0.0-preview.bin"
        net = _build_network(bin_bytes, asset_name=triac_name)
        entry = _entry(
            release_tag="v1.0.0-led-preview",
            channel="preview",
            asset_name=triac_name,
            config_string="Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-LED",
            required_assets=[
                triac_name,
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ],
            block_tokens=["FanTRIAC"],
        )
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(entry, net)
        self.assertIn("FanTRIAC", str(ctx.exception))
        self.assertIn("blocked token", str(ctx.exception))


class ExpectedSha256Tests(unittest.TestCase):
    """WF-LED-002: pinned ``expected_sha256`` enforcement on top of the
    existing upstream-``checksums-sha256.txt`` verification. Backward
    compatible — when the field is absent the importer behaves exactly as
    before (Release-One source must keep working unchanged)."""

    def test_expected_sha256_match_passes(self):
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        entry = _entry(expected_sha256=hashlib.sha256(bin_bytes).hexdigest())
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            target = _run_import(entry, net, repo_root=tmp_root)
            self.assertTrue(target.exists())

    def test_expected_sha256_mismatch_fails(self):
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        entry = _entry(expected_sha256="f" * 64)
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(entry, net)
        msg = str(ctx.exception)
        self.assertIn("Pinned SHA256 mismatch", msg)
        # Both digests should appear so the operator can diff them.
        self.assertIn("f" * 64, msg)
        self.assertIn(hashlib.sha256(bin_bytes).hexdigest(), msg)

    def test_expected_sha256_absent_preserves_existing_behavior(self):
        # Regression guard for Release-One: with no expected_sha256 key the
        # importer must still validate via checksums-sha256.txt only.
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        entry = _entry()
        self.assertNotIn("expected_sha256", entry)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            target = _run_import(entry, net, repo_root=tmp_root)
            self.assertTrue(target.exists())

    def test_expected_sha256_malformed_fails_clearly(self):
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        entry = _entry(expected_sha256="not-a-sha256")
        with self.assertRaises(ImportValidationError) as ctx:
            _run_import(entry, net)
        self.assertIn("expected_sha256", str(ctx.exception))


class SourcesFileTests(unittest.TestCase):
    def test_load_sources_rejects_bad_schema_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            path.write_text(json.dumps({"schema_version": 9, "sources": []}))
            with self.assertRaises(ImportValidationError) as ctx:
                importer.load_sources(path)
            self.assertIn("schema_version", str(ctx.exception))

    def test_load_sources_rejects_missing_sources_array(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            path.write_text(json.dumps({"schema_version": 1}))
            with self.assertRaises(ImportValidationError):
                importer.load_sources(path)

    def test_repo_sources_file_loads_and_declares_release_one(self):
        # Smoke check that the committed sources.json is valid and contains
        # the Release-One entry. Guards against accidental schema regressions.
        path = REPO_ROOT / "firmware" / "sources.json"
        sources = importer.load_sources(path)
        configs = [s.get("config_string") for s in sources]
        self.assertIn("Ceiling-POE-VentIQ-RoomIQ", configs)
        release_one = next(
            s for s in sources if s.get("config_string") == "Ceiling-POE-VentIQ-RoomIQ"
        )
        self.assertEqual(release_one.get("source_repo"), "sense360store/esphome-public")

        # Version-agnostic: do NOT pin a specific release version here. The
        # source declaration legitimately moves ahead of manifest.json whenever
        # upstream cuts a new Release-One build (for example v1.0.0 -> v1.0.2)
        # and firmware/sources.json is updated before the importer regenerates
        # the manifest. Pinning a literal version string re-broke CI on every
        # bump. Assert the entry's internal consistency instead.
        release_tag = release_one.get("release_tag")
        asset_name = release_one.get("asset_name")
        self.assertIsInstance(release_tag, str)
        self.assertIsInstance(asset_name, str)
        # The release_tag version token (e.g. "1.0.2" from "v1.0.2") must appear
        # in the asset filename so the two can never silently drift apart.
        version_token = release_tag[1:] if release_tag.startswith("v") else release_tag
        version_token = version_token.split("-")[0]
        version_parts = version_token.split(".")
        self.assertEqual(len(version_parts), 3, version_token)
        self.assertTrue(all(p.isdigit() for p in version_parts), version_token)
        self.assertIn("v" + version_token, asset_name)
        # required_assets must carry the asset itself plus the upstream SHA256
        # checksum manifest the importer verifies against.
        required_assets = release_one.get("required_assets") or []
        self.assertIn(asset_name, required_assets)
        self.assertIn("checksums-sha256.txt", required_assets)
        # Release-One must block FanTRIAC + LED (defense in depth; the stable
        # Release-One build ships neither asset).
        self.assertIn("FanTRIAC", release_one.get("block_tokens") or [])
        self.assertIn("LED", release_one.get("block_tokens") or [])


class ReleaseTagFilterNormalizationTests(unittest.TestCase):
    """The --release-tag filter is canonicalized before matching sources.json."""

    def test_normalize_tag_mirrors_add_firmware_source(self):
        self.assertEqual(importer.normalize_tag("V1.0.5"), "v1.0.5")
        self.assertEqual(importer.normalize_tag(" 1.0.5 "), "v1.0.5")
        self.assertEqual(importer.normalize_tag("1.0.5"), "v1.0.5")
        self.assertEqual(importer.normalize_tag("v1.0.0-PREVIEW"), "v1.0.0-preview")
        self.assertEqual(importer.normalize_tag(""), "")

    def test_uppercase_filter_resolves_to_canonical_entry(self):
        sources = [_entry(release_tag="v1.0.0")]
        for raw in ("v1.0.0", "V1.0.0", "1.0.0", " 1.0.0 "):
            selected = importer.filter_sources(
                sources,
                source_repo=None,
                release_tag=importer.normalize_tag(raw),
            )
            self.assertEqual(len(selected), 1, raw)
            self.assertEqual(selected[0]["release_tag"], "v1.0.0")

    def test_suffixed_uppercase_filter_resolves(self):
        sources = [_entry(release_tag="v1.0.0-preview", channel="preview")]
        selected = importer.filter_sources(
            sources,
            source_repo=None,
            release_tag=importer.normalize_tag("V1.0.0-PREVIEW"),
        )
        self.assertEqual(len(selected), 1)

    def test_bogus_normalized_tag_still_fails_closed(self):
        # Normalization only canonicalizes formatting; a genuinely absent tag
        # must still raise (no source matched), never silently pick another.
        sources = [_entry(release_tag="v1.0.0")]
        with self.assertRaises(ImportValidationError):
            importer.filter_sources(
                sources,
                source_repo=None,
                release_tag=importer.normalize_tag("v9.9.9"),
            )


class ChecksumParserTests(unittest.TestCase):
    def test_parses_sha256sum_default_format(self):
        text = "deadbeef" * 8 + "  Sense360-foo.bin\n"
        out = importer.parse_sha256_manifest(text)
        self.assertEqual(out["Sense360-foo.bin"], "deadbeef" * 8)

    def test_parses_binary_mode_format(self):
        text = "deadbeef" * 8 + " *Sense360-foo.bin\n"
        out = importer.parse_sha256_manifest(text)
        self.assertEqual(out["Sense360-foo.bin"], "deadbeef" * 8)

    def test_ignores_comments_and_blanks(self):
        text = "# header\n\n" + ("deadbeef" * 8) + "  foo.bin\n"
        out = importer.parse_sha256_manifest(text)
        self.assertEqual(out, {"foo.bin": "deadbeef" * 8})


class ProvenanceTests(unittest.TestCase):
    def test_sidecar_handles_missing_upstream_manifest(self):
        bin_bytes = _make_bin()
        net = _build_network(bin_bytes)
        # Drop the upstream manifest.json so the importer's best-effort
        # branch is exercised (provenance fields fall back to None).
        net.release["assets"] = [
            a for a in net.release["assets"] if a["name"] != "manifest.json"
        ]
        # The required_assets gate would still fail because manifest.json is
        # in the default required list — so we run with a relaxed entry that
        # only requires the bin + checksums.
        entry = _entry(
            required_assets=[
                "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
                "checksums-sha256.txt",
            ]
        )
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            target = _run_import(entry, net, repo_root=tmp_root)
            sidecar = target.with_suffix(".meta.json")
            payload = json.loads(sidecar.read_text(encoding="utf-8"))
            self.assertIsNone(payload["source"]["source_manifest_git_sha"])
            self.assertIsNone(
                payload["source"]["source_manifest_esphome_version"]
            )


class SupersededPruneTests(unittest.TestCase):
    """The importer prunes strictly-older builds of the same config_string +
    channel after staging a new version, so a version bump (e.g. Release-One
    v1.0.0 -> v1.0.2) does not leave two builds for one config in the manifest.
    """

    def _seed_old_bin(self, configurations: Path, name: str) -> Path:
        configurations.mkdir(parents=True, exist_ok=True)
        old_bin = configurations / name
        old_bin.write_bytes(_make_bin())
        old_bin.with_suffix(".meta.json").write_text("{}", encoding="utf-8")
        return old_bin

    def test_import_prunes_older_same_config_build(self):
        bin_bytes = _make_bin()
        new_name = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.2-stable.bin"
        net = _build_network(bin_bytes, asset_name=new_name)
        entry = _entry(
            release_tag="v1.0.2",
            version="1.0.2",
            asset_name=new_name,
            required_assets=[
                new_name,
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ],
        )
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            configurations = tmp_root / "firmware" / "configurations"
            old_bin = self._seed_old_bin(
                configurations, "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
            )
            target = _run_import(entry, net, repo_root=tmp_root)
            self.assertTrue(target.exists())
            self.assertTrue(target.name.endswith("v1.0.2-stable.bin"))
            # Old version + sidecar pruned.
            self.assertFalse(old_bin.exists())
            self.assertFalse(old_bin.with_suffix(".meta.json").exists())
            # Exactly one stable Release-One bin remains.
            remaining = sorted(p.name for p in configurations.glob("*.bin"))
            self.assertEqual(remaining, [new_name])

    def test_import_does_not_prune_different_config(self):
        bin_bytes = _make_bin()
        new_name = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.2-stable.bin"
        net = _build_network(bin_bytes, asset_name=new_name)
        entry = _entry(
            release_tag="v1.0.2",
            version="1.0.2",
            asset_name=new_name,
            required_assets=[
                new_name,
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ],
        )
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            configurations = tmp_root / "firmware" / "configurations"
            # A different config at an older version must NOT be touched.
            other = self._seed_old_bin(
                configurations, "Sense360-Ceiling-POE-RoomIQ-v1.0.0-preview.bin"
            )
            _run_import(entry, net, repo_root=tmp_root)
            self.assertTrue(other.exists())
            self.assertTrue(other.with_suffix(".meta.json").exists())

    def test_import_does_not_prune_newer_existing_version(self):
        # Re-importing an OLDER version than what is already on disk must not
        # delete the newer one (version_is_newer is strict).
        bin_bytes = _make_bin()
        old_name = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
        net = _build_network(bin_bytes, asset_name=old_name)
        entry = _entry(asset_name=old_name)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            configurations = tmp_root / "firmware" / "configurations"
            newer = self._seed_old_bin(
                configurations, "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.2-stable.bin"
            )
            _run_import(entry, net, repo_root=tmp_root)
            self.assertTrue(newer.exists())

    def test_import_does_not_prune_other_channel(self):
        bin_bytes = _make_bin()
        new_name = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.2-stable.bin"
        net = _build_network(bin_bytes, asset_name=new_name)
        entry = _entry(
            release_tag="v1.0.2",
            version="1.0.2",
            asset_name=new_name,
            required_assets=[
                new_name,
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ],
        )
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            configurations = tmp_root / "firmware" / "configurations"
            # Same config_string but a preview-channel build must survive.
            preview = self._seed_old_bin(
                configurations,
                "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-preview.bin",
            )
            _run_import(entry, net, repo_root=tmp_root)
            self.assertTrue(preview.exists())


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
