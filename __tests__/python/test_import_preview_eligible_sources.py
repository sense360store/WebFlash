"""Unit tests for ``scripts/import-preview-eligible-sources.py``.

WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — the preview-eligible import automation.
These tests exercise the discovery + guarded-planning logic hermetically (no
network) with synthetic catalog / sources / on-disk states, plus a handful of
assertions against the live committed repo state. The actual download path is
delegated to ``import_source_entry`` (covered by
``test_import_firmware_sources.py``) and is mocked here.

Required coverage (from the PR spec):

* automation discovers FanRelay / FanPWM / FanDAC eligibility
* already-imported FanRelay / FanPWM (and now FanDAC) are idempotent
* FanDAC can be imported
* FanTRIAC is refused (even if flagged eligible)
* missing configs are skipped with an explicit reason
* REQUIRED_CONFIGS remains production-only / unchanged
* Simple install (stable Bathroom PoE) is never auto-imported
* preview acknowledgement posture is preserved (only preview-channel sources act)
* SHA256 pinning is mandatory
* overwrites are blocked unless the bytes are identical
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


# Mirror the runtime load order so the automation reuses the same siblings.
_load_module("gen_manifests", SCRIPTS_DIR / "gen-manifests.py")
_load_module("sync_releases", SCRIPTS_DIR / "sync-from-releases.py")
_load_module("import_firmware_sources", SCRIPTS_DIR / "import-firmware-sources.py")
auto = _load_module(
    "import_preview_eligible_sources", SCRIPTS_DIR / "import-preview-eligible-sources.py"
)

FANRELAY = "Ceiling-POE-VentIQ-FanRelay-RoomIQ"
FANPWM = "Ceiling-POE-FanPWM"
FANDAC = "Ceiling-POE-FanDAC"
FANTRIAC = "Ceiling-POE-VentIQ-FanTRIAC-RoomIQ"
RELEASE_ONE = "Ceiling-POE-VentIQ-RoomIQ"

VALID_PIN = "a" * 64


# ---- Synthetic builders -------------------------------------------------


def _product(config_string: str, **overrides: Any) -> Dict[str, Any]:
    base: Dict[str, Any] = {
        "config_string": config_string,
        "status": "hardware-pending",
        "channel": "preview",
        "delivery_lane": "manual-preview",
        "artifact_name": f"Sense360-{config_string}-v1.0.0-preview.bin",
        "version": "1.0.0",
        "webflash_build_matrix": False,
        "webflash_import_eligibility": {"eligible": True},
    }
    base.update(overrides)
    return base


def _source(config_string: str, **overrides: Any) -> Dict[str, Any]:
    base: Dict[str, Any] = {
        "source_repo": "sense360store/esphome-public",
        "release_tag": "v1.0.0-preview",
        "channel": "preview",
        "config_string": config_string,
        "asset_name": f"Sense360-{config_string}-v1.0.0-preview.bin",
        "expected_sha256": VALID_PIN,
        "block_tokens": ["FanTRIAC", "LED"],
    }
    base.update(overrides)
    return base


def _plan(products, sources, configurations_dir: Path, *, allow_triac=False):
    return auto.plan_targets(
        {"products": products},
        sources,
        configurations_dir=configurations_dir,
        allow_triac=allow_triac,
    )


def _by_config(targets: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {t["config_string"]: t for t in targets}


class _TmpConfigDir:
    """Context manager yielding an empty firmware/configurations-like dir."""

    def __enter__(self) -> Path:
        self._tmp = tempfile.TemporaryDirectory()
        return Path(self._tmp.name)

    def __exit__(self, *exc):
        self._tmp.cleanup()


def _write_bin(directory: Path, asset_name: str, payload: bytes) -> str:
    path = directory / asset_name
    path.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


# ---- Discovery ----------------------------------------------------------


class DiscoveryTests(unittest.TestCase):
    def test_discovers_the_three_fan_drivers_against_live_state(self):
        catalog = auto.load_catalog(
            REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
        )
        sources = auto.importer.load_sources(REPO_ROOT / "firmware" / "sources.json")
        targets = auto.plan_targets(
            catalog,
            sources,
            configurations_dir=REPO_ROOT / "firmware" / "configurations",
        )
        discovered = {t["config_string"] for t in targets}
        self.assertIn(FANRELAY, discovered)
        self.assertIn(FANPWM, discovered)
        self.assertIn(FANDAC, discovered)
        # FanTRIAC is NOT eligible upstream → never discovered.
        self.assertNotIn(FANTRIAC, discovered)
        # The stable Release-One config is not in the automation's scope.
        self.assertNotIn(RELEASE_ONE, discovered)

    def test_status_preview_without_flag_is_not_discovered(self):
        # The first preview batch / LED preview are eligible by catalog *status*,
        # not by the explicit flag — the automation deliberately does NOT manage
        # them (they were imported by the plain importer).
        catalog = auto.load_catalog(
            REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
        )
        sources = auto.importer.load_sources(REPO_ROOT / "firmware" / "sources.json")
        targets = auto.plan_targets(
            catalog,
            sources,
            configurations_dir=REPO_ROOT / "firmware" / "configurations",
        )
        discovered = {t["config_string"] for t in targets}
        for status_preview in (
            "Ceiling-POE-AirIQ-RoomIQ",
            "Ceiling-POE-RoomIQ",
            "Ceiling-POE-RoomIQ-LED",
            "Ceiling-POE-VentIQ-RoomIQ-LED",
        ):
            self.assertNotIn(status_preview, discovered)

    def test_eligibility_helpers(self):
        self.assertTrue(
            auto.is_explicit_preview_import_eligible(
                {"webflash_import_eligibility": {"eligible": True}}
            )
        )
        self.assertFalse(
            auto.is_explicit_preview_import_eligible(
                {"webflash_import_eligibility": {"eligible": False}}
            )
        )
        self.assertFalse(auto.is_explicit_preview_import_eligible({"status": "preview"}))
        # is_catalog_import_eligible also accepts production/preview status.
        self.assertTrue(auto.is_catalog_import_eligible({"status": "production"}))
        self.assertTrue(auto.is_catalog_import_eligible({"status": "preview"}))
        self.assertFalse(auto.is_catalog_import_eligible({"status": "blocked"}))


# ---- Idempotency / import / overwrite -----------------------------------


class PlanActionTests(unittest.TestCase):
    def test_fandac_can_be_imported_when_absent(self):
        with _TmpConfigDir() as cfg:
            targets = _plan([_product(FANDAC)], [_source(FANDAC)], cfg)
            t = _by_config(targets)[FANDAC]
            self.assertEqual(t["action"], auto.ACTION_IMPORT)
            self.assertFalse(t["on_disk"])

    def test_already_imported_is_idempotent(self):
        with _TmpConfigDir() as cfg:
            asset = f"Sense360-{FANPWM}-v1.0.0-preview.bin"
            sha = _write_bin(cfg, asset, b"x" * 200_000)
            targets = _plan(
                [_product(FANPWM)], [_source(FANPWM, expected_sha256=sha)], cfg
            )
            t = _by_config(targets)[FANPWM]
            self.assertEqual(t["action"], auto.ACTION_IDEMPOTENT)
            self.assertTrue(t["on_disk"])

    def test_live_fan_drivers_are_idempotent_on_disk(self):
        # FanRelay / FanPWM / FanDAC are all on disk in the committed repo with
        # SHAs matching their pins → a plan against the live tree is a clean no-op.
        catalog = auto.load_catalog(
            REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
        )
        sources = auto.importer.load_sources(REPO_ROOT / "firmware" / "sources.json")
        targets = auto.plan_targets(
            catalog,
            sources,
            configurations_dir=REPO_ROOT / "firmware" / "configurations",
        )
        by = _by_config(targets)
        for cs in (FANRELAY, FANPWM, FANDAC):
            self.assertEqual(by[cs]["action"], auto.ACTION_IDEMPOTENT, cs)

    def test_overwrite_blocked_when_sha_differs(self):
        with _TmpConfigDir() as cfg:
            asset = f"Sense360-{FANDAC}-v1.0.0-preview.bin"
            _write_bin(cfg, asset, b"different-bytes" * 10_000)
            targets = _plan(
                [_product(FANDAC)], [_source(FANDAC, expected_sha256="b" * 64)], cfg
            )
            t = _by_config(targets)[FANDAC]
            self.assertEqual(t["action"], auto.ACTION_REFUSE)
            self.assertIn("differs", t["reason"])
            self.assertIn("overwrite", t["reason"].lower())

    def test_overwrite_allowed_when_identical(self):
        with _TmpConfigDir() as cfg:
            asset = f"Sense360-{FANDAC}-v1.0.0-preview.bin"
            sha = _write_bin(cfg, asset, b"identical" * 30_000)
            targets = _plan(
                [_product(FANDAC)], [_source(FANDAC, expected_sha256=sha)], cfg
            )
            t = _by_config(targets)[FANDAC]
            self.assertEqual(t["action"], auto.ACTION_IDEMPOTENT)


# ---- Guardrails ---------------------------------------------------------


class GuardrailTests(unittest.TestCase):
    def test_fantriac_is_refused_even_when_flagged_eligible(self):
        # Simulate a (hypothetical) future fixture that flips FanTRIAC eligible.
        with _TmpConfigDir() as cfg:
            targets = _plan([_product(FANTRIAC)], [_source(FANTRIAC)], cfg)
            t = _by_config(targets)[FANTRIAC]
            self.assertEqual(t["action"], auto.ACTION_REFUSE)
            self.assertIn("TRIAC", t["reason"])

    def test_fantriac_refused_without_explicit_opt_in_even_with_allow_flag(self):
        with _TmpConfigDir() as cfg:
            # --allow-triac alone is not enough; the catalog opt-in is also required.
            targets = _plan(
                [_product(FANTRIAC)], [_source(FANTRIAC)], cfg, allow_triac=True
            )
            self.assertEqual(_by_config(targets)[FANTRIAC]["action"], auto.ACTION_REFUSE)

    def test_fantriac_importable_only_with_both_allow_flag_and_catalog_opt_in(self):
        with _TmpConfigDir() as cfg:
            product = _product(FANTRIAC, triac_preview_import_allowed=True)
            targets = _plan([product], [_source(FANTRIAC)], cfg, allow_triac=True)
            # With both the CLI flag AND the catalog opt-in the TRIAC guard yields
            # (it then proceeds through the normal gates → import, since absent).
            self.assertEqual(_by_config(targets)[FANTRIAC]["action"], auto.ACTION_IMPORT)

    def test_missing_source_declaration_is_skipped_with_reason(self):
        with _TmpConfigDir() as cfg:
            # Eligible catalog entry, but NO matching firmware/sources.json entry.
            targets = _plan([_product("Ceiling-POE-FanFuture")], [], cfg)
            t = _by_config(targets)["Ceiling-POE-FanFuture"]
            self.assertEqual(t["action"], auto.ACTION_SKIP)
            self.assertIn("sources.json", t["reason"])

    def test_missing_pin_is_refused(self):
        with _TmpConfigDir() as cfg:
            src = _source(FANDAC)
            del src["expected_sha256"]
            targets = _plan([_product(FANDAC)], [src], cfg)
            t = _by_config(targets)[FANDAC]
            self.assertEqual(t["action"], auto.ACTION_REFUSE)
            self.assertIn("expected_sha256", t["reason"])

    def test_malformed_pin_is_refused(self):
        with _TmpConfigDir() as cfg:
            targets = _plan(
                [_product(FANDAC)], [_source(FANDAC, expected_sha256="not-a-sha")], cfg
            )
            self.assertEqual(_by_config(targets)[FANDAC]["action"], auto.ACTION_REFUSE)

    def test_stable_full_release_is_refused(self):
        with _TmpConfigDir() as cfg:
            # A (hypothetical) flagged-but-stable entry must never auto-import.
            product = _product(
                "Ceiling-POE-Synthetic", status="production", channel="stable"
            )
            targets = _plan(
                [product], [_source("Ceiling-POE-Synthetic", channel="stable")], cfg
            )
            t = _by_config(targets)["Ceiling-POE-Synthetic"]
            self.assertEqual(t["action"], auto.ACTION_REFUSE)
            self.assertIn("stable", t["reason"].lower())

    def test_source_channel_must_be_preview(self):
        with _TmpConfigDir() as cfg:
            targets = _plan(
                [_product(FANDAC)], [_source(FANDAC, channel="stable")], cfg
            )
            self.assertEqual(_by_config(targets)[FANDAC]["action"], auto.ACTION_REFUSE)


# ---- Invariants ---------------------------------------------------------


class InvariantTests(unittest.TestCase):
    def _live_report(self):
        catalog = auto.load_catalog(
            REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
        )
        sources = auto.importer.load_sources(REPO_ROOT / "firmware" / "sources.json")
        targets = auto.plan_targets(
            catalog,
            sources,
            configurations_dir=REPO_ROOT / "firmware" / "configurations",
        )
        required = auto.parse_required_configs(
            REPO_ROOT / ".github" / "workflows" / "firmware-publish.yml"
        )
        return auto.build_report(
            targets=targets,
            apply=False,
            required_before=required,
            required_after=required,
        )

    def test_required_configs_is_production_only_and_unchanged(self):
        report = self._live_report()
        self.assertEqual(
            report["required_configs_before"],
            ["Ceiling-POE-VentIQ-RoomIQ", "Rescue"],
        )
        self.assertTrue(report["summary"]["required_configs_unchanged"])
        self.assertTrue(report["ok"])

    def test_no_discovered_target_is_production_or_release_one(self):
        # Simple install (stable Bathroom PoE) must never be a target, and no
        # discovered target may be a production-status entry.
        catalog = auto.load_catalog(
            REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
        )
        sources = auto.importer.load_sources(REPO_ROOT / "firmware" / "sources.json")
        targets = auto.plan_targets(
            catalog,
            sources,
            configurations_dir=REPO_ROOT / "firmware" / "configurations",
        )
        for t in targets:
            self.assertNotEqual(t["config_string"], RELEASE_ONE)
            self.assertNotEqual(t["status"], "production")

    def test_every_acted_on_target_is_preview_channel(self):
        # Preview acknowledgement posture is preserved: the automation only ever
        # imports / treats-as-idempotent preview-channel builds, so the runtime
        # channel:preview acknowledgement gate still governs them.
        catalog = auto.load_catalog(
            REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
        )
        sources = auto.importer.load_sources(REPO_ROOT / "firmware" / "sources.json")
        targets = auto.plan_targets(
            catalog,
            sources,
            configurations_dir=REPO_ROOT / "firmware" / "configurations",
        )
        for t in targets:
            if t["action"] in (auto.ACTION_IMPORT, auto.ACTION_IDEMPOTENT):
                self.assertEqual(t["channel"], "preview", t["config_string"])

    def test_summary_ok_flips_false_on_refusal(self):
        targets = [{"config_string": "X", "action": auto.ACTION_REFUSE, "reason": "r"}]
        report = auto.build_report(
            targets=targets, apply=False, required_before=[], required_after=[]
        )
        self.assertFalse(report["ok"])

    def test_summary_ok_flips_false_on_required_configs_change(self):
        targets = [{"config_string": "X", "action": auto.ACTION_IDEMPOTENT, "reason": "r"}]
        report = auto.build_report(
            targets=targets,
            apply=False,
            required_before=["A"],
            required_after=["A", "B"],
        )
        self.assertFalse(report["ok"])


# ---- Apply (mocked network) ---------------------------------------------


class ApplyTests(unittest.TestCase):
    def test_execute_imports_calls_import_source_entry_for_import_targets(self):
        sources_by_config = {FANDAC: _source(FANDAC)}
        targets = [
            {"config_string": FANDAC, "action": auto.ACTION_IMPORT, "reason": "go"},
            {"config_string": FANPWM, "action": auto.ACTION_IDEMPOTENT, "reason": "noop"},
        ]
        fake_written = Path("/tmp/Sense360-Ceiling-POE-FanDAC-v1.0.0-preview.bin")
        with mock.patch.object(
            auto.importer, "import_source_entry", return_value=fake_written
        ) as m:
            auto.execute_imports(
                targets,
                sources_by_config,
                repo_root=REPO_ROOT,
                token=None,
                imported_at="2026-06-03T00:00:00+00:00",
                release_payloads={},
            )
        # Only the IMPORT target triggers a download; the idempotent one does not.
        self.assertEqual(m.call_count, 1)
        self.assertTrue(targets[0]["imported"])
        self.assertEqual(targets[0]["written_path"], str(fake_written))
        self.assertNotIn("imported", targets[1])

    def test_execute_imports_records_import_failure(self):
        sources_by_config = {FANDAC: _source(FANDAC)}
        targets = [{"config_string": FANDAC, "action": auto.ACTION_IMPORT, "reason": "go"}]
        with mock.patch.object(
            auto.importer,
            "import_source_entry",
            side_effect=auto.ImportValidationError("boom"),
        ):
            auto.execute_imports(
                targets,
                sources_by_config,
                repo_root=REPO_ROOT,
                token=None,
                imported_at="2026-06-03T00:00:00+00:00",
            )
        self.assertFalse(targets[0]["imported"])
        self.assertIn("boom", targets[0]["import_error"])
        report = auto.build_report(
            targets=targets, apply=True, required_before=[], required_after=[]
        )
        self.assertFalse(report["ok"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
