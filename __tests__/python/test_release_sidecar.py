"""Unit tests for ``scripts/sync-from-releases.py`` release-body automation.

Covers the parsing rules, sidecar generation, stable-changelog validation, and
the manual-sidecar precedence behaviour described in the firmware publishing
documentation. These tests use only stdlib so they run unchanged on any
Python 3.10+ environment (no pytest / extra deps required).
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, List
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


# Load gen_manifests first so sync_releases re-uses the same instance.
gen_manifests = _load_module("gen_manifests", SCRIPTS_DIR / "gen-manifests.py")
sync_releases = _load_module("sync_releases", SCRIPTS_DIR / "sync-from-releases.py")


SAMPLE_BODY = """\
## Changelog

- Initial production stable release for Ceiling-POE-VentIQ-FanTRIAC-RoomIQ.
- Adds VentIQ bathroom air-quality sensing, TRIAC fan switching, and RoomIQ room sensing.

## Known Issues

- None.

## Features

- PoE-powered Sense360 Core configuration
- VentIQ bathroom air-quality sensing
- TRIAC fan switching
- RoomIQ room sensing

## Hardware Requirements

- Sense360 Core R4 or newer
- Sense360 PoE PSU
- Sense360 VentIQ module
- Sense360 TRIAC board
- Sense360 RoomIQ module
"""


class ParseReleaseBodyTests(unittest.TestCase):
    """Parser converts each Markdown section into a list of bullet items."""

    def test_full_body_round_trips_each_section(self) -> None:
        parsed = sync_releases.parse_release_body(SAMPLE_BODY)
        self.assertEqual(
            parsed["changelog"],
            [
                "Initial production stable release for Ceiling-POE-VentIQ-FanTRIAC-RoomIQ.",
                "Adds VentIQ bathroom air-quality sensing, TRIAC fan switching, and "
                "RoomIQ room sensing.",
            ],
        )
        self.assertEqual(parsed["known_issues"], [])
        self.assertEqual(
            parsed["features"],
            [
                "PoE-powered Sense360 Core configuration",
                "VentIQ bathroom air-quality sensing",
                "TRIAC fan switching",
                "RoomIQ room sensing",
            ],
        )
        self.assertEqual(
            parsed["hardware_requirements"],
            [
                "Sense360 Core R4 or newer",
                "Sense360 PoE PSU",
                "Sense360 VentIQ module",
                "Sense360 TRIAC board",
                "Sense360 RoomIQ module",
            ],
        )

    def test_known_issues_none_collapses_to_empty_list(self) -> None:
        body = "## Changelog\n- Real change\n\n## Known Issues\n- None.\n"
        parsed = sync_releases.parse_release_body(body)
        self.assertEqual(parsed["known_issues"], [])

    def test_missing_known_issues_defaults_to_empty_list(self) -> None:
        body = "## Changelog\n- Real change\n"
        parsed = sync_releases.parse_release_body(body)
        self.assertEqual(parsed["known_issues"], [])
        self.assertEqual(parsed["features"], [])
        self.assertEqual(parsed["hardware_requirements"], [])

    def test_features_section_round_trips(self) -> None:
        body = "## Features\n- Foo\n- Bar\n"
        parsed = sync_releases.parse_release_body(body)
        self.assertEqual(parsed["features"], ["Foo", "Bar"])

    def test_hardware_requirements_section_round_trips(self) -> None:
        body = "## Hardware Requirements\n- One\n- Two\n"
        parsed = sync_releases.parse_release_body(body)
        self.assertEqual(parsed["hardware_requirements"], ["One", "Two"])

    def test_alternate_bullet_markers_are_supported(self) -> None:
        body = (
            "## Changelog\n"
            "* asterisk bullet\n"
            "+ plus bullet\n"
            "- dash bullet\n"
        )
        parsed = sync_releases.parse_release_body(body)
        self.assertEqual(
            parsed["changelog"],
            ["asterisk bullet", "plus bullet", "dash bullet"],
        )

    def test_unknown_sections_are_ignored(self) -> None:
        body = (
            "## Random\n- ignore me\n\n## Changelog\n- keep me\n\n## Other\n- bye\n"
        )
        parsed = sync_releases.parse_release_body(body)
        self.assertEqual(parsed["changelog"], ["keep me"])

    def test_whitespace_only_body_returns_empty_sections(self) -> None:
        parsed = sync_releases.parse_release_body("   \n\t\n")
        self.assertEqual(
            parsed,
            {
                "changelog": [],
                "known_issues": [],
                "features": [],
                "hardware_requirements": [],
            },
        )

    def test_none_input_returns_empty_sections(self) -> None:
        parsed = sync_releases.parse_release_body(None)
        self.assertEqual(
            parsed,
            {
                "changelog": [],
                "known_issues": [],
                "features": [],
                "hardware_requirements": [],
            },
        )

    def test_carriage_returns_are_normalised(self) -> None:
        body = "## Changelog\r\n- one\r\n- two\r\n"
        parsed = sync_releases.parse_release_body(body)
        self.assertEqual(parsed["changelog"], ["one", "two"])


class StableChangelogValidationTests(unittest.TestCase):
    """``validate_stable_changelog`` rejects empty / filler-only changelogs."""

    def test_empty_changelog_raises(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            sync_releases.validate_stable_changelog([], "Sense360-X-v1.0.0-stable.bin")
        self.assertIn("missing a `## Changelog`", str(ctx.exception))

    def test_blank_strings_count_as_empty(self) -> None:
        with self.assertRaises(ValueError):
            sync_releases.validate_stable_changelog(
                ["", "   "], "Sense360-X-v1.0.0-stable.bin"
            )

    def test_generic_filler_only_raises(self) -> None:
        for filler in [
            ["Initial release"],
            ["First release."],
            ["Firmware release"],
            ["See release notes"],
            ["TBD"],
            ["TODO"],
            ["N/A"],
            ["Placeholder"],
            ["No changes."],
        ]:
            with self.subTest(filler=filler):
                with self.assertRaises(ValueError):
                    sync_releases.validate_stable_changelog(
                        filler, "Sense360-X-v1.0.0-stable.bin"
                    )

    def test_substantive_entry_passes(self) -> None:
        # Should not raise.
        sync_releases.validate_stable_changelog(
            ["Adds VentIQ bathroom air-quality sensing."],
            "Sense360-X-v1.0.0-stable.bin",
        )

    def test_mixed_filler_and_real_passes(self) -> None:
        # As long as at least one non-filler entry exists, the changelog is
        # accepted — we don't insist that every bullet pass the filler check.
        sync_releases.validate_stable_changelog(
            ["Initial release", "Adds VentIQ bathroom air-quality sensing."],
            "Sense360-X-v1.0.0-stable.bin",
        )


class BuildSidecarTests(unittest.TestCase):
    """Generated sidecar payload contains the documented defaults."""

    def _metadata_for(self, name: str) -> "gen_manifests.FirmwareMetadata":
        return gen_manifests.parse_firmware_metadata(
            Path(name), default_channel="stable"
        )

    def test_application_sidecar_contains_documented_defaults(self) -> None:
        parsed = sync_releases.parse_release_body(SAMPLE_BODY)
        metadata = self._metadata_for(
            "Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin"
        )
        sidecar = sync_releases.build_sidecar_from_release_body(
            metadata=metadata, parsed_body=parsed
        )
        # Documented fields and values from the PR spec.
        self.assertEqual(sidecar["signed_by"], "Sense360 release pipeline")
        self.assertEqual(sidecar["deprecated"], False)
        self.assertIsNone(sidecar["deprecation_reason"])
        self.assertEqual(sidecar["artifact_type"], "application")
        self.assertTrue(sidecar["improv"])
        # Section payloads round-trip from the parsed body.
        self.assertEqual(sidecar["changelog"], parsed["changelog"])
        self.assertEqual(sidecar["known_issues"], [])
        self.assertEqual(sidecar["features"], parsed["features"])
        self.assertEqual(sidecar["hardware_requirements"], parsed["hardware_requirements"])

    def test_rescue_sidecar_overrides_artifact_type_and_improv(self) -> None:
        parsed = sync_releases.parse_release_body(SAMPLE_BODY)
        metadata = self._metadata_for("Sense360-Rescue-v1.0.0-stable.bin")
        sidecar = sync_releases.build_sidecar_from_release_body(
            metadata=metadata, parsed_body=parsed
        )
        self.assertEqual(sidecar["artifact_type"], "rescue")
        self.assertFalse(sidecar["improv"])
        # Rescue sidecars still inherit the application defaults for
        # signed_by / deprecated / deprecation_reason.
        self.assertEqual(sidecar["signed_by"], "Sense360 release pipeline")
        self.assertEqual(sidecar["deprecated"], False)
        self.assertIsNone(sidecar["deprecation_reason"])

    def test_sidecar_target_path_replaces_bin_extension(self) -> None:
        bin_path = Path(
            "firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin"
        )
        self.assertEqual(
            sync_releases.sidecar_target_path(bin_path),
            Path(
                "firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.meta.json"
            ),
        )


class FixtureAssetTests(unittest.TestCase):
    """End-to-end check on the canonical PR fixture."""

    def test_canonical_asset_writes_expected_sidecar(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            firmware_dir = Path(tmp)
            asset_name = (
                "Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin"
            )
            release: Dict[str, Any] = {
                "prerelease": False,
                "body": SAMPLE_BODY,
                "assets": [
                    {
                        "name": asset_name,
                        "url": "https://api.github.com/repos/example/firmware/assets/1",
                    }
                ],
            }
            captured: List[Path] = []

            def fake_download(url: str, dest: Path, token: Any = None) -> None:  # noqa: ARG001
                # Drop a placeholder body so move() succeeds; sidecar generation
                # is independent of the binary contents.
                dest.write_bytes(b"\x00" * 16)
                captured.append(dest)

            with mock.patch.object(sync_releases, "download_asset", side_effect=fake_download):
                downloaded = sync_releases.sync_assets(
                    release,
                    firmware_dir,
                    token=None,
                    pattern="*.bin",
                    dry_run=False,
                )

            self.assertEqual(len(downloaded), 1)
            target_bin = (
                firmware_dir
                / "configurations"
                / "Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin"
            )
            self.assertTrue(target_bin.exists())
            target_sidecar = target_bin.with_suffix(".meta.json")
            self.assertTrue(target_sidecar.exists())

            payload = json.loads(target_sidecar.read_text(encoding="utf-8"))
            self.assertEqual(payload["signed_by"], "Sense360 release pipeline")
            self.assertEqual(payload["deprecated"], False)
            self.assertIsNone(payload["deprecation_reason"])
            self.assertEqual(payload["artifact_type"], "application")
            self.assertTrue(payload["improv"])
            self.assertEqual(payload["known_issues"], [])
            self.assertGreater(len(payload["changelog"]), 0)
            self.assertGreater(len(payload["features"]), 0)
            self.assertGreater(len(payload["hardware_requirements"]), 0)

    def test_rescue_asset_writes_rescue_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            firmware_dir = Path(tmp)
            release: Dict[str, Any] = {
                "prerelease": False,
                "body": "## Changelog\n- Restore mode for unbricking hubs.\n",
                "assets": [
                    {
                        "name": "Sense360-Rescue-v1.0.0-stable.bin",
                        "url": "https://api.github.com/repos/example/firmware/assets/2",
                    }
                ],
            }

            def fake_download(url: str, dest: Path, token: Any = None) -> None:  # noqa: ARG001
                dest.write_bytes(b"\x00" * 16)

            with mock.patch.object(sync_releases, "download_asset", side_effect=fake_download):
                downloaded = sync_releases.sync_assets(
                    release,
                    firmware_dir,
                    token=None,
                    pattern="*.bin",
                    dry_run=False,
                )

            self.assertEqual(len(downloaded), 1)
            sidecars = list(firmware_dir.rglob("*.meta.json"))
            self.assertEqual(len(sidecars), 1)
            payload = json.loads(sidecars[0].read_text(encoding="utf-8"))
            self.assertEqual(payload["artifact_type"], "rescue")
            self.assertFalse(payload["improv"])

    def test_stable_release_with_missing_changelog_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            firmware_dir = Path(tmp)
            release: Dict[str, Any] = {
                "prerelease": False,
                "body": "## Features\n- Some feature\n",  # no changelog!
                "assets": [
                    {
                        "name": "Sense360-Ceiling-USB-v1.0.0-stable.bin",
                        "url": "https://api.github.com/repos/example/firmware/assets/3",
                    }
                ],
            }

            def fake_download(url: str, dest: Path, token: Any = None) -> None:  # noqa: ARG001
                dest.write_bytes(b"\x00" * 16)

            with self.assertRaises(SystemExit) as ctx, mock.patch.object(
                sync_releases, "download_asset", side_effect=fake_download
            ):
                sync_releases.sync_assets(
                    release,
                    firmware_dir,
                    token=None,
                    pattern="*.bin",
                    dry_run=False,
                )
            self.assertIn("missing a `## Changelog`", str(ctx.exception))

    def test_stable_release_with_generic_changelog_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            firmware_dir = Path(tmp)
            release: Dict[str, Any] = {
                "prerelease": False,
                "body": "## Changelog\n- Initial release\n",
                "assets": [
                    {
                        "name": "Sense360-Ceiling-USB-v1.0.0-stable.bin",
                        "url": "https://api.github.com/repos/example/firmware/assets/4",
                    }
                ],
            }

            def fake_download(url: str, dest: Path, token: Any = None) -> None:  # noqa: ARG001
                dest.write_bytes(b"\x00" * 16)

            with self.assertRaises(SystemExit) as ctx, mock.patch.object(
                sync_releases, "download_asset", side_effect=fake_download
            ):
                sync_releases.sync_assets(
                    release,
                    firmware_dir,
                    token=None,
                    pattern="*.bin",
                    dry_run=False,
                )
            self.assertIn("generic filler", str(ctx.exception))

    def test_manual_sidecar_takes_precedence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            firmware_dir = Path(tmp)
            target_dir = firmware_dir / "configurations"
            target_dir.mkdir(parents=True)
            manual_sidecar = target_dir / "Sense360-Ceiling-USB-v1.0.0-stable.meta.json"
            manual_payload = {
                "changelog": ["Hand-curated note that should be preserved."],
                "signed_by": "manual operator",
            }
            manual_sidecar.write_text(json.dumps(manual_payload, indent=2), encoding="utf-8")

            release: Dict[str, Any] = {
                "prerelease": False,
                # Body has bad changelog content; should still succeed because
                # the manual sidecar is authoritative.
                "body": "## Changelog\n- Initial release\n",
                "assets": [
                    {
                        "name": "Sense360-Ceiling-USB-v1.0.0-stable.bin",
                        "url": "https://api.github.com/repos/example/firmware/assets/5",
                    }
                ],
            }

            def fake_download(url: str, dest: Path, token: Any = None) -> None:  # noqa: ARG001
                dest.write_bytes(b"\x00" * 16)

            with mock.patch.object(sync_releases, "download_asset", side_effect=fake_download):
                downloaded = sync_releases.sync_assets(
                    release,
                    firmware_dir,
                    token=None,
                    pattern="*.bin",
                    dry_run=False,
                )

            self.assertEqual(len(downloaded), 1)
            # Manual sidecar contents must be preserved exactly.
            payload = json.loads(manual_sidecar.read_text(encoding="utf-8"))
            self.assertEqual(payload, manual_payload)

    def test_malformed_release_body_for_stable_fails(self) -> None:
        # An empty body still triggers the missing-changelog error rather than
        # silently producing a sidecar with no changelog content.
        with tempfile.TemporaryDirectory() as tmp:
            firmware_dir = Path(tmp)
            release: Dict[str, Any] = {
                "prerelease": False,
                "body": "",
                "assets": [
                    {
                        "name": "Sense360-Ceiling-USB-v1.0.0-stable.bin",
                        "url": "https://api.github.com/repos/example/firmware/assets/6",
                    }
                ],
            }

            with self.assertRaises(SystemExit) as ctx:
                sync_releases.sync_assets(
                    release,
                    firmware_dir,
                    token=None,
                    pattern="*.bin",
                    dry_run=True,
                )
            self.assertIn("missing a `## Changelog`", str(ctx.exception))


class ApplySidecarMetadataTests(unittest.TestCase):
    """gen-manifests applies features / hardware_requirements / improv from sidecar."""

    def test_features_and_hardware_requirements_propagate(self) -> None:
        metadata = gen_manifests.parse_firmware_metadata(
            Path("Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin"),
            default_channel="stable",
        )
        sidecar = {
            "features": ["Feature A", "Feature B"],
            "hardware_requirements": ["Sense360 Core R4 or newer"],
            "improv": False,
            "changelog": ["Real change."],
        }
        gen_manifests._apply_sidecar_metadata(metadata, sidecar)
        self.assertEqual(metadata.features, ["Feature A", "Feature B"])
        self.assertEqual(metadata.hardware_requirements, ["Sense360 Core R4 or newer"])
        self.assertFalse(metadata.improv)

    def test_missing_keys_preserve_metadata_defaults(self) -> None:
        metadata = gen_manifests.parse_firmware_metadata(
            Path("Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin"),
            default_channel="stable",
        )
        # Pre-condition: parser-level default for non-rescue is improv=True.
        self.assertTrue(metadata.improv)
        gen_manifests._apply_sidecar_metadata(
            metadata,
            {"changelog": ["Real change."]},
        )
        # No improv key in sidecar → parser default preserved.
        self.assertTrue(metadata.improv)


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    unittest.main()
