#!/usr/bin/env python3
"""Regenerate the checked-in SOT commercial-surface mirror.

WEBFLASH-TAXONOMY-RECONCILE-001. This script reads a LOCAL checkout of
sense360store/SOT (the programme-level source of truth for commercial bundle
names, status, visibility and buyability) and regenerates
scripts/data/sot-commercial-mirror.json.

The mirror is synchronized evidence, NEVER commercial authority:

  - Commercial names, status, visibility and buyability are owned by SOT
    (bundles.yaml / products.yaml). This file is a snapshot of that surface
    so WebFlash tests can guard customer copy offline, without network access.
  - Board/config/lifecycle/build evidence is owned by sense360store/esphome-public.
  - What WebFlash actually serves is owned by manifest.json in this repo.
  - Never hand-edit the mirror. Refresh it with this script from a clean SOT
    checkout at a merged main commit, and commit the diff with the SOT SHA it
    was generated from.

Commercial lifecycle semantics are SOT's, never WebFlash's own: SOT's
validator defines COMMERCIAL_STATUSES = {"available"} as the statuses that
mean "a customer can buy this" (SOT scripts/validate.py). The mirror derives
both flags from that single lifecycle rule — `commercially_available` and
`buyable` are true exactly when status == "available" — and an explicit
`buyable` field in a bundle row may only REINFORCE the derived state. If an
explicit value contradicts the lifecycle rule (available + buyable: false, or
non-available + buyable: true), the refresh fails loudly instead of silently
inventing a second commercial model inside WebFlash.

Usage:
    python3 scripts/refresh-sot-mirror.py --sot-path /path/to/SOT
    python3 scripts/refresh-sot-mirror.py --sot-path /path/to/SOT --check

--check regenerates in memory and exits non-zero if the checked-in mirror
differs (an optional offline validation command; normal CI does not run it
because CI has no SOT checkout).

Requires PyYAML (only for this optional refresh flow; the WebFlash runtime
and the Jest/unittest suites never parse YAML and never read SOT directly —
the pure lifecycle-normalization helpers below import without PyYAML).
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MIRROR_PATH = REPO_ROOT / "scripts" / "data" / "sot-commercial-mirror.json"

# Mirrors COMMERCIAL_STATUSES in sense360store/SOT scripts/validate.py — the
# statuses SOT defines as "a customer can buy this". SOT owns this rule;
# update here only when SOT's definition changes.
COMMERCIAL_STATUSES = frozenset({"available"})

# Mirrors BUNDLE_STATUSES in sense360store/SOT scripts/validate.py — the full
# lifecycle vocabulary a bundle row may carry. SOT owns this vocabulary too.
# The refresh fails loudly on any status outside it (SENSE360-CANONICALISATION-001
# PR 13 schema drift gate): an unknown status would otherwise silently derive
# non-buyable from a typo or an unsynchronised SOT schema change, and a NEW
# SOT status must be consciously classified here (commercial or not) before a
# mirror can be generated from it.
BUNDLE_STATUSES = frozenset(
    {"concept", "planned", "preview", "available", "paused", "retired"}
)

# The fields WebFlash needs, and only those. Everything else in bundles.yaml
# (pricing history, value props, long descriptions) stays in SOT.
BUNDLE_FIELDS = (
    "id",
    "name",
    "status",
    "visibility",
    "buyable",
    "tier",
    "physical_bundle_sku",
    "recommended_rooms",
    "contents",
    "contents_friendly",
    "webflash_config",
    "firmware_lifecycle",
    "webflash_exposure",
    "shop_status",
    "succeeds",
)

# State-safe posture wording: it must stay correct whether or not a future
# SOT refresh flips any bundle to the available commercial state. The
# CURRENT posture lives in the generated any_bundle_* flags, never in prose.
POSTURE_NOTE = (
    "Commercial posture is derived from the synchronized SOT bundle rows "
    "(status == 'available' is SOT's definition of a buyable commercial "
    "state). WebFlash room presets are not commercial listings. Customer "
    "availability or buyability wording is permitted only when the matching "
    "SOT record is in the available commercial state."
)


class SotSchemaContradiction(ValueError):
    """An explicit SOT field contradicts SOT's own lifecycle semantics."""


def derive_commercial_state(bundle):
    """Pure lifecycle normalization for one SOT bundle row.

    Returns (commercially_available, buyable), both derived from the single
    SOT rule: status in COMMERCIAL_STATUSES. A non-available record is always
    non-buyable. An explicit `buyable` field may only reinforce the derived
    state; a contradiction raises SotSchemaContradiction so the refresh fails
    clearly instead of minting a divergent commercial model in WebFlash.
    """
    status = bundle.get("status")
    if status not in BUNDLE_STATUSES:
        raise SotSchemaContradiction(
            f"SOT bundle '{bundle.get('id', '<no id>')}' carries unknown "
            f"status {status!r}; the mirrored SOT lifecycle vocabulary is "
            f"{sorted(BUNDLE_STATUSES)}. If SOT added a status, classify it "
            "here (and against COMMERCIAL_STATUSES) before regenerating; "
            "never let an unknown status silently derive a commercial state."
        )
    commercially_available = status in COMMERCIAL_STATUSES
    buyable = commercially_available

    explicit = bundle.get("buyable")
    if explicit is not None and bool(explicit) != buyable:
        raise SotSchemaContradiction(
            f"SOT bundle '{bundle.get('id', '<no id>')}' declares "
            f"buyable: {explicit!r} but its status {status!r} derives "
            f"buyable: {buyable} under SOT's lifecycle rule "
            f"(COMMERCIAL_STATUSES = {sorted(COMMERCIAL_STATUSES)}). "
            "Fix the SOT record (or SOT's lifecycle rule) first; the "
            "WebFlash mirror never overrides SOT semantics."
        )

    return commercially_available, buyable


def build_commercial_posture(bundles):
    """Derives the aggregate posture flags from normalized bundle rows."""
    return {
        "any_bundle_available": any(b["commercially_available"] for b in bundles),
        "any_bundle_buyable": any(b["buyable"] for b in bundles),
        "note": POSTURE_NOTE,
    }


def git_output(repo: Path, *args: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(repo), *args], text=True
    ).strip()


def normalise_bundle(raw: dict) -> dict:
    out = {}
    for field in BUNDLE_FIELDS:
        if field in raw:
            value = raw[field]
            if isinstance(value, str):
                value = " ".join(value.split())
            out[field] = value
    commercially_available, buyable = derive_commercial_state(raw)
    out["commercially_available"] = commercially_available
    out["buyable"] = buyable
    out["renderable"] = raw.get("visibility") == "public"
    return out


def build_mirror(sot_path: Path) -> dict:
    try:
        import yaml
    except ImportError:  # pragma: no cover
        print("PyYAML is required to refresh the mirror: pip install pyyaml",
              file=sys.stderr)
        raise SystemExit(2)

    bundles_doc = yaml.safe_load((sot_path / "bundles.yaml").read_text())
    bundles = [normalise_bundle(b) for b in bundles_doc.get("bundles", [])]

    sha = git_output(sot_path, "rev-parse", "HEAD")
    commit_date = git_output(sot_path, "show", "-s", "--format=%cs", "HEAD")

    return {
        "schema_version": 1,
        "role": (
            "Synchronized SOT commercial-surface MIRROR for offline WebFlash "
            "validation (WEBFLASH-TAXONOMY-RECONCILE-001). This file is not "
            "commercial authority: commercial bundle names, physical contents, "
            "lifecycle status, visibility and buyability are owned by "
            "sense360store/SOT (bundles.yaml). Board identity and firmware "
            "lifecycle are owned by sense360store/esphome-public. What WebFlash "
            "serves is owned by manifest.json. Refresh with "
            "scripts/refresh-sot-mirror.py from a clean SOT checkout; never "
            "hand-author it as independent truth."
        ),
        "provenance": {
            "source_repo": "sense360store/SOT",
            "source_sha": sha,
            "source_commit_date": commit_date,
            "source_files": ["bundles.yaml"],
            "generator": "scripts/refresh-sot-mirror.py",
        },
        "commercial_posture": build_commercial_posture(bundles),
        "bundles": bundles,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sot-path", required=True, type=Path,
                        help="Path to a local sense360store/SOT checkout")
    parser.add_argument("--check", action="store_true",
                        help="Verify the checked-in mirror matches (no write)")
    args = parser.parse_args()

    if not (args.sot_path / "bundles.yaml").is_file():
        print(f"No bundles.yaml under {args.sot_path}", file=sys.stderr)
        return 2

    try:
        mirror = build_mirror(args.sot_path)
    except SotSchemaContradiction as contradiction:
        print(f"SOT schema contradiction: {contradiction}", file=sys.stderr)
        return 1
    rendered = json.dumps(mirror, indent=2, ensure_ascii=False) + "\n"

    if args.check:
        current = MIRROR_PATH.read_text() if MIRROR_PATH.is_file() else ""
        if current != rendered:
            print("sot-commercial-mirror.json is stale; rerun without --check "
                  "and commit the diff.", file=sys.stderr)
            return 1
        print("sot-commercial-mirror.json matches the SOT checkout.")
        return 0

    MIRROR_PATH.write_text(rendered)
    print(f"Wrote {MIRROR_PATH.relative_to(REPO_ROOT)} "
          f"from SOT {mirror['provenance']['source_sha'][:12]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
