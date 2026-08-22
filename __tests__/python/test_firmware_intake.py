"""Unit tests for ``scripts/firmware-intake.py`` (the combined intake path).

The orchestrator composes the Release 4 source authoring and the Release 5
import into one deterministic pass, plus the pieces neither covered on its
own: the WebFlash-owned eligibility-lane gate (PR #607), cross-channel
supersession retirement, the expected-surface fixture upsert, and the
retired_in placeholder resolution. These tests run hermetically (no network,
stdlib only): release metadata goes in as a payload dict and the two download
hooks are mocked, exactly like ``test_import_firmware_sources.py``.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
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


intake = _load_module("firmware_intake", SCRIPTS_DIR / "firmware-intake.py")

IntakeError = intake.IntakeError

CONFIG = "Ceiling-POE-AirIQ-RoomIQ"
SOURCE_REPO = "sense360store/esphome-public"

VALID_BODY = """\
## Changelog

- Adds AirIQ air-quality sensing improvements for the ceiling hub.
- Improves RoomIQ presence smoothing.

## Known Issues

- None.

## Features

- PoE-powered Sense360 Core with AirIQ and RoomIQ modules.

## Hardware Requirements

- Sense360 Core (S360-100 R4 or newer).
- Sense360 AirIQ (S360-210 R4).
- Sense360 RoomIQ (S360-200 R4).
"""


def _make_bin(seed: bytes, size: int = 200_000) -> bytes:
    return (seed * (size // len(seed) + 1))[:size]


def _asset_name(version: str, channel: str, config: str = CONFIG) -> str:
    return f"Sense360-{config}-v{version}-{channel}.bin"


def _release_payload(
    *, asset_name: str, bin_bytes: bytes, body: str = VALID_BODY
) -> Dict[str, Any]:
    sha_hex = hashlib.sha256(bin_bytes).hexdigest()
    names = [asset_name, "checksums-sha256.txt", "checksums-md5.txt", "manifest.json"]
    assets = [
        {
            "name": name,
            "url": f"https://api.github.example/{name}",
            "browser_download_url": f"https://download.example/{name}",
        }
        for name in names
    ]
    return {
        "html_url": f"https://github.com/{SOURCE_REPO}/releases/tag/test",
        "body": body,
        "assets": assets,
        "_checksum_text": f"{sha_hex}  {asset_name}\n",
        "_asset_bytes": {
            asset_name: bin_bytes,
            "checksums-sha256.txt": f"{sha_hex}  {asset_name}\n".encode("utf-8"),
            "checksums-md5.txt": b"placeholder\n",
            "manifest.json": json.dumps(
                {"source_commit": "abc123", "esphome_version": "2026.4.5"}
            ).encode("utf-8"),
        },
    }


class _Workspace:
    """Temp repo layout: firmware/, sources.json, and both fixtures."""

    def __init__(self, root: Path):
        self.root = root
        self.firmware_dir = root / "firmware"
        self.configurations = self.firmware_dir / "configurations"
        self.configurations.mkdir(parents=True)
        self.sources_path = root / "sources.json"
        self.surface_path = root / "expected-surface.json"
        self.catalog_path = root / "esphome-product-catalog.json"

    def write_sources(
        self,
        sources: List[Dict[str, Any]],
        delisted: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        doc: Dict[str, Any] = {"schema_version": 1, "sources": sources}
        if delisted is not None:
            doc["delisted_sources"] = delisted
        self.sources_path.write_text(
            json.dumps(doc, indent=4) + "\n", encoding="utf-8"
        )

    def write_surface(
        self,
        builds: List[Dict[str, Any]],
        retired: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        doc = {
            "schema_version": 1,
            "builds": builds,
            "rescue": {
                "config_string": "Rescue",
                "version": "1.0.0",
                "channel": "rescue",
            },
            "retired": retired or [],
        }
        self.surface_path.write_text(
            json.dumps(doc, indent=2) + "\n", encoding="utf-8"
        )

    def write_catalog(self, products: List[Dict[str, Any]]) -> None:
        self.catalog_path.write_text(
            json.dumps({"schema_version": 1, "products": products}, indent=2) + "\n",
            encoding="utf-8",
        )

    def seed_build(self, version: str, channel: str, seed: bytes) -> Path:
        bin_path = self.configurations / _asset_name(version, channel)
        bin_path.write_bytes(_make_bin(seed))
        sidecar = self.configurations / (
            _asset_name(version, channel).replace(".bin", ".meta.json")
        )
        sidecar.write_text(
            json.dumps({"artifact_type": "application"}) + "\n", encoding="utf-8"
        )
        return bin_path

    def sources_doc(self) -> Dict[str, Any]:
        return json.loads(self.sources_path.read_text(encoding="utf-8"))

    def surface_doc(self) -> Dict[str, Any]:
        return json.loads(self.surface_path.read_text(encoding="utf-8"))


def _source_entry(
    version: str, channel: str, bin_bytes: bytes, config: str = CONFIG
) -> Dict[str, Any]:
    asset = _asset_name(version, channel, config)
    return {
        "source_repo": SOURCE_REPO,
        "release_tag": f"v{version}" + ("" if channel == "stable" else f"-{channel}"),
        "version": version,
        "channel": channel,
        "config_string": config,
        "asset_name": asset,
        "expected_sha256": hashlib.sha256(bin_bytes).hexdigest(),
        "min_size_bytes": 102_400,
        "required_assets": [asset, "checksums-sha256.txt"],
        "required_release_body_sections": [
            "Changelog",
            "Known Issues",
            "Features",
            "Hardware Requirements",
        ],
        "block_tokens": ["FanTRIAC", "LED"],
    }


def _eligible_product(config: str = CONFIG, **overrides: Any) -> Dict[str, Any]:
    base: Dict[str, Any] = {
        "config_string": config,
        "status": "preview",
        "webflash_build_matrix": True,
    }
    base.update(overrides)
    return base


def _run(
    ws: _Workspace,
    *,
    tag: str,
    payload: Dict[str, Any],
    channel: Optional[str] = None,
    version: Optional[str] = None,
    config: str = CONFIG,
    dry_run: bool = False,
    retired_in_label: Optional[str] = None,
) -> Dict[str, Any]:
    asset_bytes = payload["_asset_bytes"]
    checksum_text = payload["_checksum_text"]

    def fake_download_text(_url: str, _token: Optional[str]) -> str:
        return checksum_text

    def fake_download_to_path(url: str, dest: Path, _token: Optional[str]) -> None:
        name = url.rsplit("/", 1)[-1]
        if name not in asset_bytes:
            raise intake.importer.ImportValidationError(
                f"Test fixture has no bytes for asset '{name}'."
            )
        dest.write_bytes(asset_bytes[name])

    with mock.patch.object(
        intake.add_source, "download_text", side_effect=fake_download_text
    ), mock.patch.object(
        intake.importer, "download_to_path", side_effect=fake_download_to_path
    ):
        return intake.run_intake(
            source_repo=SOURCE_REPO,
            raw_tag=tag,
            config_string=config,
            channel=channel,
            version=version,
            token=None,
            dry_run=dry_run,
            sources_path=ws.sources_path,
            policy_path=None,
            firmware_dir=ws.firmware_dir,
            surface_fixture_path=ws.surface_path,
            catalog_fixture_path=ws.catalog_path,
            release_payload=payload,
            catalog_payload=None,
            skip_catalog_refresh=True,
            retired_in_label=retired_in_label,
        )


class HappyPathTests(unittest.TestCase):
    def test_same_channel_version_bump(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            old_bytes = _make_bin(b"old-preview-build\n")
            ws.seed_build("1.0.9", "preview", b"old-preview-build\n")
            ws.write_sources([_source_entry("1.0.9", "preview", old_bytes)])
            ws.write_surface(
                [
                    {"config_string": "AAA-First", "version": "1.0.0", "channel": "stable"},
                    {"config_string": CONFIG, "version": "1.0.9", "channel": "preview"},
                ]
            )
            ws.write_catalog([_eligible_product()])

            new_bytes = _make_bin(b"new-preview-build\n")
            payload = _release_payload(
                asset_name=_asset_name("1.0.10", "preview"), bin_bytes=new_bytes
            )
            summary = _run(ws, tag="v1.0.10-preview", payload=payload)

            new_bin = ws.configurations / _asset_name("1.0.10", "preview")
            self.assertTrue(new_bin.exists())
            self.assertTrue(
                (ws.configurations / _asset_name("1.0.10", "preview").replace(
                    ".bin", ".meta.json"
                )).exists()
            )
            # Same-channel supersession: the importer prune removed the old pair.
            self.assertFalse(
                (ws.configurations / _asset_name("1.0.9", "preview")).exists()
            )

            doc = ws.sources_doc()
            entries = [
                e for e in doc["sources"] if e["config_string"] == CONFIG
            ]
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["version"], "1.0.10")
            self.assertEqual(
                entries[0]["expected_sha256"],
                hashlib.sha256(new_bytes).hexdigest(),
            )

            surface = ws.surface_doc()
            build = next(
                b for b in surface["builds"] if b["config_string"] == CONFIG
            )
            self.assertEqual(build["version"], "1.0.10")
            self.assertEqual(build["channel"], "preview")
            # Routine same-channel bumps do not grow the retired register.
            self.assertEqual(surface["retired"], [])
            self.assertEqual(summary["retired_cross_channel"], [])
            self.assertFalse(summary["retired_in_placeholder"])
            self.assertEqual(summary["source_entry_action"], "update")

    def test_cross_channel_supersession_retires_old_artifact(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            old_bytes = _make_bin(b"old-stable-build\n")
            ws.seed_build("1.0.9", "stable", b"old-stable-build\n")
            ws.write_sources([_source_entry("1.0.9", "stable", old_bytes)])
            # The PR #607 shape: the stable-named binary was SERVED on the
            # preview channel via a presentation demotion.
            ws.write_surface(
                [
                    {
                        "config_string": CONFIG,
                        "version": "1.0.9",
                        "channel": "preview",
                        "file_channel": "stable",
                    }
                ]
            )
            ws.write_catalog([_eligible_product()])

            new_bytes = _make_bin(b"new-preview-build\n")
            payload = _release_payload(
                asset_name=_asset_name("1.0.10", "preview"), bin_bytes=new_bytes
            )
            summary = _run(ws, tag="v1.0.10-preview", payload=payload)

            self.assertFalse(
                (ws.configurations / _asset_name("1.0.9", "stable")).exists()
            )
            self.assertFalse(
                (
                    ws.configurations
                    / _asset_name("1.0.9", "stable").replace(".bin", ".meta.json")
                ).exists()
            )
            self.assertTrue(
                (ws.configurations / _asset_name("1.0.10", "preview")).exists()
            )

            doc = ws.sources_doc()
            entries = [e for e in doc["sources"] if e["config_string"] == CONFIG]
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["channel"], "preview")
            self.assertEqual(entries[0]["version"], "1.0.10")

            surface = ws.surface_doc()
            build = next(
                b for b in surface["builds"] if b["config_string"] == CONFIG
            )
            self.assertEqual(
                build,
                {
                    "config_string": CONFIG,
                    "version": "1.0.10",
                    "channel": "preview",
                },
            )
            self.assertEqual(len(surface["retired"]), 1)
            retired = surface["retired"][0]
            self.assertEqual(retired["config_string"], CONFIG)
            self.assertEqual(retired["version"], "1.0.9")
            # Retired under its SERVED channel; file_channel names the filename.
            self.assertEqual(retired["channel"], "preview")
            self.assertEqual(retired["file_channel"], "stable")
            self.assertEqual(
                retired["retired_in"], intake.RETIRED_IN_PLACEHOLDER
            )
            self.assertIn("Superseded by the v1.0.10 preview import", retired["reason"])
            self.assertEqual(
                summary["retired_cross_channel"],
                [_asset_name("1.0.9", "stable")],
            )
            self.assertTrue(summary["retired_in_placeholder"])

    def test_new_config_is_inserted_sorted(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources(
                [_source_entry("1.0.0", "stable", b"x", config="ZZZ-Last")]
            )
            ws.write_surface(
                [{"config_string": "ZZZ-Last", "version": "1.0.0", "channel": "stable"}]
            )
            ws.write_catalog(
                [
                    _eligible_product(),
                    _eligible_product(config="ZZZ-Last"),
                ]
            )
            new_bytes = _make_bin(b"brand-new-config\n")
            payload = _release_payload(
                asset_name=_asset_name("1.0.0", "preview"), bin_bytes=new_bytes
            )
            summary = _run(ws, tag="v1.0.0-preview", payload=payload)
            self.assertEqual(summary["source_entry_action"], "add")
            surface = ws.surface_doc()
            self.assertEqual(
                [b["config_string"] for b in surface["builds"]],
                [CONFIG, "ZZZ-Last"],
            )

    def test_idempotent_rerun_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources([])
            # An empty sources array is invalid for the batch importer but
            # fine here: intake builds its entry from the release payload.
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            new_bytes = _make_bin(b"idempotent-build\n")
            payload = _release_payload(
                asset_name=_asset_name("1.0.10", "preview"), bin_bytes=new_bytes
            )
            _run(ws, tag="v1.0.10-preview", payload=payload)
            first_sources = ws.sources_path.read_text(encoding="utf-8")
            first_surface = ws.surface_path.read_text(encoding="utf-8")

            summary = _run(ws, tag="v1.0.10-preview", payload=payload)
            self.assertEqual(
                ws.sources_path.read_text(encoding="utf-8"), first_sources
            )
            self.assertEqual(
                ws.surface_path.read_text(encoding="utf-8"), first_surface
            )
            self.assertEqual(summary["retired_cross_channel"], [])

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            old_bytes = _make_bin(b"old-preview-build\n")
            ws.seed_build("1.0.9", "preview", b"old-preview-build\n")
            ws.write_sources([_source_entry("1.0.9", "preview", old_bytes)])
            ws.write_surface(
                [{"config_string": CONFIG, "version": "1.0.9", "channel": "preview"}]
            )
            ws.write_catalog([_eligible_product()])
            before_sources = ws.sources_path.read_text(encoding="utf-8")
            before_surface = ws.surface_path.read_text(encoding="utf-8")

            payload = _release_payload(
                asset_name=_asset_name("1.0.10", "preview"),
                bin_bytes=_make_bin(b"new-preview-build\n"),
            )
            summary = _run(ws, tag="v1.0.10-preview", payload=payload, dry_run=True)

            self.assertTrue(summary["dry_run"])
            self.assertTrue(
                (ws.configurations / _asset_name("1.0.9", "preview")).exists()
            )
            self.assertFalse(
                (ws.configurations / _asset_name("1.0.10", "preview")).exists()
            )
            self.assertEqual(
                ws.sources_path.read_text(encoding="utf-8"), before_sources
            )
            self.assertEqual(
                ws.surface_path.read_text(encoding="utf-8"), before_surface
            )


class RefusalTests(unittest.TestCase):
    def _workspace(self, tmp: str) -> _Workspace:
        ws = _Workspace(Path(tmp))
        ws.write_sources([])
        ws.write_surface([])
        ws.write_catalog([_eligible_product()])
        return ws

    def _payload(self, version: str = "1.0.10", channel: str = "preview"):
        return _release_payload(
            asset_name=_asset_name(version, channel),
            bin_bytes=_make_bin(b"refusal-build\n"),
        )

    def test_fantriac_config_refused_outright(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            with self.assertRaisesRegex(IntakeError, "FanTRIAC"):
                _run(
                    ws,
                    tag="v1.0.0-preview",
                    payload=self._payload(),
                    config="Ceiling-POE-VentIQ-FanTRIAC-RoomIQ",
                )

    def test_rescue_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            with self.assertRaisesRegex(IntakeError, "Rescue"):
                _run(ws, tag="v1.0.0", payload=self._payload(), config="Rescue")

    def test_config_shape_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            with self.assertRaisesRegex(IntakeError, "valid config token"):
                _run(
                    ws,
                    tag="v1.0.0",
                    payload=self._payload(),
                    config="Bad Config; rm -rf",
                )

    def test_channel_outside_active_set_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            with self.assertRaisesRegex(IntakeError, "not an intake channel"):
                _run(
                    ws,
                    tag="v1.0.0-beta",
                    payload=self._payload(),
                )

    def test_config_absent_from_vendored_catalog_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources([])
            ws.write_surface([])
            ws.write_catalog([])
            with self.assertRaisesRegex(IntakeError, "not in the vendored catalog"):
                _run(ws, tag="v1.0.10-preview", payload=self._payload())

    def test_upstream_status_alone_never_authorises(self):
        # The PR #607 pin: production/preview status with NEITHER WebFlash-owned
        # lane set must be refused — upstream lifecycle labels are not
        # authorisation.
        for status in ("production", "preview"):
            with tempfile.TemporaryDirectory() as tmp:
                ws = _Workspace(Path(tmp))
                ws.write_sources([])
                ws.write_surface([])
                ws.write_catalog(
                    [
                        _eligible_product(
                            status=status,
                            webflash_build_matrix=False,
                        )
                    ]
                )
                with self.assertRaisesRegex(
                    IntakeError, "WebFlash-owned eligibility lane"
                ):
                    _run(ws, tag="v1.0.10-preview", payload=self._payload())

    def test_explicit_eligibility_lane_authorises(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources([])
            ws.write_surface([])
            ws.write_catalog(
                [
                    _eligible_product(
                        status="hardware-pending",
                        webflash_build_matrix=False,
                        webflash_import_eligibility={"eligible": True},
                    )
                ]
            )
            summary = _run(ws, tag="v1.0.10-preview", payload=self._payload())
            self.assertEqual(summary["version"], "1.0.10")

    def test_delisted_config_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources(
                [], delisted=[{"config_string": CONFIG, "delisted_reason": "x"}]
            )
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            with self.assertRaisesRegex(IntakeError, "delisted_sources"):
                _run(ws, tag="v1.0.10-preview", payload=self._payload())

    def test_retired_artifact_never_reappears(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources([])
            ws.write_surface(
                [],
                retired=[
                    {
                        "config_string": CONFIG,
                        "version": "1.0.10",
                        "channel": "preview",
                        "retired_in": "#553",
                        "reason": "x",
                    }
                ],
            )
            ws.write_catalog([_eligible_product()])
            with self.assertRaisesRegex(IntakeError, "never reappear"):
                _run(ws, tag="v1.0.10-preview", payload=self._payload())

    def test_on_disk_downgrade_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.seed_build("1.0.11", "preview", b"newer-build\n")
            ws.write_sources([])
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            with self.assertRaisesRegex(IntakeError, "never downgrades"):
                _run(ws, tag="v1.0.10-preview", payload=self._payload())

    def test_equal_version_on_other_channel_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.seed_build("1.0.10", "stable", b"stable-build\n")
            ws.write_sources([])
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            with self.assertRaisesRegex(IntakeError, "two builds for one"):
                _run(ws, tag="v1.0.10-preview", payload=self._payload())

    def test_newer_source_entry_on_other_channel_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources(
                [_source_entry("1.0.11", "stable", b"declared-newer\n")]
            )
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            with self.assertRaisesRegex(IntakeError, "not strictly older"):
                _run(ws, tag="v1.0.10-preview", payload=self._payload())

    def test_declared_newer_version_on_same_key_refused(self):
        # A declared-but-not-yet-imported NEWER version on the SAME
        # (repo, config, channel) key must not be silently downgraded.
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources(
                [_source_entry("1.0.11", "preview", b"declared-only\n")]
            )
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            with self.assertRaisesRegex(IntakeError, "never downgrades to"):
                _run(ws, tag="v1.0.10-preview", payload=self._payload())

    def test_replaced_upstream_asset_never_repins_declared_version(self):
        # Same version + channel already declared with a pin; upstream now
        # serves different bytes (lock-step checksums). Intake must refuse to
        # re-pin — the pinned SHA is the trust anchor.
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources(
                [_source_entry("1.0.10", "preview", b"original-bytes\n")]
            )
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            replaced = _release_payload(
                asset_name=_asset_name("1.0.10", "preview"),
                bin_bytes=_make_bin(b"replaced-bytes\n"),
            )
            with self.assertRaisesRegex(IntakeError, "refuses to re-pin"):
                _run(ws, tag="v1.0.10-preview", payload=replaced)

    def test_replaced_upstream_asset_never_overwrites_staged_bytes(self):
        # The staged .bin for this exact version exists with different bytes
        # than the release now serves: never overwrite a published .bin.
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.seed_build("1.0.10", "preview", b"original-bytes\n")
            ws.write_sources([])
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            replaced = _release_payload(
                asset_name=_asset_name("1.0.10", "preview"),
                bin_bytes=_make_bin(b"replaced-bytes\n"),
            )
            with self.assertRaisesRegex(IntakeError, "bytes never change"):
                _run(ws, tag="v1.0.10-preview", payload=replaced)

    def test_same_config_from_different_repo_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            other = _source_entry("1.0.0", "stable", b"other-repo\n")
            other["source_repo"] = "someone/else"
            ws.write_sources([other])
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            with self.assertRaisesRegex(IntakeError, "different source repo"):
                _run(ws, tag="v1.0.10-preview", payload=self._payload())


class SurfaceFixtureHelpersTests(unittest.TestCase):
    def test_update_appends_retired_once(self):
        fixture = {
            "schema_version": 1,
            "builds": [
                {"config_string": CONFIG, "version": "1.0.9", "channel": "stable"}
            ],
            "retired": [],
        }
        retired = [
            {
                "config_string": CONFIG,
                "version": "1.0.9",
                "channel": "stable",
                "file_channel": "stable",
            }
        ]
        once = intake.update_surface_fixture(
            fixture,
            config_string=CONFIG,
            version="1.0.10",
            channel="preview",
            retired_builds=retired,
        )
        twice = intake.update_surface_fixture(
            once,
            config_string=CONFIG,
            version="1.0.10",
            channel="preview",
            retired_builds=retired,
        )
        self.assertEqual(len(twice["retired"]), 1)
        entry = twice["retired"][0]
        # file_channel equals the served channel here, so it is omitted.
        self.assertNotIn("file_channel", entry)
        self.assertEqual(entry["retired_in"], intake.RETIRED_IN_PLACEHOLDER)

    def test_existing_entries_are_never_edited(self):
        sentinel = {
            "config_string": "Other-Config",
            "version": "1.0.0",
            "channel": "preview",
            "retired_in": "#553",
            "reason": "keep me",
        }
        fixture = {
            "schema_version": 1,
            "builds": [],
            "retired": [dict(sentinel)],
        }
        out = intake.update_surface_fixture(
            fixture,
            config_string=CONFIG,
            version="1.0.10",
            channel="preview",
            retired_builds=[],
        )
        self.assertIn(sentinel, out["retired"])

    def test_set_retired_in_replaces_placeholders(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "expected-surface.json"
            path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "builds": [],
                        "retired": [
                            {
                                "config_string": CONFIG,
                                "version": "1.0.9",
                                "channel": "stable",
                                "retired_in": intake.RETIRED_IN_PLACEHOLDER,
                                "reason": "x",
                            },
                            {
                                "config_string": "Other-Config",
                                "version": "1.0.0",
                                "channel": "preview",
                                "retired_in": "#553",
                                "reason": "y",
                            },
                        ],
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            count = intake.set_retired_in(path, "#612")
            self.assertEqual(count, 1)
            doc = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(doc["retired"][0]["retired_in"], "#612")
            self.assertEqual(doc["retired"][1]["retired_in"], "#553")

    def test_run_scoped_label_and_scoped_resolution(self):
        # The workflow labels this run's retired entries with its run URL and
        # later resolves ONLY entries carrying that label — a stray
        # placeholder from another change set is never rewritten.
        label = "https://github.example/actions/runs/12345"
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            old_bytes = _make_bin(b"old-stable-build\n")
            ws.seed_build("1.0.9", "stable", b"old-stable-build\n")
            ws.write_sources([_source_entry("1.0.9", "stable", old_bytes)])
            ws.write_surface(
                [
                    {
                        "config_string": CONFIG,
                        "version": "1.0.9",
                        "channel": "stable",
                    }
                ],
                retired=[
                    {
                        "config_string": "Other-Config",
                        "version": "1.0.0",
                        "channel": "preview",
                        "retired_in": intake.RETIRED_IN_PLACEHOLDER,
                        "reason": "stray placeholder from another change set",
                    }
                ],
            )
            ws.write_catalog([_eligible_product()])
            payload = _release_payload(
                asset_name=_asset_name("1.0.10", "preview"),
                bin_bytes=_make_bin(b"new-preview-build\n"),
            )
            summary = _run(
                ws,
                tag="v1.0.10-preview",
                payload=payload,
                retired_in_label=label,
            )
            self.assertEqual(summary["retired_in_label"], label)
            self.assertFalse(summary["retired_in_placeholder"])

            count = intake.set_retired_in(ws.surface_path, "#700", match=label)
            self.assertEqual(count, 1)
            doc = ws.surface_doc()
            by_config = {r["config_string"]: r for r in doc["retired"]}
            self.assertEqual(by_config[CONFIG]["retired_in"], "#700")
            # The stray placeholder from another change set is untouched.
            self.assertEqual(
                by_config["Other-Config"]["retired_in"],
                intake.RETIRED_IN_PLACEHOLDER,
            )

    def test_set_retired_in_rejects_non_pr_reference(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "expected-surface.json"
            path.write_text(
                json.dumps({"schema_version": 1, "builds": [], "retired": []}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(IntakeError, "PR reference"):
                intake.set_retired_in(path, "not-a-pr")


class CatalogRefreshWiringTests(unittest.TestCase):
    def test_refresh_called_with_supplied_catalog_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = _Workspace(Path(tmp))
            ws.write_sources([])
            ws.write_surface([])
            ws.write_catalog([_eligible_product()])
            payload = _release_payload(
                asset_name=_asset_name("1.0.10", "preview"),
                bin_bytes=_make_bin(b"refresh-build\n"),
            )
            upstream_catalog = {"schema_version": 1, "products": []}
            asset_bytes = payload["_asset_bytes"]

            with mock.patch.object(
                intake.add_source,
                "download_text",
                side_effect=lambda *_a, **_k: payload["_checksum_text"],
            ), mock.patch.object(
                intake.importer,
                "download_to_path",
                side_effect=lambda url, dest, _t: dest.write_bytes(
                    asset_bytes[url.rsplit("/", 1)[-1]]
                ),
            ), mock.patch.object(
                intake.catalog_refresh,
                "refresh_catalog_fixture",
                return_value={"changed": True, "changes": []},
            ) as refresh_mock:
                summary = intake.run_intake(
                    source_repo=SOURCE_REPO,
                    raw_tag="v1.0.10-preview",
                    config_string=CONFIG,
                    channel=None,
                    version=None,
                    token=None,
                    dry_run=False,
                    sources_path=ws.sources_path,
                    policy_path=None,
                    firmware_dir=ws.firmware_dir,
                    surface_fixture_path=ws.surface_path,
                    catalog_fixture_path=ws.catalog_path,
                    release_payload=payload,
                    catalog_payload=upstream_catalog,
                    skip_catalog_refresh=False,
                )
            refresh_mock.assert_called_once()
            _, kwargs = refresh_mock.call_args
            self.assertIs(kwargs["upstream_catalog"], upstream_catalog)
            self.assertTrue(summary["catalog_fixture_refreshed"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
