#!/usr/bin/env python3
"""PR-time guard: every ADDED or MODIFIED firmware source must still verify.

WebFlash imports raw ``.bin`` firmware from upstream GitHub releases via
``firmware/sources.json`` (see ``scripts/import-firmware-sources.py``). A source
entry pins the upstream asset by name and SHA, and the importer verifies that
SHA against the release's ``checksums-sha256.txt`` before staging the binary.

The recorded failure mode of June 10: five ``v1.0.0-preview`` source entries had
their assets' checksum lines narrowed away upstream (the release regenerated its
``checksums-sha256.txt`` without those lines). Because nothing re-checked the
sources at PR time, the breakage only surfaced *after merge*, when the dispatch
import / deploy gate ran and hard-failed on the whole batch — blocking every
later import until the stale sources were retired.

This guard moves that check to PR time. For every source entry that is **added
or modified** relative to the base branch (``main``), it fetches the referenced
release's ``checksums-sha256.txt`` and fails — naming the entry and the missing
asset — if no checksum line exists for the source's binary. Stale or
unverifiable sources are therefore rejected *before* merge instead of blocking
the deploy gate *after* merge.

Scope (deliberately narrow):

* Only ADDED / MODIFIED entries are validated here. Unchanged entries are not
  re-validated — full-surface verification stays with the dispatch import
  (``scripts/import-firmware-sources.py``), which downloads and SHA-verifies
  every declared binary. This guard is the cheap, fail-fast PR gate.
* This guard fetches only ``checksums-sha256.txt`` and asserts the line exists.
  It does **not** download the ``.bin``, hash it, sign anything, regenerate any
  manifest, or modify any file. It is read-only.

The fetch + checksum-line logic is **shared** with the importer:
``import_firmware_sources.fetch_release_metadata`` /
``index_assets_by_name`` / ``download_to_path`` /
``assert_checksum_line_present`` are reused verbatim so the guard and the
importer parse and look up checksum lines the same way.

Usage::

    python scripts/validate-source-checksums.py
    python scripts/validate-source-checksums.py --base-ref origin/main
    python scripts/validate-source-checksums.py --sources firmware/sources.json
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

DEFAULT_SOURCES_PATH = REPO_ROOT / "firmware" / "sources.json"
DEFAULT_BASE_REF = "origin/main"
SOURCES_REL_PATH = "firmware/sources.json"


def _load_sibling(name: str, filename: str):
    path = SCRIPT_DIR / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:  # pragma: no cover - import guard
        raise ImportError(f"Unable to load helper module {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Reuse the importer's load + network + checksum-line logic so the guard and
# the importer can never drift apart in how they fetch a release or decide a
# checksum line is missing.
importer = _load_sibling("import_firmware_sources", "import-firmware-sources.py")

ImportValidationError = importer.ImportValidationError


class ChecksumGuardError(RuntimeError):
    """A source entry's upstream release no longer lists its asset's checksum.

    Distinguished from the importer's ``ImportValidationError`` so callers can
    tell "the upstream checksum line is missing" (the thing this guard exists
    to catch, a fail-the-PR condition) apart from a generic runtime fault.
    """


# --- Base / current source diffing ---------------------------------------


def read_base_sources(
    base_ref: str,
    *,
    repo_root: Path = REPO_ROOT,
    sources_rel_path: str = SOURCES_REL_PATH,
) -> List[Dict[str, Any]]:
    """Return the ``sources`` array from ``firmware/sources.json`` on ``base_ref``.

    Reads the file out of git history (``git show <ref>:<path>``) so the guard
    can diff the PR branch against the base branch. Returns ``[]`` when the
    sources file does not exist on the base ref (a brand-new file on this
    branch — every entry is then "added" and validated). Raises
    ``ChecksumGuardError`` when the base ref itself cannot be resolved, because
    that means the guard cannot tell added/modified from unchanged and must not
    silently skip the check.
    """

    # Fail loudly if the ref is unresolvable: skipping the whole guard because
    # the base could not be read would re-open the exact post-merge hole this
    # guard closes.
    rev_parse = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", f"{base_ref}^{{commit}}"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    if rev_parse.returncode != 0:
        raise ChecksumGuardError(
            f"Base ref {base_ref!r} could not be resolved (git rev-parse failed). "
            "Fetch the base branch before running the guard (in CI use "
            "actions/checkout with fetch-depth: 0)."
        )

    show = subprocess.run(
        ["git", "show", f"{base_ref}:{sources_rel_path}"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    if show.returncode != 0:
        # The file did not exist on the base ref. Treat every current entry as
        # added; the guard will validate them all.
        return []
    try:
        data = json.loads(show.stdout)
    except json.JSONDecodeError as exc:
        raise ChecksumGuardError(
            f"{sources_rel_path} on {base_ref} is not valid JSON: {exc}"
        ) from exc
    sources = data.get("sources") if isinstance(data, dict) else None
    if not isinstance(sources, list):
        return []
    return sources


def _canonical(entry: Dict[str, Any]) -> str:
    return json.dumps(entry, sort_keys=True, ensure_ascii=False)


def select_changed_entries(
    current_sources: Sequence[Dict[str, Any]],
    base_sources: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Return the current entries that are added or modified vs. the base.

    An entry counts as unchanged only when a byte-for-byte equal entry exists in
    the base sources (matched by canonical JSON, so any field change — a new
    ``expected_sha256``, a retagged ``release_tag``, a renamed ``asset_name`` —
    marks it as modified). Duplicate-equal entries are consumed one-for-one so a
    genuinely new copy is still treated as added.
    """

    remaining: Dict[str, int] = {}
    for entry in base_sources:
        key = _canonical(entry)
        remaining[key] = remaining.get(key, 0) + 1

    changed: List[Dict[str, Any]] = []
    for entry in current_sources:
        key = _canonical(entry)
        if remaining.get(key, 0) > 0:
            remaining[key] -= 1
        else:
            changed.append(entry)
    return changed


# --- Per-entry checksum validation ----------------------------------------


def _entry_label(entry: Dict[str, Any]) -> str:
    config = entry.get("config_string") or entry.get("asset_name") or "<unknown>"
    repo = entry.get("source_repo") or "<repo>"
    tag = entry.get("release_tag") or "<tag>"
    return f"{config!r} ({repo}@{tag})"


def fetch_release_checksums(
    entry: Dict[str, Any],
    *,
    token: Optional[str],
    release_override: Optional[Dict[str, Any]] = None,
) -> str:
    """Fetch the release's ``checksums-sha256.txt`` text for ``entry``.

    Reuses the importer's network helpers verbatim. Raises
    ``ImportValidationError`` on any network / API failure (so a network fault
    is reported as an error, never silently treated as a pass).
    """

    source_repo = entry.get("source_repo")
    release_tag = entry.get("release_tag")
    if not source_repo or not release_tag:
        raise ChecksumGuardError(
            f"Source entry {_entry_label(entry)} is missing source_repo or "
            "release_tag; cannot fetch its release checksums."
        )

    if release_override is not None:
        release = release_override
    else:
        release = importer.fetch_release_metadata(source_repo, release_tag, token)

    asset_index = importer.index_assets_by_name(release)
    if "checksums-sha256.txt" not in asset_index:
        raise ChecksumGuardError(
            f"Release {source_repo}@{release_tag} for source entry "
            f"{_entry_label(entry)} does not publish a checksums-sha256.txt "
            "asset; the source cannot be verified."
        )

    asset = asset_index["checksums-sha256.txt"]
    # Prefer the API url when authenticated (rate-limit friendly), else the
    # anonymous browser url. Mirrors the importer's asset_url choice.
    url = (asset.get("url") if token else None) or asset.get(
        "browser_download_url"
    ) or asset.get("url")
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp) / "checksums-sha256.txt"
        importer.download_to_path(url, dest, token)
        return dest.read_text(encoding="utf-8")


def validate_entry_checksum(
    entry: Dict[str, Any],
    *,
    token: Optional[str],
    release_override: Optional[Dict[str, Any]] = None,
) -> None:
    """Assert the entry's binary still has a checksum line upstream.

    Raises ``ChecksumGuardError`` when the upstream ``checksums-sha256.txt`` has
    no line for the entry's ``asset_name``. Network / API faults surface as the
    importer's ``ImportValidationError`` (an error, not a pass).
    """

    asset_name = entry.get("asset_name")
    if not asset_name:
        raise ChecksumGuardError(
            f"Source entry {_entry_label(entry)} is missing asset_name; cannot "
            "validate its checksum line."
        )

    checksum_text = fetch_release_checksums(
        entry, token=token, release_override=release_override
    )
    try:
        importer.assert_checksum_line_present(checksum_text, asset_name)
    except ImportValidationError as exc:
        raise ChecksumGuardError(
            f"Source entry {_entry_label(entry)} references asset "
            f"{asset_name!r}, but that release's checksums-sha256.txt has no "
            f"checksum line for it ({exc}). The upstream release likely "
            "narrowed or regenerated its checksums; re-pin or remove this "
            "source before merging."
        ) from exc


def validate_changed_sources(
    current_sources: Sequence[Dict[str, Any]],
    base_sources: Sequence[Dict[str, Any]],
    *,
    token: Optional[str],
) -> List[str]:
    """Validate every added/modified entry; return a list of failure messages."""

    changed = select_changed_entries(current_sources, base_sources)
    failures: List[str] = []
    if not changed:
        print("No added or modified firmware/sources.json entries to validate.")
        return failures
    print(
        f"Validating {len(changed)} added/modified firmware source(s) against "
        "upstream checksums-sha256.txt..."
    )
    for entry in changed:
        label = _entry_label(entry)
        print(f"→ {label}")
        try:
            validate_entry_checksum(entry, token=token)
            print(f"  ✓ checksum line present for {entry.get('asset_name')!r}")
        except (ChecksumGuardError, ImportValidationError) as exc:
            failures.append(str(exc))
            print(f"  ✗ {exc}", file=sys.stderr)
    return failures


# --- CLI ------------------------------------------------------------------


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fail the PR when an added/modified firmware/sources.json entry's "
            "binary has no checksum line on its upstream release."
        )
    )
    parser.add_argument(
        "--sources",
        default=str(DEFAULT_SOURCES_PATH),
        help="Path to the (current) sources manifest (default: firmware/sources.json).",
    )
    parser.add_argument(
        "--base-ref",
        default=DEFAULT_BASE_REF,
        help="Git ref to diff against for added/modified entries (default: origin/main).",
    )
    parser.add_argument(
        "--token",
        help="GitHub token; falls back to GITHUB_TOKEN / GH_TOKEN env vars.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    sources_path = Path(args.sources)
    try:
        current_sources = importer.load_sources(sources_path)
        base_sources = read_base_sources(args.base_ref)
    except (ImportValidationError, ChecksumGuardError) as exc:
        print(f"Source checksum guard error: {exc}", file=sys.stderr)
        return 1

    token = (
        args.token
        or os.environ.get("GITHUB_TOKEN")
        or os.environ.get("GH_TOKEN")
    )

    failures = validate_changed_sources(
        current_sources, base_sources, token=token
    )
    if failures:
        print(
            f"\nSource checksum guard failed for {len(failures)} source(s):",
            file=sys.stderr,
        )
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print("\nSource checksum guard passed.")
    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
