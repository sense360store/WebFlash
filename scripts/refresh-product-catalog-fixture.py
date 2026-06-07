#!/usr/bin/env python3
"""Refresh the vendored product-catalog fixture from upstream.

WebFlash's alignment + readiness guards compare the live firmware surfaces
(``firmware/sources.json``, ``manifest.json``, the per-build manifests, the
publish workflow's ``REQUIRED_CONFIGS`` allowlist, and ``scripts/data/kits.json``)
against a *vendored snapshot* of the upstream
``sense360store/esphome-public`` ``config/product-catalog.json`` at
``__tests__/fixtures/esphome-product-catalog.json``.

The strict ``manifest build version matches catalog version`` guard in
``__tests__/product-catalog-alignment.test.js`` treats ``manifest.json`` and
the vendored fixture as *coupled* surfaces: they must move to a new version
together in the import commit. Nothing previously made them move together —
``scripts/import-firmware-sources.py`` regenerates the manifest path but left
the fixture frozen, so an upstream Release-One bump (e.g. v1.0.0 -> v1.0.2)
would make the manifest read v1.0.2 while the fixture still read v1.0.0 and
the strict guard would fail. This script closes that gap: it is invoked from
the importer (and can be run standalone) so the fixture is refreshed in the
same operation that stages the new firmware, and the two are committed
together.

Design constraints (why this is a *field-level* sync, not a wholesale copy):

* The vendored fixture is intentionally **minimal and curated** — it carries
  only the handful of entries needed to exercise the validator's eligibility
  branches (production / preview / blocked / legacy-compatible /
  hardware-pending-with-import-flag). The readiness tests pin the exact set
  and count. Replacing it with the full upstream catalog (dozens of removed /
  legacy entries) would break those pins.
* Several curated fixture entries legitimately carry fields the upstream
  catalog does **not** declare (e.g. the manual-preview fan entries carry a
  WebFlash-side ``version`` / ``channel`` / ``artifact_name`` and a
  ``webflash_import_eligibility`` block that drive the manual-preview import
  lane). A wholesale copy would strip those and regress the import lane.

So this refresh keeps the curated *set* of entries exactly as-is (no add, no
remove) and, for each entry that has a matching upstream row, syncs only the
identity-tracking fields (:data:`SYNC_FIELDS`) and only when upstream actually
declares a value for them. That is enough to keep the manifest and the fixture
in lock-step on a version bump while leaving every other curated value intact.

Usage::

    python scripts/refresh-product-catalog-fixture.py
    python scripts/refresh-product-catalog-fixture.py --dry-run
    python scripts/refresh-product-catalog-fixture.py \
        --catalog-payload-file /tmp/upstream-product-catalog.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

DEFAULT_FIXTURE_PATH = (
    REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
)
DEFAULT_SOURCE_REPO = "sense360store/esphome-public"
DEFAULT_BRANCH = "main"
CATALOG_PATH_IN_REPO = "config/product-catalog.json"

USER_AGENT = "sense360-webflash-catalog-refresh/1.0"

# The only fields the refresh pulls from upstream. These are the identity /
# lifecycle fields the alignment + readiness guards key on. Everything else in
# a curated fixture entry (notes, hardware, modules, webflash_import_eligibility,
# blocked_modules, ...) is left untouched.
SYNC_FIELDS: Tuple[str, ...] = ("status", "channel", "version", "artifact_name")


class CatalogRefreshError(RuntimeError):
    """Raised when the upstream catalog cannot be loaded or is malformed."""


def build_catalog_url(source_repo: str, branch: str = DEFAULT_BRANCH) -> str:
    return (
        f"https://raw.githubusercontent.com/{source_repo}/{branch}/"
        f"{CATALOG_PATH_IN_REPO}"
    )


def fetch_upstream_catalog(url: str, token: Optional[str] = None) -> Dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github.raw+json, application/json, text/plain",
            "User-Agent": USER_AGENT,
        },
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            payload = response.read().decode(charset)
    except urllib.error.HTTPError as exc:
        raise CatalogRefreshError(
            f"Upstream catalog request to {url} failed: {exc.code} {exc.reason}"
        ) from exc
    except urllib.error.URLError as exc:  # pragma: no cover - network failure
        raise CatalogRefreshError(
            f"Upstream catalog request to {url} failed: {exc}"
        ) from exc
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise CatalogRefreshError(
            f"Upstream catalog at {url} is not valid JSON: {exc}"
        ) from exc
    return parsed


def _assert_catalog_shape(catalog: Dict[str, Any], origin: str) -> None:
    if not isinstance(catalog, dict) or not isinstance(catalog.get("products"), list):
        raise CatalogRefreshError(
            f"Catalog from {origin} is missing a 'products' array."
        )


def index_upstream(
    catalog: Dict[str, Any],
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    by_config_string: Dict[str, Dict[str, Any]] = {}
    by_legacy_id: Dict[str, Dict[str, Any]] = {}
    for product in catalog.get("products", []):
        if not isinstance(product, dict):
            continue
        cs = product.get("config_string")
        if isinstance(cs, str) and cs:
            by_config_string[cs] = product
        legacy_id = product.get("legacy_config_id")
        if (
            product.get("status") == "legacy-compatible"
            and isinstance(legacy_id, str)
            and legacy_id
        ):
            by_legacy_id[legacy_id] = product
    return by_config_string, by_legacy_id


def _match_upstream(
    entry: Dict[str, Any],
    by_config_string: Dict[str, Dict[str, Any]],
    by_legacy_id: Dict[str, Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    cs = entry.get("config_string")
    if isinstance(cs, str) and cs:
        return by_config_string.get(cs)
    legacy_id = entry.get("legacy_config_id")
    if isinstance(legacy_id, str) and legacy_id:
        return by_legacy_id.get(legacy_id)
    return None


def refresh_fixture_data(
    fixture: Dict[str, Any], upstream: Dict[str, Any]
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Return ``(new_fixture, changes)`` without mutating ``fixture``.

    Pure function: no I/O. ``changes`` is a list of
    ``{"identifier", "field", "from", "to"}`` records describing every
    field that was synced from upstream.
    """

    _assert_catalog_shape(upstream, "upstream")
    if not isinstance(fixture, dict) or not isinstance(fixture.get("products"), list):
        raise CatalogRefreshError(
            "Fixture is missing a 'products' array; refusing to refresh."
        )

    by_config_string, by_legacy_id = index_upstream(upstream)

    new_fixture = json.loads(json.dumps(fixture))  # deep copy, order-preserving
    changes: List[Dict[str, Any]] = []

    for entry in new_fixture.get("products", []):
        if not isinstance(entry, dict):
            continue
        identifier = (
            entry.get("config_string")
            or (
                f"legacy:{entry.get('legacy_config_id')}"
                if entry.get("legacy_config_id")
                else "<unknown>"
            )
        )
        upstream_entry = _match_upstream(entry, by_config_string, by_legacy_id)
        if upstream_entry is None:
            # No upstream row to sync from. Leave the curated entry untouched.
            continue
        for field in SYNC_FIELDS:
            up_value = upstream_entry.get(field)
            # Only sync a value upstream actually declares. Never delete or
            # null out a curated field because upstream happens to omit it.
            if not isinstance(up_value, str) or not up_value:
                continue
            if entry.get(field) != up_value:
                changes.append(
                    {
                        "identifier": identifier,
                        "field": field,
                        "from": entry.get(field),
                        "to": up_value,
                    }
                )
                entry[field] = up_value

    return new_fixture, changes


def _serialise(data: Dict[str, Any]) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def refresh_catalog_fixture(
    fixture_path: Path = DEFAULT_FIXTURE_PATH,
    *,
    upstream_catalog: Optional[Dict[str, Any]] = None,
    catalog_url: Optional[str] = None,
    source_repo: str = DEFAULT_SOURCE_REPO,
    branch: str = DEFAULT_BRANCH,
    token: Optional[str] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Refresh ``fixture_path`` in place from the upstream catalog.

    ``upstream_catalog`` lets callers (and tests) supply a catalog dict
    directly for hermetic runs; otherwise the catalog is fetched from
    ``catalog_url`` (or derived from ``source_repo`` + ``branch``).

    Returns a summary dict ``{"changed", "changes", "fixture_path", "origin"}``.
    """

    fixture_path = Path(fixture_path)
    if not fixture_path.exists():
        raise CatalogRefreshError(f"Fixture not found at {fixture_path}.")
    try:
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CatalogRefreshError(
            f"Fixture {fixture_path} is not valid JSON: {exc}"
        ) from exc

    if upstream_catalog is not None:
        upstream = upstream_catalog
        origin = "supplied catalog"
    else:
        url = catalog_url or build_catalog_url(source_repo, branch)
        upstream = fetch_upstream_catalog(url, token)
        origin = url

    new_fixture, changes = refresh_fixture_data(fixture, upstream)
    serialised = _serialise(new_fixture)
    current = fixture_path.read_text(encoding="utf-8")
    changed = serialised != current

    if changed and not dry_run:
        fixture_path.write_text(serialised, encoding="utf-8")

    return {
        "changed": changed,
        "changes": changes,
        "fixture_path": str(fixture_path),
        "origin": origin,
    }


def _print_summary(summary: Dict[str, Any], *, dry_run: bool) -> None:
    changes: Sequence[Dict[str, Any]] = summary.get("changes") or []
    if not summary.get("changed"):
        print(
            f"Catalog fixture already in sync with {summary.get('origin')}; "
            "no changes."
        )
        return
    verb = "Would update" if dry_run else "Updated"
    print(f"{verb} catalog fixture from {summary.get('origin')}:")
    for change in changes:
        print(
            f"  - {change['identifier']}: {change['field']} "
            f"{change['from']!r} -> {change['to']!r}"
        )


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Refresh the vendored product-catalog fixture from the upstream "
            "esphome-public config/product-catalog.json."
        )
    )
    parser.add_argument(
        "--fixture",
        default=str(DEFAULT_FIXTURE_PATH),
        help="Path to the vendored fixture (default: the WebFlash fixture).",
    )
    parser.add_argument(
        "--source-repo",
        default=DEFAULT_SOURCE_REPO,
        help="Upstream repo to fetch the catalog from.",
    )
    parser.add_argument(
        "--branch",
        default=DEFAULT_BRANCH,
        help="Upstream branch to fetch the catalog from (default: main).",
    )
    parser.add_argument(
        "--catalog-url",
        help="Override the upstream catalog URL entirely.",
    )
    parser.add_argument(
        "--catalog-payload-file",
        help=(
            "Read the upstream catalog from a local JSON file instead of the "
            "network. Used for hermetic re-runs."
        ),
    )
    parser.add_argument(
        "--token",
        help="GitHub token; falls back to GITHUB_TOKEN / GH_TOKEN env vars.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would change without writing the fixture.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    token = (
        args.token
        or os.environ.get("GITHUB_TOKEN")
        or os.environ.get("GH_TOKEN")
    )
    upstream_catalog: Optional[Dict[str, Any]] = None
    if args.catalog_payload_file:
        payload_path = Path(args.catalog_payload_file)
        try:
            upstream_catalog = json.loads(payload_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(
                f"Failed to load --catalog-payload-file {payload_path}: {exc}",
                file=sys.stderr,
            )
            return 2
    try:
        summary = refresh_catalog_fixture(
            Path(args.fixture),
            upstream_catalog=upstream_catalog,
            catalog_url=args.catalog_url,
            source_repo=args.source_repo,
            branch=args.branch,
            token=token,
            dry_run=args.dry_run,
        )
    except CatalogRefreshError as exc:
        print(f"Catalog fixture refresh failed: {exc}", file=sys.stderr)
        return 1
    _print_summary(summary, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
