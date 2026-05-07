"""Production-mode placeholder rejection tests for ``scripts/gen-manifests.py``.

Background: WebFlash refuses to flash production stable firmware unless the
binary is a real ESP firmware image. Two checks compose to keep the install
gate closed for fixture data:

  * ``file_size <= PLACEHOLDER_FIRMWARE_SIZE_BYTES`` (the 18-byte committed
    stub binaries land here).
  * file content matches a known placeholder payload (``Binary placeholder``)
    even when padded out to a plausible size.

Development / test mode (and ``artifact_type=test_fixture``) continue to
tolerate placeholders so unit fixtures keep working.
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


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


gen_manifests = _load_module("gen_manifests", SCRIPTS_DIR / "gen-manifests.py")


def _make_artifact(
    *,
    path: Path,
    config_string: str,
    channel: str = "stable",
    file_size: int,
    artifact_type: str = "application",
) -> "gen_manifests.FirmwareArtifact":
    """Build a minimally-valid ``FirmwareArtifact`` for placeholder tests."""

    metadata = gen_manifests.FirmwareMetadata(
        name_part=config_string,
        version="1.0.0",
        channel=channel,
        is_configuration=True,
        config_string=config_string,
        core_type="Core",
        mounting="Ceiling",
        power="POE",
        modules=[m for m in config_string.split("-") if m not in {"Ceiling", "POE", "USB", "PWR"}],
        model=None,
        variant=None,
        sensor_addon=None,
        chip_family="ESP32-S3",
        device_type=gen_manifests.DEFAULT_DEVICE_TYPE,
        description=f"Stable firmware for Sense360 {config_string}.",
        features=["x"],
        hardware_requirements=["y"],
        improv=True,
        custom_directory=None,
        changelog=[
            f"Stable v1.0.0 rollout for Sense360 {config_string}; baseline build for production deployments."
        ],
        known_issues=[],
        deprecated=False,
        deprecation_reason=None,
        signed_by="Sense360 release pipeline",
        artifact_type=artifact_type,
        local_only=False,
    )
    return gen_manifests.FirmwareArtifact(
        path=path,
        metadata=metadata,
        relative_path=str(path.relative_to(path.parent.parent.parent))
        if len(path.parents) >= 3
        else str(path),
        chip_family="ESP32-S3",
        md5="11" * 16,
        sha256="aa" * 32,
        signature="sig",
        file_size=file_size,
        build_date="2026-01-01T00:00:00+00:00",
        source_commit="eec461a4f6d85ac3d4920ee2dbd26c3be459aa40",
        source_url="https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40",
        signature_ed25519="kgpXnONkJ8YZhazkL4U8NlOiFW1Xwbri37UI6jEOwfAOHzvR/YCxZ4m6NKJypOdvya8khHFjrw6rHSMaSu//Aw==",
        signature_key_id="dev-2026-01",
    )


class PlaceholderFirmwareDetectionTests(unittest.TestCase):
    """Helpers detect placeholder payloads regardless of file size."""

    def test_short_placeholder_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "stub.bin"
            path.write_bytes(b"Binary placeholder")
            self.assertTrue(
                gen_manifests._file_bytes_look_like_placeholder(path, path.stat().st_size)
            )

    def test_padded_placeholder_is_detected(self) -> None:
        # An attacker (or build mistake) might pad a placeholder out to a
        # plausible size to bypass the size sentinel. The content sniff
        # catches that.
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "padded.bin"
            path.write_bytes(b"Binary placeholder" + b"\x00" * (200 * 1024))
            self.assertTrue(
                gen_manifests._file_bytes_look_like_placeholder(path, path.stat().st_size)
            )

    def test_real_firmware_bytes_are_not_placeholder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "real.bin"
            # Real ESP32 firmware starts with the 0xE9 magic byte. Any
            # plausible non-placeholder payload will do for the test.
            path.write_bytes(b"\xe9\x02\x02\x10" + b"\x00" * 1024)
            self.assertFalse(
                gen_manifests._file_bytes_look_like_placeholder(path, path.stat().st_size)
            )


class ProductionPlaceholderRejectionTests(unittest.TestCase):
    """``validate_manifest_metadata`` blocks placeholder stable firmware in
    production mode and tolerates it in development/test mode."""

    def _placeholder_artifact(
        self, tmpdir: Path, config_string: str, file_size: int = 18, channel: str = "stable"
    ) -> "gen_manifests.FirmwareArtifact":
        bin_path = tmpdir / f"Sense360-{config_string}-v1.0.0-{channel}.bin"
        bin_path.write_bytes(b"Binary placeholder")
        return _make_artifact(
            path=bin_path,
            config_string=config_string,
            channel=channel,
            file_size=file_size,
        )

    def test_production_rejects_18_byte_stable_placeholder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            artifact = self._placeholder_artifact(tmpdir, "Ceiling-POE-VentIQ")
            findings = gen_manifests.validate_manifest_metadata(
                [artifact], mode="production"
            )
            joined = "\n".join(findings)
            self.assertIn(
                "Production stable firmware cannot use placeholder binary",
                joined,
            )
            self.assertIn(artifact.path.name, joined)

    def test_production_rejects_padded_placeholder_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            bin_path = (
                tmpdir / "Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin"
            )
            # File size above the placeholder sentinel AND above the
            # plausible-firmware threshold, but the bytes still start with
            # the known placeholder payload — must be rejected.
            bin_path.write_bytes(b"Binary placeholder" + b"\x00" * (200 * 1024))
            artifact = _make_artifact(
                path=bin_path,
                config_string="Ceiling-POE-AirIQ",
                file_size=bin_path.stat().st_size,
            )
            findings = gen_manifests.validate_manifest_metadata(
                [artifact], mode="production"
            )
            joined = "\n".join(findings)
            self.assertIn(
                "Production stable firmware cannot use placeholder binary",
                joined,
            )
            self.assertIn("matches a known placeholder payload", joined)

    def test_development_mode_tolerates_placeholder_fixtures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            artifact = self._placeholder_artifact(tmpdir, "Ceiling-POE-VentIQ")
            findings = gen_manifests.validate_manifest_metadata(
                [artifact], mode="development"
            )
            for finding in findings:
                self.assertNotIn(
                    "placeholder binary",
                    finding,
                    msg=f"Unexpected placeholder finding in development mode: {finding!r}",
                )

    def test_test_mode_tolerates_placeholder_fixtures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            artifact = self._placeholder_artifact(tmpdir, "Ceiling-POE-VentIQ")
            findings = gen_manifests.validate_manifest_metadata(
                [artifact], mode="test"
            )
            for finding in findings:
                self.assertNotIn("placeholder binary", finding)

    def test_production_rescue_placeholder_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            artifact = self._placeholder_artifact(
                tmpdir, "Rescue", channel="rescue"
            )
            findings = gen_manifests.validate_manifest_metadata(
                [artifact], mode="production"
            )
            joined = "\n".join(findings)
            self.assertIn(
                "Production stable firmware cannot use placeholder binary",
                joined,
            )

    def test_real_firmware_passes_size_sanity(self) -> None:
        # Sanity check: a non-placeholder binary at a plausible size must
        # not trip the new placeholder rejection in production.
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            bin_path = tmpdir / "Sense360-Ceiling-POE-VentIQ-v1.0.0-stable.bin"
            bin_path.write_bytes(b"\xe9\x02\x02\x10" + b"\x00" * (200 * 1024))
            artifact = _make_artifact(
                path=bin_path,
                config_string="Ceiling-POE-VentIQ",
                file_size=bin_path.stat().st_size,
            )
            findings = gen_manifests.validate_manifest_metadata(
                [artifact], mode="production"
            )
            for finding in findings:
                self.assertNotIn(
                    "placeholder binary",
                    finding,
                    msg=f"Unexpected placeholder finding for real firmware: {finding!r}",
                )


if __name__ == "__main__":  # pragma: no cover - manual invocation
    unittest.main()
