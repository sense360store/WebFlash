#!/usr/bin/env python3
"""
Synchronise firmware binaries from the latest GitHub release assets.

Downloads ``*.bin`` assets, applies the naming convention expected by WebFlash,
stores them under ``./firmware`` and — when no manual sidecar is already
checked in — derives a matching ``*.meta.json`` sidecar from the GitHub
Release body.

The release body is expected to use Markdown sections::

    ## Changelog

    - Bullet item describing the change …

    ## Known Issues

    - None.

    ## Features

    - PoE-powered Sense360 Core configuration

    ## Hardware Requirements

    - Sense360 Core R4 or newer

For stable, non-rescue firmware the ``## Changelog`` section is required and
must contain at least one substantive bullet. Generic filler (``"Initial
release"``, ``"TBD"``, ``"Placeholder"``, …) is rejected so CI cannot silently
ship firmware without real release notes.

Usage:

    python scripts/sync-from-releases.py --repo owner/name --release-id 123456
    python scripts/sync-from-releases.py --tag v1.2.3
"""

from __future__ import annotations

import argparse
import fnmatch
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
GEN_MANIFESTS_PATH = SCRIPT_DIR / "gen-manifests.py"
SPEC = importlib.util.spec_from_file_location("gen_manifests", GEN_MANIFESTS_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import guard
    raise ImportError("Unable to load scripts/gen-manifests.py for shared helpers.")
gen_manifests = importlib.util.module_from_spec(SPEC)
# Register before exec_module so dataclasses (and anything else that looks
# up cls.__module__ in sys.modules during class construction) resolves
# correctly. Without this the module's @dataclass decorators fail under
# Python 3.11+.
sys.modules["gen_manifests"] = gen_manifests
SPEC.loader.exec_module(gen_manifests)

USER_AGENT = "sense360-webflash-ci/1.0"


# --- Release body parsing -------------------------------------------------

# Markdown headings we recognise inside a GitHub Release body. Keys are the
# normalised (lower-cased / stripped) heading text; values are the dict keys
# returned by ``parse_release_body``. The full canonical set is:
#
#   ## Changelog              -> changelog
#   ## Known Issues           -> known_issues
#   ## Features               -> features
#   ## Hardware Requirements  -> hardware_requirements
#
# Anything else is ignored.
_RELEASE_BODY_SECTIONS: Dict[str, str] = {
    "changelog": "changelog",
    "known issues": "known_issues",
    "features": "features",
    "hardware requirements": "hardware_requirements",
}

_HEADING_RE = re.compile(r"^\s*#{1,6}\s+(.+?)\s*$")
_BULLET_RE = re.compile(r"^\s*[-*+]\s+(.+?)\s*$")

# Bullet items that should collapse to an empty list. Matches the shape the PR
# spec calls out (``- None.`` becomes ``known_issues: []``) and a small set of
# common synonyms operators reach for in practice.
_EMPTY_PLACEHOLDER_VALUES = frozenset(
    {
        "none",
        "none.",
        "no known issues",
        "n/a",
        "na",
        "not applicable",
        "nothing",
        "nothing to report",
    }
)

# Generic filler that must NOT survive the validation gate for stable firmware.
# Mirrors ``_GENERIC_CHANGELOG_FILLERS`` in gen-manifests.py — keep the two
# lists in sync so a bad release body fails fast at sync time rather than
# slipping through to manifest generation.
_FILLER_PATTERNS: Tuple[re.Pattern, ...] = (
    re.compile(r"^initial release\.?$", re.IGNORECASE),
    re.compile(r"^first release\.?$", re.IGNORECASE),
    re.compile(r"^firmware release\.?$", re.IGNORECASE),
    re.compile(r"^see release notes\.?$", re.IGNORECASE),
    re.compile(r"^see release\.?$", re.IGNORECASE),
    re.compile(r"^tbd\.?$", re.IGNORECASE),
    re.compile(r"^todo\.?$", re.IGNORECASE),
    re.compile(r"^n/?a\.?$", re.IGNORECASE),
    re.compile(r"^placeholder\.?$", re.IGNORECASE),
    re.compile(r"^no changes\.?$", re.IGNORECASE),
    re.compile(r"^nothing to report\.?$", re.IGNORECASE),
)


def _is_empty_placeholder(value: str) -> bool:
    cleaned = value.strip().rstrip(".").strip().lower()
    return cleaned in _EMPTY_PLACEHOLDER_VALUES


def parse_release_body(body: Optional[str]) -> Dict[str, List[str]]:
    """Parse a GitHub release body into structured lists.

    Returns a dict that *always* contains the four canonical keys
    (``changelog``, ``known_issues``, ``features``, ``hardware_requirements``)
    each defaulting to ``[]``. Bullet items become array entries. A section
    that contains only the ``None`` placeholder collapses to ``[]``.
    """

    parsed: Dict[str, List[str]] = {key: [] for key in _RELEASE_BODY_SECTIONS.values()}
    if not isinstance(body, str) or not body.strip():
        return parsed

    text = body.replace("\r\n", "\n").replace("\r", "\n")
    current_key: Optional[str] = None
    current_items: List[str] = []

    def flush() -> None:
        nonlocal current_key, current_items
        if current_key is None:
            current_items = []
            return
        items = [item.strip() for item in current_items if item.strip()]
        if items and all(_is_empty_placeholder(item) for item in items):
            items = []
        parsed[current_key] = items
        current_key = None
        current_items = []

    for line in text.split("\n"):
        heading_match = _HEADING_RE.match(line)
        if heading_match:
            flush()
            heading = heading_match.group(1).strip().lower()
            current_key = _RELEASE_BODY_SECTIONS.get(heading)
            current_items = []
            continue

        if current_key is None:
            continue

        bullet_match = _BULLET_RE.match(line)
        if bullet_match:
            current_items.append(bullet_match.group(1))

    flush()
    return parsed


def changelog_is_only_filler(changelog: Sequence[str]) -> bool:
    """Return True when every non-empty changelog entry is generic filler."""

    saw_text = False
    for entry in changelog:
        if not isinstance(entry, str):
            return False
        text = entry.strip()
        if not text:
            continue
        saw_text = True
        if not any(pattern.match(text) for pattern in _FILLER_PATTERNS):
            return False
    return saw_text


def validate_stable_changelog(
    changelog: Sequence[str],
    asset_name: str,
) -> None:
    """Raise :class:`ValueError` when a stable build's changelog is unusable.

    Mirrors the rules in ``gen-manifests.py``: missing/empty changelogs and
    pure filler text are both rejected so CI fails at sync time instead of
    surfacing the failure deep inside manifest generation.
    """

    items = [str(entry).strip() for entry in changelog if str(entry).strip()]
    if not items:
        raise ValueError(
            f"Release body for '{asset_name}' is missing a `## Changelog` "
            "section with at least one bullet item. Stable firmware requires "
            "human-authored release notes — auto-generated changelogs are not "
            "accepted."
        )
    if changelog_is_only_filler(items):
        raise ValueError(
            f"Release body for '{asset_name}' contains only generic filler "
            f"({items!r}). Replace it with substantive, human-authored release "
            "notes (e.g. what changed, why, and any user-visible impact)."
        )


# --- Sidecar building ----------------------------------------------------

# Defaults applied to every generated sidecar. Rescue builds override
# ``artifact_type`` and ``improv`` further down.
_APPLICATION_DEFAULTS: Dict[str, Any] = {
    "signed_by": "Sense360 release pipeline",
    "deprecated": False,
    "deprecation_reason": None,
    "artifact_type": "application",
    "improv": True,
}

_RESCUE_OVERRIDES: Dict[str, Any] = {
    "artifact_type": "rescue",
    "improv": False,
}


def _is_rescue_metadata(metadata: "gen_manifests.FirmwareMetadata") -> bool:
    if (metadata.artifact_type or "").lower() == "rescue":
        return True
    if (metadata.config_string or "").lower() == "rescue":
        return True
    if (metadata.custom_directory or "").lower() == "rescue":
        return True
    return False


def build_sidecar_from_release_body(
    *,
    metadata: "gen_manifests.FirmwareMetadata",
    parsed_body: Dict[str, List[str]],
) -> Dict[str, Any]:
    """Compose a sidecar dict from the parsed release body and asset metadata.

    Generated sidecars always carry the four section arrays (changelog,
    known_issues, features, hardware_requirements) plus the provenance
    defaults (signed_by, deprecated, deprecation_reason). Rescue builds
    additionally override ``artifact_type`` to ``"rescue"`` and ``improv``
    to ``False``.
    """

    sidecar: Dict[str, Any] = {
        "changelog": list(parsed_body.get("changelog", [])),
        "known_issues": list(parsed_body.get("known_issues", [])),
        "features": list(parsed_body.get("features", [])),
        "hardware_requirements": list(parsed_body.get("hardware_requirements", [])),
    }
    sidecar.update(_APPLICATION_DEFAULTS)
    if _is_rescue_metadata(metadata):
        sidecar.update(_RESCUE_OVERRIDES)
    return sidecar


def find_existing_sidecar(bin_path: Path) -> Optional[Path]:
    """Return the path of a manual sidecar if one already exists on disk.

    Mirrors the resolution order used by ``gen-manifests.load_sidecar_metadata``
    (``foo.bin.meta.json`` first, then ``foo.meta.json``) so a hand-written
    sidecar in either form is treated as authoritative.
    """

    candidates = (
        bin_path.with_name(bin_path.name + ".meta.json"),
        bin_path.with_suffix(".meta.json"),
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def sidecar_target_path(bin_path: Path) -> Path:
    """Canonical sidecar path for newly synced binaries.

    Existing sidecars committed to the repo use ``<basename>.meta.json``
    (replacing ``.bin``), so the generator emits the same form to avoid
    drift between manual and generated sidecars.
    """

    return bin_path.with_suffix(".meta.json")


# --- GitHub helpers ------------------------------------------------------


def github_json(url: str, token: Optional[str] = None) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
        },
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        payload = response.read().decode(charset)
    return json.loads(payload)


def download_asset(url: str, dest: Path, token: Optional[str] = None) -> None:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/octet-stream",
            "User-Agent": USER_AGENT,
        },
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request) as response, dest.open("wb") as handle:
        shutil.copyfileobj(response, handle)


def fetch_release(
    repo: str, release_id: Optional[int], tag: Optional[str], token: Optional[str]
) -> dict:
    base = f"https://api.github.com/repos/{repo}/releases"
    if release_id is not None:
        url = f"{base}/{release_id}"
    elif tag:
        url = f"{base}/tags/{tag}"
    else:
        raise SystemExit("A release id or tag is required to sync firmware assets.")
    try:
        return github_json(url, token)
    except urllib.error.HTTPError as exc:  # pragma: no cover - API failure
        raise SystemExit(
            f"Failed to load release metadata ({exc.code} {exc.reason})"
        ) from exc


# --- Asset sync ----------------------------------------------------------


def write_sidecar(sidecar_path: Path, sidecar: Dict[str, Any]) -> None:
    sidecar_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(sidecar, indent=2, ensure_ascii=False) + "\n"
    sidecar_path.write_text(payload, encoding="utf-8")


def sync_assets(
    release: dict,
    firmware_dir: Path,
    token: Optional[str],
    pattern: str,
    dry_run: bool,
) -> List[Path]:
    assets = release.get("assets", []) or []
    if not assets:
        print("Release does not contain any assets.")
        return []
    firmware_dir.mkdir(parents=True, exist_ok=True)
    fallback_channel = "preview" if release.get("prerelease") else "stable"
    parsed_body = parse_release_body(release.get("body") or "")
    downloaded: List[Path] = []
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_dir_path = Path(tmp_dir)
        for asset in assets:
            name = asset.get("name") or ""
            if not fnmatch.fnmatch(name, pattern):
                continue
            if not name.lower().endswith(".bin"):
                continue
            asset_url = asset.get("url")
            if not asset_url:
                continue
            try:
                metadata = gen_manifests.parse_firmware_metadata(
                    Path(name), default_channel=fallback_channel
                )
            except ValueError as exc:
                raise SystemExit(
                    f"Unable to parse firmware asset '{name}': {exc}"
                ) from exc
            target_path = metadata.target_path(firmware_dir)
            existing_sidecar = find_existing_sidecar(target_path)
            should_generate_sidecar = existing_sidecar is None
            is_rescue = _is_rescue_metadata(metadata)
            channel = metadata.channel

            if (
                should_generate_sidecar
                and channel == "stable"
                and not is_rescue
            ):
                # Validate BEFORE we touch the filesystem so a bad release
                # body fails fast without leaving a half-synced .bin behind.
                try:
                    validate_stable_changelog(
                        parsed_body.get("changelog", []), name
                    )
                except ValueError as exc:
                    raise SystemExit(str(exc)) from exc

            sidecar_path = sidecar_target_path(target_path)

            if dry_run:
                print(f"[dry-run] Would download {name} → {target_path}")
                if should_generate_sidecar:
                    print(f"[dry-run] Would write sidecar → {sidecar_path}")
                else:
                    print(
                        f"[dry-run] Manual sidecar already present at "
                        f"{existing_sidecar}; would skip generation."
                    )
                downloaded.append(target_path)
                continue

            temp_path = tmp_dir_path / name
            try:
                download_asset(asset_url, temp_path, token)
            except urllib.error.HTTPError as exc:  # pragma: no cover - network failure
                raise SystemExit(
                    f"Failed to download asset '{name}': {exc.code} {exc.reason}"
                ) from exc
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(temp_path), target_path)
            print(f"Downloaded {name} → {target_path}")
            downloaded.append(target_path)

            if should_generate_sidecar:
                sidecar = build_sidecar_from_release_body(
                    metadata=metadata, parsed_body=parsed_body
                )
                write_sidecar(sidecar_path, sidecar)
                print(f"Generated sidecar metadata → {sidecar_path}")
            else:
                print(
                    f"Manual sidecar already present at "
                    f"{existing_sidecar}; skipping generation."
                )
    return downloaded


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Synchronise firmware binaries from GitHub release assets."
    )
    parser.add_argument(
        "--repo",
        help="Repository in owner/name format. Defaults to GITHUB_REPOSITORY.",
    )
    parser.add_argument(
        "--release-id",
        type=int,
        help="Numeric release id to download assets from.",
    )
    parser.add_argument(
        "--tag",
        help="Release tag to download assets from (ignored when --release-id is provided).",
    )
    parser.add_argument(
        "--token",
        help="GitHub token with permission to read release assets. Defaults to GITHUB_TOKEN.",
    )
    parser.add_argument(
        "--target-dir",
        default="firmware",
        help="Directory where firmware binaries will be stored (default: firmware).",
    )
    parser.add_argument(
        "--pattern",
        default="*.bin",
        help="fnmatch pattern used to select assets (default: *.bin).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview downloads without saving files.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    repo = args.repo or os.environ.get("GITHUB_REPOSITORY")
    if not repo:
        raise SystemExit(
            "Repository must be provided via --repo or the GITHUB_REPOSITORY environment variable."
        )
    token = args.token or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    release = fetch_release(repo, args.release_id, args.tag, token)
    firmware_dir = Path(args.target_dir).resolve()
    downloaded = sync_assets(
        release,
        firmware_dir,
        token,
        args.pattern or "*.bin",
        args.dry_run,
    )
    if downloaded:
        if args.dry_run:
            print(
                f"[dry-run] Would sync {len(downloaded)} firmware file(s) into {firmware_dir}"
            )
        else:
            print(f"Synced {len(downloaded)} firmware file(s) into {firmware_dir}")
    else:
        print("No firmware assets matched the provided pattern.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
