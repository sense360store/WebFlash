#!/usr/bin/env python3
"""
Import firmware assets from an upstream GitHub release into WebFlash.

This is the *cross-repo* importer: it reads ``firmware/sources.json``,
fetches each declared GitHub release (currently ``sense360store/esphome-public``),
verifies the upstream asset checksums against the release's
``checksums-sha256.txt``, applies WebFlash's naming + token policy, and stages
the verified ``.bin`` plus a generated ``.meta.json`` sidecar under
``firmware/configurations/`` so the regular ``gen-manifests.py`` pipeline can
sign it and emit the production manifest.

The script intentionally does **not** sign firmware, regenerate the production
manifest, or modify any wizard code. Those concerns stay with the existing
WebFlash pipeline. The importer's job is just to stage trusted inputs for it.

Boundaries enforced here (each is a hard failure that aborts the import):

* The upstream release must expose every entry in ``required_assets``.
* The downloaded ``.bin`` filename must exactly match ``asset_name``.
* The ``.bin`` SHA256 must match the entry in ``checksums-sha256.txt``.
* The ``.bin`` size must be at least ``min_size_bytes`` (default 102_400).
* The parsed filename's config_string must equal the source entry's
  declared ``config_string``.
* No token from ``block_tokens`` (default ``["FanTRIAC", "LED"]``) may appear
  in the filename or in the parsed module list.
* The release body must contain every section in
  ``required_release_body_sections`` (default the four canonical sections).

Usage::

    python scripts/import-firmware-sources.py
    python scripts/import-firmware-sources.py --dry-run
    python scripts/import-firmware-sources.py --sources firmware/sources.json
    python scripts/import-firmware-sources.py --source-repo sense360store/esphome-public
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
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
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

USER_AGENT = "sense360-webflash-importer/1.0"

DEFAULT_BLOCK_TOKENS: Tuple[str, ...] = ("FanTRIAC", "LED")
DEFAULT_REQUIRED_SECTIONS: Tuple[str, ...] = (
    "Changelog",
    "Known Issues",
    "Features",
    "Hardware Requirements",
)
DEFAULT_MIN_SIZE_BYTES = 102_400


# --- Shared helper loading -------------------------------------------------
#
# ``sync-from-releases.py`` already factors release-body parsing, sidecar
# composition, and the changelog-filler validator into top-level functions.
# Reuse them so the cross-repo importer and the same-repo release sync apply
# the same rules. We load via importlib because the scripts directory is not
# a Python package.


def _load_sibling(name: str, filename: str):
    path = SCRIPT_DIR / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:  # pragma: no cover - import guard
        raise ImportError(f"Unable to load helper module {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


gen_manifests = _load_sibling("gen_manifests", "gen-manifests.py")
sync_releases = _load_sibling("sync_releases", "sync-from-releases.py")


# --- Exceptions -----------------------------------------------------------


class ImportValidationError(RuntimeError):
    """Raised when an upstream asset fails an import-time policy check.

    Distinguishing this from generic ``RuntimeError``/``ValueError`` lets the
    test suite assert specific failure modes without coupling to message
    strings.
    """


# --- Sources file ---------------------------------------------------------


def load_sources(sources_path: Path) -> List[Dict[str, Any]]:
    if not sources_path.exists():
        raise ImportValidationError(
            f"Sources manifest not found at {sources_path}. "
            "Create firmware/sources.json or pass --sources."
        )
    try:
        data = json.loads(sources_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ImportValidationError(
            f"Sources manifest {sources_path} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise ImportValidationError(
            f"Sources manifest {sources_path} must be a JSON object."
        )
    schema_version = data.get("schema_version")
    if schema_version != 1:
        raise ImportValidationError(
            f"Sources manifest {sources_path} has unsupported "
            f"schema_version={schema_version!r}; expected 1."
        )
    sources = data.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ImportValidationError(
            f"Sources manifest {sources_path} must declare a non-empty "
            "'sources' array."
        )
    return sources


def filter_sources(
    sources: Sequence[Dict[str, Any]],
    *,
    source_repo: Optional[str],
    release_tag: Optional[str],
) -> List[Dict[str, Any]]:
    selected: List[Dict[str, Any]] = []
    for entry in sources:
        if source_repo and entry.get("source_repo") != source_repo:
            continue
        if release_tag and entry.get("release_tag") != release_tag:
            continue
        selected.append(entry)
    if (source_repo or release_tag) and not selected:
        raise ImportValidationError(
            f"No source matched repo={source_repo!r} tag={release_tag!r} "
            "in sources manifest."
        )
    return selected


# --- GitHub API ----------------------------------------------------------


def fetch_release_metadata(
    source_repo: str, release_tag: str, token: Optional[str]
) -> Dict[str, Any]:
    url = (
        f"https://api.github.com/repos/{source_repo}/releases/tags/{release_tag}"
    )
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
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
        raise ImportValidationError(
            f"GitHub API request for {source_repo} {release_tag} failed: "
            f"{exc.code} {exc.reason}"
        ) from exc
    except urllib.error.URLError as exc:  # pragma: no cover - network failure
        raise ImportValidationError(
            f"GitHub API request for {source_repo} {release_tag} failed: {exc}"
        ) from exc
    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ImportValidationError(
            f"GitHub API response for {source_repo} {release_tag} was not JSON."
        ) from exc


def download_to_path(url: str, dest: Path, token: Optional[str]) -> None:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/octet-stream",
            "User-Agent": USER_AGENT,
        },
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request) as response, dest.open("wb") as handle:
            shutil.copyfileobj(response, handle)
    except urllib.error.HTTPError as exc:
        raise ImportValidationError(
            f"Failed to download {url}: HTTP {exc.code} {exc.reason}"
        ) from exc
    except urllib.error.URLError as exc:  # pragma: no cover - network failure
        raise ImportValidationError(
            f"Failed to download {url}: {exc}"
        ) from exc


# --- Asset selection -----------------------------------------------------


def index_assets_by_name(release: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    indexed: Dict[str, Dict[str, Any]] = {}
    for asset in release.get("assets") or []:
        name = asset.get("name")
        if isinstance(name, str):
            indexed[name] = asset
    return indexed


def assert_required_assets_present(
    asset_index: Dict[str, Dict[str, Any]],
    required_assets: Sequence[str],
    *,
    source_repo: str,
    release_tag: str,
) -> None:
    missing = [name for name in required_assets if name not in asset_index]
    if missing:
        raise ImportValidationError(
            f"Release {source_repo}@{release_tag} is missing required asset(s): "
            + ", ".join(missing)
        )


# --- Checksum verification ----------------------------------------------


def parse_sha256_manifest(text: str) -> Dict[str, str]:
    """Parse a ``sha256sum``-style file into a ``{filename: hex_digest}`` map.

    Accepts both ``"<hex>  <name>"`` (two spaces, ``sha256sum`` default) and
    ``"<hex> *<name>"`` (binary mode) and tolerates leading ``./`` on names.
    """

    checksums: Dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$", line)
        if not match:
            continue
        digest = match.group(1).lower()
        name = match.group(2)
        if name.startswith("./"):
            name = name[2:]
        checksums[name] = digest
    return checksums


def sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_sha256(
    bin_path: Path,
    asset_name: str,
    checksum_text: str,
) -> str:
    checksums = parse_sha256_manifest(checksum_text)
    expected = checksums.get(asset_name)
    if not expected:
        raise ImportValidationError(
            f"checksums-sha256.txt does not list an entry for '{asset_name}'."
        )
    actual = sha256_of_file(bin_path)
    if actual.lower() != expected.lower():
        raise ImportValidationError(
            f"SHA256 mismatch for {asset_name}: "
            f"upstream declares {expected}, downloaded file hashes to {actual}."
        )
    return actual


# --- Filename / token policy --------------------------------------------


def assert_filename_matches_entry(asset_name: str, entry: Dict[str, Any]) -> None:
    declared_name = entry.get("asset_name")
    if asset_name != declared_name:
        raise ImportValidationError(
            f"Asset name '{asset_name}' does not match declared "
            f"asset_name '{declared_name}' in sources entry."
        )


def assert_size_meets_threshold(
    bin_path: Path, min_size_bytes: int, asset_name: str
) -> int:
    size = bin_path.stat().st_size
    if size < min_size_bytes:
        raise ImportValidationError(
            f"Downloaded asset '{asset_name}' is only {size} bytes; "
            f"expected >= {min_size_bytes} bytes. The upstream build is likely "
            "a placeholder or truncated."
        )
    return size


def assert_config_string_matches(
    metadata: "gen_manifests.FirmwareMetadata",
    entry: Dict[str, Any],
) -> None:
    expected = entry.get("config_string")
    if not metadata.is_configuration:
        raise ImportValidationError(
            f"Asset '{entry.get('asset_name')}' did not parse as a "
            "configuration build (no Mounting-Power-... tokens detected)."
        )
    if expected and metadata.config_string != expected:
        raise ImportValidationError(
            f"Parsed config_string '{metadata.config_string}' does not match "
            f"declared '{expected}' in sources entry."
        )


def assert_block_tokens_absent(
    asset_name: str,
    metadata: "gen_manifests.FirmwareMetadata",
    block_tokens: Sequence[str],
) -> None:
    if not block_tokens:
        return
    name_tokens_lower = {tok.lower() for tok in asset_name.replace(".bin", "").split("-") if tok}
    module_tokens_lower = {tok.lower() for tok in (metadata.modules or [])}
    config_tokens_lower = set()
    if metadata.config_string:
        config_tokens_lower = {
            tok.lower() for tok in metadata.config_string.split("-") if tok
        }
    haystack = name_tokens_lower | module_tokens_lower | config_tokens_lower
    hits = sorted({tok for tok in block_tokens if tok.lower() in haystack})
    if hits:
        raise ImportValidationError(
            f"Asset '{asset_name}' contains blocked token(s) for this source: "
            + ", ".join(hits)
            + ". The Release-One importer refuses FanTRIAC and LED firmware."
        )


# --- Release body validation --------------------------------------------


def assert_required_release_body_sections(
    body: str, required_sections: Sequence[str]
) -> Dict[str, List[str]]:
    """Parse the release body and assert every required H2 is present."""

    parsed = sync_releases.parse_release_body(body or "")
    section_to_key = {
        "Changelog": "changelog",
        "Known Issues": "known_issues",
        "Features": "features",
        "Hardware Requirements": "hardware_requirements",
    }
    missing: List[str] = []
    for heading in required_sections:
        key = section_to_key.get(heading)
        if key is None:
            raise ImportValidationError(
                f"Unknown required release-body section '{heading}'. "
                "Allowed: " + ", ".join(section_to_key.keys()) + "."
            )
        # parse_release_body always returns the four keys with [] when the
        # heading is absent, so distinguish "absent" from "empty list" by
        # looking for the heading text in the body.
        heading_pattern = re.compile(
            rf"^\s*#{{1,6}}\s+{re.escape(heading)}\s*$",
            re.IGNORECASE | re.MULTILINE,
        )
        if not heading_pattern.search(body or ""):
            missing.append(heading)
    if missing:
        raise ImportValidationError(
            "Release body is missing required section(s): "
            + ", ".join(f"## {s}" for s in missing)
            + "."
        )
    return parsed


# --- Sidecar provenance --------------------------------------------------


def build_provenance_sidecar(
    *,
    entry: Dict[str, Any],
    release: Dict[str, Any],
    metadata: "gen_manifests.FirmwareMetadata",
    parsed_body: Dict[str, List[str]],
    asset_sha256: str,
    upstream_manifest: Optional[Dict[str, Any]],
    imported_at: str,
) -> Dict[str, Any]:
    """Compose a sidecar with both release-notes content and source provenance.

    Provenance fields let a future operator trace any deployed binary back to
    the exact upstream release, asset, and (if available) the upstream build's
    git sha + esphome version. Treated strictly as debug metadata — never
    consumed as the production manifest.
    """

    base = sync_releases.build_sidecar_from_release_body(
        metadata=metadata, parsed_body=parsed_body
    )
    source_block: Dict[str, Any] = {
        "source_repo": entry.get("source_repo"),
        "release_tag": entry.get("release_tag"),
        "release_url": entry.get("release_url")
        or release.get("html_url"),
        "source_asset_name": entry.get("asset_name"),
        "source_asset_sha256": asset_sha256,
        "source_manifest_git_sha": None,
        "source_manifest_esphome_version": None,
        "imported_at": imported_at,
    }
    if isinstance(upstream_manifest, dict):
        for key in ("source_commit", "git_sha", "commit", "sha"):
            value = upstream_manifest.get(key)
            if isinstance(value, str) and value:
                source_block["source_manifest_git_sha"] = value
                break
        for key in ("esphome_version", "esphome", "esphome_release"):
            value = upstream_manifest.get(key)
            if isinstance(value, str) and value:
                source_block["source_manifest_esphome_version"] = value
                break
    base["source"] = source_block
    return base


# --- Main import flow ----------------------------------------------------


def import_source_entry(
    entry: Dict[str, Any],
    *,
    repo_root: Path,
    token: Optional[str],
    dry_run: bool,
    imported_at: str,
    release_override: Optional[Dict[str, Any]] = None,
) -> Path:
    source_repo = entry.get("source_repo")
    release_tag = entry.get("release_tag")
    asset_name = entry.get("asset_name")
    if not source_repo or not release_tag or not asset_name:
        raise ImportValidationError(
            "Source entry must declare source_repo, release_tag, and asset_name."
        )

    required_assets = list(entry.get("required_assets") or [asset_name])
    if "checksums-sha256.txt" not in required_assets:
        required_assets.append("checksums-sha256.txt")
    block_tokens = list(entry.get("block_tokens") or DEFAULT_BLOCK_TOKENS)
    required_sections = list(
        entry.get("required_release_body_sections") or DEFAULT_REQUIRED_SECTIONS
    )
    min_size_bytes = int(entry.get("min_size_bytes") or DEFAULT_MIN_SIZE_BYTES)

    print(f"→ Importing {asset_name} from {source_repo}@{release_tag}")
    if release_override is not None:
        release = release_override
    else:
        release = fetch_release_metadata(source_repo, release_tag, token)
    asset_index = index_assets_by_name(release)
    assert_required_assets_present(
        asset_index,
        required_assets,
        source_repo=source_repo,
        release_tag=release_tag,
    )
    # The declared asset_name must actually exist in the release index. The
    # required_assets gate above can be relaxed for tests, so guard here too.
    if asset_name not in asset_index:
        raise ImportValidationError(
            f"Declared asset_name '{asset_name}' is not present in release "
            f"{source_repo}@{release_tag}. Available assets: "
            + ", ".join(sorted(asset_index.keys()))
        )

    body = release.get("body") or ""
    parsed_body = assert_required_release_body_sections(body, required_sections)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        bin_tmp = tmp_path / asset_name
        sha_tmp = tmp_path / "checksums-sha256.txt"
        upstream_manifest_tmp = tmp_path / "upstream-manifest.json"

        # Download the .bin and checksums first. The API ``url`` requires the
        # token; the ``browser_download_url`` works anonymously. Prefer the
        # API URL when we have a token (rate-limit-friendly in CI), fall back
        # to the browser URL otherwise.
        def asset_url(name: str) -> str:
            asset = asset_index[name]
            if token and asset.get("url"):
                return asset["url"]
            return asset.get("browser_download_url") or asset["url"]

        download_to_path(asset_url(asset_name), bin_tmp, token)
        download_to_path(asset_url("checksums-sha256.txt"), sha_tmp, token)

        asset_sha = verify_sha256(bin_tmp, asset_name, sha_tmp.read_text(encoding="utf-8"))
        assert_filename_matches_entry(asset_name, entry)
        assert_size_meets_threshold(bin_tmp, min_size_bytes, asset_name)

        upstream_manifest: Optional[Dict[str, Any]] = None
        if "manifest.json" in asset_index:
            try:
                download_to_path(
                    asset_url("manifest.json"), upstream_manifest_tmp, token
                )
                upstream_manifest = json.loads(
                    upstream_manifest_tmp.read_text(encoding="utf-8")
                )
            except (ImportValidationError, json.JSONDecodeError) as exc:
                # Build-info parsing is best-effort. Provenance gets recorded
                # without the upstream git_sha / esphome_version fields.
                print(
                    f"  (warning: could not parse upstream manifest.json: {exc})"
                )
                upstream_manifest = None

        firmware_dir = repo_root / "firmware"
        metadata = gen_manifests.parse_firmware_metadata(
            Path(asset_name), default_channel=entry.get("channel") or "stable"
        )
        assert_config_string_matches(metadata, entry)
        assert_block_tokens_absent(asset_name, metadata, block_tokens)

        target_path = metadata.target_path(firmware_dir)
        sidecar_path = sync_releases.sidecar_target_path(target_path)
        sidecar = build_provenance_sidecar(
            entry=entry,
            release=release,
            metadata=metadata,
            parsed_body=parsed_body,
            asset_sha256=asset_sha,
            upstream_manifest=upstream_manifest,
            imported_at=imported_at,
        )

        # Validate the changelog so we fail before touching the filesystem.
        if metadata.channel == "stable" and (metadata.artifact_type or "") != "rescue":
            sync_releases.validate_stable_changelog(
                sidecar.get("changelog", []), asset_name
            )

        if dry_run:
            print(f"  [dry-run] Would write {target_path}")
            print(f"  [dry-run] Would write {sidecar_path}")
            return target_path

        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(bin_tmp), target_path)
        sync_releases.write_sidecar(sidecar_path, sidecar)
        print(f"  → wrote {target_path}")
        print(f"  → wrote {sidecar_path}")
        return target_path


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Import firmware assets from upstream GitHub releases declared "
            "in firmware/sources.json."
        )
    )
    parser.add_argument(
        "--sources",
        default=str(REPO_ROOT / "firmware" / "sources.json"),
        help="Path to the sources manifest (default: firmware/sources.json).",
    )
    parser.add_argument(
        "--source-repo",
        help="Filter to a single source repo (e.g. sense360store/esphome-public).",
    )
    parser.add_argument(
        "--release-tag",
        help="Filter to a single release tag (e.g. v1.0.0).",
    )
    parser.add_argument(
        "--token",
        help="GitHub token; falls back to GITHUB_TOKEN / GH_TOKEN env vars.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate everything but skip writing files into firmware/.",
    )
    parser.add_argument(
        "--release-payload-file",
        help=(
            "Read GitHub release metadata from a local JSON file instead of the "
            "API. Used for hermetic re-runs and to work around anonymous "
            "rate limits. The file shape mirrors the API response: "
            '{"body": "...", "assets": [{"name": "...", "url": "...", "browser_download_url": "..."}], "html_url": "..."}'
        ),
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    sources = load_sources(Path(args.sources))
    selected = filter_sources(
        sources, source_repo=args.source_repo, release_tag=args.release_tag
    )
    token = (
        args.token
        or os.environ.get("GITHUB_TOKEN")
        or os.environ.get("GH_TOKEN")
    )
    imported_at = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()
    release_override: Optional[Dict[str, Any]] = None
    if args.release_payload_file:
        payload_path = Path(args.release_payload_file)
        try:
            release_override = json.loads(payload_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise SystemExit(
                f"Failed to load --release-payload-file {payload_path}: {exc}"
            ) from exc
        if len(selected) != 1:
            raise SystemExit(
                "--release-payload-file requires --source-repo and --release-tag "
                "to narrow the sources manifest down to a single entry."
            )
    failures: List[str] = []
    for entry in selected:
        try:
            import_source_entry(
                entry,
                repo_root=REPO_ROOT,
                token=token,
                dry_run=args.dry_run,
                imported_at=imported_at,
                release_override=release_override,
            )
        except ImportValidationError as exc:
            failures.append(f"{entry.get('asset_name')}: {exc}")
            print(f"  ✗ {exc}", file=sys.stderr)
    if failures:
        print(
            f"\nImport failed for {len(failures)} source(s):", file=sys.stderr
        )
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print(f"\nImported {len(selected)} source(s).")
    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
