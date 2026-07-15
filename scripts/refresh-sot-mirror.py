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

Usage:
    python3 scripts/refresh-sot-mirror.py --sot-path /path/to/SOT
    python3 scripts/refresh-sot-mirror.py --sot-path /path/to/SOT --check

--check regenerates in memory and exits non-zero if the checked-in mirror
differs (an optional offline validation command; normal CI does not run it
because CI has no SOT checkout).

Requires PyYAML (only for this optional refresh flow; the WebFlash runtime
and the Jest suite never parse YAML and never read SOT directly).
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    print("PyYAML is required: pip install pyyaml", file=sys.stderr)
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parent.parent
MIRROR_PATH = REPO_ROOT / "scripts" / "data" / "sot-commercial-mirror.json"

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
    # Explicit, non-inferred flags the WebFlash guards key off. A bundle is
    # commercially available ONLY when SOT says status: available; buyability
    # defaults to false unless SOT explicitly says otherwise on an available
    # bundle. WebFlash never infers availability from firmware or manifests.
    out["commercially_available"] = raw.get("status") == "available"
    out["buyable"] = bool(raw.get("buyable", False)) and out["commercially_available"]
    out["renderable"] = raw.get("visibility") == "public"
    return out


def build_mirror(sot_path: Path) -> dict:
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
        "commercial_posture": {
            "any_bundle_available": any(b["commercially_available"] for b in bundles),
            "any_bundle_buyable": any(b["buyable"] for b in bundles),
            "note": (
                "As of the source SHA above, SOT lists NO bundle in the "
                "'available' state and nothing buyable. WebFlash customer copy "
                "must therefore never describe any preset as on sale, buyable "
                "or commercially available. A WebFlash room preset is a "
                "firmware preset, not a commercial listing."
            ),
        },
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

    mirror = build_mirror(args.sot_path)
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
