"""Unit tests for ``scripts/refresh-product-catalog-fixture.py``.

The refresh keeps the vendored product-catalog fixture in lock-step with the
regenerated manifest on an import. These tests pin the field-level sync
contract: only the identity-tracking fields move, only when upstream declares
them, the curated entry *set* is never added to or removed from, and curated
fields upstream does not carry (e.g. the manual-preview fan
``webflash_import_eligibility`` block) are preserved.

Hermetic: every test feeds an in-memory upstream catalog dict, no network.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
FIXTURE_PATH = REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


refresh = _load_module(
    "refresh_product_catalog_fixture",
    SCRIPTS_DIR / "refresh-product-catalog-fixture.py",
)


def _load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _upstream(products) -> dict:
    return {"schema_version": 1, "products": products}


class RefreshFixtureDataTests(unittest.TestCase):
    def test_syncs_version_and_artifact_name_for_matching_config(self):
        fixture = _load_fixture()
        upstream = _upstream(
            [
                {
                    "config_string": "Ceiling-POE-VentIQ-RoomIQ",
                    "status": "production",
                    "channel": "stable",
                    "version": "9.9.9",
                    "artifact_name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-v9.9.9-stable.bin",
                }
            ]
        )
        new_fixture, changes = refresh.refresh_fixture_data(fixture, upstream)
        entry = next(
            p
            for p in new_fixture["products"]
            if p.get("config_string") == "Ceiling-POE-VentIQ-RoomIQ"
        )
        self.assertEqual(entry["version"], "9.9.9")
        self.assertEqual(
            entry["artifact_name"],
            "Sense360-Ceiling-POE-VentIQ-RoomIQ-v9.9.9-stable.bin",
        )
        fields = {(c["identifier"], c["field"]) for c in changes}
        self.assertIn(("Ceiling-POE-VentIQ-RoomIQ", "version"), fields)
        self.assertIn(("Ceiling-POE-VentIQ-RoomIQ", "artifact_name"), fields)

    def test_never_adds_or_removes_products(self):
        fixture = _load_fixture()
        original_count = len(fixture["products"])
        # Upstream carries a brand-new config not in the curated fixture.
        upstream = _upstream(
            [
                {
                    "config_string": "Ceiling-POE-Brand-New",
                    "status": "production",
                    "channel": "stable",
                    "version": "9.9.9",
                    "artifact_name": "Sense360-Ceiling-POE-Brand-New-v9.9.9-stable.bin",
                }
            ]
        )
        new_fixture, _ = refresh.refresh_fixture_data(fixture, upstream)
        self.assertEqual(len(new_fixture["products"]), original_count)
        configs = {p.get("config_string") for p in new_fixture["products"]}
        self.assertNotIn("Ceiling-POE-Brand-New", configs)

    def test_does_not_overwrite_curated_field_upstream_omits(self):
        # The manual-preview fan entries carry a WebFlash-side version that
        # upstream does NOT declare. Upstream silence must never null it out.
        fixture = _load_fixture()
        fan_cs = "Ceiling-POE-FanPWM"
        before = next(
            p for p in fixture["products"] if p.get("config_string") == fan_cs
        )
        self.assertEqual(before["version"], "1.0.0")
        upstream = _upstream(
            [
                {
                    "config_string": fan_cs,
                    "status": "hardware-pending",
                    # no version / artifact_name / channel upstream
                }
            ]
        )
        new_fixture, changes = refresh.refresh_fixture_data(fixture, upstream)
        after = next(
            p for p in new_fixture["products"] if p.get("config_string") == fan_cs
        )
        self.assertEqual(after["version"], "1.0.0")
        self.assertEqual(after.get("artifact_name"), before.get("artifact_name"))
        self.assertEqual([c for c in changes if c["identifier"] == fan_cs], [])

    def test_preserves_non_sync_fields(self):
        # webflash_import_eligibility / notes / hardware etc. must be untouched
        # even when version is synced.
        fixture = _load_fixture()
        fan_cs = "Ceiling-POE-VentIQ-FanPWM-RoomIQ"
        before = copy.deepcopy(
            next(p for p in fixture["products"] if p.get("config_string") == fan_cs)
        )
        upstream = _upstream(
            [
                {
                    "config_string": fan_cs,
                    "status": "hardware-pending",
                    "version": "2.0.0",  # upstream now declares a version
                }
            ]
        )
        new_fixture, _ = refresh.refresh_fixture_data(fixture, upstream)
        after = next(
            p for p in new_fixture["products"] if p.get("config_string") == fan_cs
        )
        self.assertEqual(after["version"], "2.0.0")
        self.assertEqual(
            after.get("webflash_import_eligibility"),
            before.get("webflash_import_eligibility"),
        )

    def test_matches_legacy_entry_by_legacy_config_id(self):
        fixture = _load_fixture()
        legacy = next(
            p
            for p in fixture["products"]
            if p.get("status") == "legacy-compatible"
        )
        legacy_id = legacy["legacy_config_id"]
        upstream = _upstream(
            [
                {
                    "legacy_config_id": legacy_id,
                    "status": "legacy-compatible",
                }
            ]
        )
        # No sync fields present upstream -> no change, but it must MATCH (not
        # error) and leave the entry intact.
        new_fixture, changes = refresh.refresh_fixture_data(fixture, upstream)
        self.assertEqual([c for c in changes if c["identifier"].startswith("legacy:")], [])
        still = next(
            p
            for p in new_fixture["products"]
            if p.get("legacy_config_id") == legacy_id
        )
        self.assertEqual(still["status"], "legacy-compatible")

    def test_does_not_mutate_input_fixture(self):
        fixture = _load_fixture()
        snapshot = copy.deepcopy(fixture)
        upstream = _upstream(
            [
                {
                    "config_string": "Ceiling-POE-VentIQ-RoomIQ",
                    "status": "production",
                    "channel": "stable",
                    "version": "5.5.5",
                    "artifact_name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-v5.5.5-stable.bin",
                }
            ]
        )
        refresh.refresh_fixture_data(fixture, upstream)
        self.assertEqual(fixture, snapshot)

    def test_malformed_upstream_raises(self):
        with self.assertRaises(refresh.CatalogRefreshError):
            refresh.refresh_fixture_data(_load_fixture(), {"no_products": True})


class RefreshCatalogFixtureIoTests(unittest.TestCase):
    def _write_temp_fixture(self, data: dict) -> Path:
        tmp = Path(tempfile.mkdtemp()) / "fixture.json"
        tmp.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        return tmp

    def test_writes_when_changed_and_is_idempotent(self):
        fixture = _load_fixture()
        tmp = self._write_temp_fixture(fixture)
        upstream = _upstream(
            [
                {
                    "config_string": "Ceiling-POE-VentIQ-RoomIQ",
                    "status": "production",
                    "channel": "stable",
                    "version": "9.9.9",
                    "artifact_name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-v9.9.9-stable.bin",
                }
            ]
        )
        first = refresh.refresh_catalog_fixture(tmp, upstream_catalog=upstream)
        self.assertTrue(first["changed"])
        on_disk = json.loads(tmp.read_text(encoding="utf-8"))
        entry = next(
            p
            for p in on_disk["products"]
            if p.get("config_string") == "Ceiling-POE-VentIQ-RoomIQ"
        )
        self.assertEqual(entry["version"], "9.9.9")
        # Second pass: already in sync, no change.
        second = refresh.refresh_catalog_fixture(tmp, upstream_catalog=upstream)
        self.assertFalse(second["changed"])

    def test_dry_run_does_not_write(self):
        fixture = _load_fixture()
        tmp = self._write_temp_fixture(fixture)
        before = tmp.read_text(encoding="utf-8")
        upstream = _upstream(
            [
                {
                    "config_string": "Ceiling-POE-VentIQ-RoomIQ",
                    "status": "production",
                    "channel": "stable",
                    "version": "9.9.9",
                    "artifact_name": "Sense360-Ceiling-POE-VentIQ-RoomIQ-v9.9.9-stable.bin",
                }
            ]
        )
        summary = refresh.refresh_catalog_fixture(
            tmp, upstream_catalog=upstream, dry_run=True
        )
        self.assertTrue(summary["changed"])
        self.assertEqual(tmp.read_text(encoding="utf-8"), before)

    def test_serialisation_round_trips_committed_fixture(self):
        # The serialiser must reproduce the committed fixture byte-for-byte when
        # nothing changes, so a refresh only ever shows real field diffs.
        raw = FIXTURE_PATH.read_text(encoding="utf-8")
        self.assertEqual(refresh._serialise(json.loads(raw)), raw)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
