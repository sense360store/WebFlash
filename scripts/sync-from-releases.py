#!/usr/bin/env python3
"""
Synchronise firmware binaries from the latest GitHub release assets.

Downloads *.bin assets, applies the naming convention expected by WebFlash,
and stores them under ./firmware before manifest generation.

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
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
GEN_MANIFESTS_PATH = SCRIPT_DIR / "gen-manifests.py"
SPEC = importlib.util.spec_from_file_location("gen_manifests", GEN_MANIFESTS_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import guard
    raise ImportError("Unable to load scripts/gen-manifests.py for shared helpers.")
gen_manifests = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gen_manifests)

USER_AGENT = "sense360-webflash-ci/1.0"


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
    fallback_channel = "preview" if release.get("prerelease") else "general"
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
            if dry_run:
                print(f"[dry-run] Would download {name} → {target_path}")
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
