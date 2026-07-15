"""Unit tests for ``scripts/refresh-sot-mirror.py``.

WEBFLASH-TAXONOMY-RECONCILE-001 — the SOT commercial-surface mirror must use
SOT's OWN lifecycle semantics (SOT scripts/validate.py:
``COMMERCIAL_STATUSES = {"available"}`` — the statuses meaning "a customer
can buy this") and never invent a second commercial model inside WebFlash:

  - ``commercially_available`` and ``buyable`` both derive from
    ``status == "available"``; a non-available record always mirrors as
    non-buyable.
  - An explicit ``buyable`` field in SOT may only REINFORCE the derived
    state; a contradiction fails the refresh loudly.
  - The generated commercial-posture note is state-safe: it stays correct
    after a future refresh where a bundle becomes available/buyable, so it
    must not hard-code a "no bundle is available" style current-state claim.

The lifecycle helpers are pure functions, so these tests run hermetically
(stdlib only, no PyYAML, no git repository). The one test that compares the
checked-in mirror against a real merged SOT checkout is opt-in via the
``SOT_CHECKOUT_PATH`` environment variable and skips cleanly in CI.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "refresh-sot-mirror.py"
MIRROR_PATH = REPO_ROOT / "scripts" / "data" / "sot-commercial-mirror.json"


def _load_module():
    spec = importlib.util.spec_from_file_location("refresh_sot_mirror", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MOD = _load_module()


class DeriveCommercialStateTests(unittest.TestCase):
    """The pure lifecycle normalization rule, case by case."""

    def test_available_without_explicit_buyable_derives_buyable_true(self):
        available, buyable = MOD.derive_commercial_state(
            {"id": "b", "status": "available"}
        )
        self.assertTrue(available)
        self.assertTrue(buyable)

    def test_available_with_explicit_buyable_true_reinforces(self):
        available, buyable = MOD.derive_commercial_state(
            {"id": "b", "status": "available", "buyable": True}
        )
        self.assertTrue(available)
        self.assertTrue(buyable)

    def test_available_with_explicit_buyable_false_fails(self):
        with self.assertRaises(MOD.SotSchemaContradiction) as ctx:
            MOD.derive_commercial_state(
                {"id": "broken", "status": "available", "buyable": False}
            )
        self.assertIn("broken", str(ctx.exception))
        self.assertIn("available", str(ctx.exception))

    def test_planned_without_explicit_buyable_derives_false(self):
        available, buyable = MOD.derive_commercial_state(
            {"id": "b", "status": "planned"}
        )
        self.assertFalse(available)
        self.assertFalse(buyable)

    def test_planned_with_explicit_buyable_false_reinforces(self):
        available, buyable = MOD.derive_commercial_state(
            {"id": "b", "status": "planned", "buyable": False}
        )
        self.assertFalse(available)
        self.assertFalse(buyable)

    def test_planned_with_explicit_buyable_true_fails(self):
        with self.assertRaises(MOD.SotSchemaContradiction) as ctx:
            MOD.derive_commercial_state(
                {"id": "sneaky", "status": "planned", "buyable": True}
            )
        self.assertIn("sneaky", str(ctx.exception))

    def test_paused_and_retired_and_concept_are_never_buyable(self):
        for status in ("paused", "retired", "concept", "preview", None):
            with self.subTest(status=status):
                available, buyable = MOD.derive_commercial_state(
                    {"id": "b", "status": status}
                )
                self.assertFalse(available)
                self.assertFalse(buyable)

    def test_lifecycle_rule_matches_sot_commercial_statuses(self):
        # The single source of the rule: SOT's COMMERCIAL_STATUSES set.
        self.assertEqual(MOD.COMMERCIAL_STATUSES, frozenset({"available"}))


class NormaliseBundleTests(unittest.TestCase):
    def test_normalised_row_carries_derived_flags(self):
        row = MOD.normalise_bundle(
            {"id": "b", "status": "planned", "buyable": False, "visibility": "internal"}
        )
        self.assertFalse(row["commercially_available"])
        self.assertFalse(row["buyable"])
        self.assertFalse(row["renderable"])

    def test_available_row_mirrors_buyable_true(self):
        row = MOD.normalise_bundle(
            {"id": "b", "status": "available", "visibility": "public"}
        )
        self.assertTrue(row["commercially_available"])
        self.assertTrue(row["buyable"])
        self.assertTrue(row["renderable"])


class CommercialPostureTests(unittest.TestCase):
    def test_posture_flags_derive_from_normalized_rows(self):
        none_available = [
            MOD.normalise_bundle({"id": "a", "status": "planned"}),
            MOD.normalise_bundle({"id": "b", "status": "paused", "buyable": False}),
        ]
        posture = MOD.build_commercial_posture(none_available)
        self.assertFalse(posture["any_bundle_available"])
        self.assertFalse(posture["any_bundle_buyable"])

        one_available = none_available + [
            MOD.normalise_bundle({"id": "c", "status": "available"})
        ]
        posture = MOD.build_commercial_posture(one_available)
        self.assertTrue(posture["any_bundle_available"])
        self.assertTrue(posture["any_bundle_buyable"])

    def test_posture_note_is_state_safe(self):
        # The note must stay correct after a future refresh flips a flag, so
        # it may not hard-code a current-state claim ("NO bundle is
        # available/buyable" or equivalent). Current state belongs in the
        # generated any_bundle_* flags only.
        note = MOD.POSTURE_NOTE
        self.assertNotRegex(note, re.compile(r"\bno bundle\b", re.IGNORECASE))
        self.assertNotRegex(
            note, re.compile(r"\bnothing (is )?(buyable|available)\b", re.IGNORECASE)
        )
        self.assertNotRegex(note, re.compile(r"\btoday\b", re.IGNORECASE))
        # And it must state the positive rule that makes it future-safe.
        self.assertIn("available commercial state", note)
        self.assertIn("not commercial listings", note)
        # The checked-in mirror carries this exact note.
        mirror = json.loads(MIRROR_PATH.read_text())
        self.assertEqual(mirror["commercial_posture"]["note"], note)

    def test_checked_in_mirror_flags_are_consistent_with_its_rows(self):
        mirror = json.loads(MIRROR_PATH.read_text())
        rows = mirror["bundles"]
        self.assertEqual(
            mirror["commercial_posture"]["any_bundle_available"],
            any(r["commercially_available"] for r in rows),
        )
        self.assertEqual(
            mirror["commercial_posture"]["any_bundle_buyable"],
            any(r["buyable"] for r in rows),
        )
        # Every checked-in row obeys the lifecycle rule.
        for row in rows:
            self.assertEqual(
                row["buyable"],
                row["status"] in MOD.COMMERCIAL_STATUSES,
                row["id"],
            )
            self.assertEqual(row["buyable"], row["commercially_available"], row["id"])


class CheckedInMirrorMatchesSotTests(unittest.TestCase):
    """Opt-in end-to-end check against a real merged SOT checkout.

    Set SOT_CHECKOUT_PATH to a local sense360store/SOT clone at merged main.
    Skips in CI, which has no SOT checkout (and may lack PyYAML).
    """

    def test_checked_in_mirror_matches_sot_checkout(self):
        sot_path = os.environ.get("SOT_CHECKOUT_PATH", "")
        if not sot_path or not (Path(sot_path) / "bundles.yaml").is_file():
            self.skipTest("SOT_CHECKOUT_PATH not set to a SOT checkout")
        try:
            import yaml  # noqa: F401
        except ImportError:
            self.skipTest("PyYAML not installed")
        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), "--sot-path", sot_path, "--check"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
