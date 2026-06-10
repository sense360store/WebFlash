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
* The ``.bin`` bytes must not contain any known default/placeholder
  credential (W-H1 import gate; denylist in
  ``scripts/check-firmware-default-credentials.py``). Checksum-valid but
  credential-dirty assets are refused.
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


# A Sense360-shaped release tag: optional single leading v/V, semver core, any
# suffix. Mirrors add-firmware-source._SEMVER_TAG_RE.
_SEMVER_TAG_RE = re.compile(r"^[vV]?(\d+\.\d+\.\d+.*)$")


def normalize_tag(raw: str) -> str:
    """Canonicalize a human-entered release tag to Sense360's form.

    Behaviour-identical mirror of ``add-firmware-source.normalize_tag`` (kept as
    a tiny self-contained copy rather than a cross-script import, matching this
    directory's stdlib-only convention). Canonicalization is **conditional**: a
    Sense360-shaped tag (optional single leading ``v``/``V``, then a semver core,
    then any suffix) is trimmed, has its single optional ``v``/``V`` stripped,
    lowercased, and re-prefixed with one ``v`` (``V1.0.5`` -> ``v1.0.5``,
    ``1.0.5`` -> ``v1.0.5``, ``v1.0.0-PREVIEW`` -> ``v1.0.0-preview``). Anything
    that does not look like a semver tag (``release-1.0.0``, ``latest``, a
    custom-repo tag) is returned trimmed but otherwise unchanged, preserving the
    pre-normalization verbatim behaviour. ``firmware/sources.json`` stores the
    canonical tag, so normalizing the ``--release-tag`` filter to canonical form
    before matching is enough for ``V1.0.5`` / ``1.0.5`` to resolve.
    """

    text = (raw or "").strip()
    if not text:
        return ""
    match = _SEMVER_TAG_RE.match(text)
    if not match:
        return text
    return "v" + match.group(1).lower()


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
catalog_refresh = _load_sibling(
    "refresh_product_catalog_fixture", "refresh-product-catalog-fixture.py"
)
credential_gate = _load_sibling(
    "check_firmware_default_credentials", "check-firmware-default-credentials.py"
)

DEFAULT_CATALOG_FIXTURE_PATH = (
    REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
)


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


def assert_checksum_line_present(checksum_text: str, asset_name: str) -> str:
    """Return the upstream-declared SHA256 for ``asset_name`` or raise.

    Shared by the full importer SHA verification (``verify_sha256``) and the
    PR-time add-source guard (``scripts/validate-source-checksums.py``). The
    guard only needs to confirm that a checksum *line* exists for the asset —
    the recorded June 10 failure mode where an upstream release narrowed or
    regenerated its ``checksums-sha256.txt`` and dropped a source's asset line,
    which then hard-fails the whole import at the deploy gate. The importer
    additionally hashes the downloaded ``.bin`` against the returned digest.
    """

    checksums = parse_sha256_manifest(checksum_text)
    expected = checksums.get(asset_name)
    if not expected:
        raise ImportValidationError(
            f"checksums-sha256.txt does not list an entry for '{asset_name}'."
        )
    return expected


def verify_sha256(
    bin_path: Path,
    asset_name: str,
    checksum_text: str,
) -> str:
    expected = assert_checksum_line_present(checksum_text, asset_name)
    actual = sha256_of_file(bin_path)
    if actual.lower() != expected.lower():
        raise ImportValidationError(
            f"SHA256 mismatch for {asset_name}: "
            f"upstream declares {expected}, downloaded file hashes to {actual}."
        )
    return actual


_HEX64_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")


def assert_expected_sha256_matches(
    entry: Dict[str, Any], actual_sha: str, asset_name: str
) -> None:
    """Verify the downloaded asset SHA against a pinned ``expected_sha256``.

    The upstream ``checksums-sha256.txt`` verification (``verify_sha256``)
    protects against download corruption but trusts whatever digest the
    release ships. ``expected_sha256`` is WebFlash's own pinned
    expectation for the source entry — defence in depth against a
    compromised or accidentally replaced release asset whose
    ``checksums-sha256.txt`` was swapped in lock-step.

    Backward compatible: when the key is absent or empty, this is a
    no-op so existing source entries (e.g. Release-One) keep working.
    """

    raw = entry.get("expected_sha256")
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        return
    if not isinstance(raw, str) or not _HEX64_PATTERN.match(raw.strip()):
        raise ImportValidationError(
            f"Source entry for '{asset_name}' has malformed 'expected_sha256': "
            f"{raw!r}. Must be a 64-character lowercase hex SHA256 digest."
        )
    expected = raw.strip().lower()
    actual = actual_sha.lower()
    if actual != expected:
        raise ImportValidationError(
            f"Pinned SHA256 mismatch for '{asset_name}': source entry "
            f"expected_sha256={expected}, downloaded file hashes to {actual}. "
            "Either the upstream asset was replaced after the source entry "
            "was pinned, or expected_sha256 in firmware/sources.json is stale."
        )


# --- Default-credential scan (W-H1 import gate) ---------------------------


def assert_no_default_credentials(
    bin_path: Path, asset_name: str, *, source_repo: str, release_tag: str
) -> None:
    """Refuse a checksum-valid asset whose bytes carry default credentials.

    Downstream half of SECURITY-AUDIT-2026-06 W-H1 (the upstream half is the
    esphome-public#779 release gate): a binary built with the known
    default/placeholder credential set must never be staged for the
    installer, no matter how it got onto the upstream release. Runs
    alongside the checksum verification — both must pass; a valid SHA256
    only proves the bytes arrived intact, not that they are safe to serve.

    This scan governs what may be NEWLY imported. The already-staged skip
    path (``find_staged_pinned_asset``) deliberately does not re-scan: the
    previously published binaries predate the upstream fix and stay
    published until the tracked rebuild + clean re-import lands (see
    UPCOMING_PR.md WF-H1-REIMPORT-CLEAN-001). Any genuine re-import of those
    assets (changed pin, removed staged file) takes this full path and is
    refused here.
    """

    matches = credential_gate.scan_blob(bin_path.read_bytes())
    if not matches:
        return
    detail = "; ".join(
        f"[{cred_class}] ({label})" for cred_class, label in matches
    )
    raise ImportValidationError(
        f"Asset '{asset_name}' from {source_repo}@{release_tag} contains "
        f"known default/placeholder credential material: {detail}. "
        "Checksum-valid but credential-dirty assets are refused and nothing "
        "is staged. The upstream build must carry the post-#779 release "
        "secret posture (no shared default credentials) before it can be "
        "imported."
    )


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


# --- Superseded-version pruning -----------------------------------------


def prune_superseded_configurations(
    target_path: Path,
    metadata: "gen_manifests.FirmwareMetadata",
    firmware_dir: Path,
) -> List[Path]:
    """Delete strictly-older builds of the same config_string + channel.

    The manifest generator (`gen-manifests.py`) emits a build for **every**
    ``.bin`` under ``firmware/configurations/`` — it keeps superseded
    versions on disk and only prints a note. So importing a new version of an
    existing config (e.g. Release-One v1.0.0 -> v1.0.2) without removing the
    old binary would leave two builds with the same ``config_string`` in
    ``manifest.json``. Pruning here, co-located with the import that knows the
    config_string + channel, keeps a version bump clean and idempotent.

    Only configuration builds are touched (never rescue / legacy), only the
    same ``config_string`` **and** channel, and only versions strictly older
    than the one just imported. Each removed ``.bin`` takes its ``.meta.json``
    sidecar and any ``.md`` release-notes sibling with it. Returns the list of
    removed paths (newest-version files are never returned).
    """

    removed: List[Path] = []
    if not metadata.is_configuration:
        return removed
    configurations_dir = firmware_dir / "configurations"
    if not configurations_dir.exists():
        return removed

    target_resolved = target_path.resolve()
    for bin_path in sorted(configurations_dir.glob("*.bin")):
        if bin_path.resolve() == target_resolved:
            continue
        try:
            other = gen_manifests.parse_firmware_metadata(
                bin_path, default_channel=metadata.channel, force_configuration=True
            )
        except ValueError:
            continue
        if not other.is_configuration:
            continue
        if other.config_string != metadata.config_string:
            continue
        if other.channel != metadata.channel:
            continue
        if not gen_manifests.version_is_newer(metadata.version, other.version):
            # Same or newer than what we imported; leave it alone.
            continue
        for sibling in (
            bin_path,
            sync_releases.sidecar_target_path(bin_path),
            bin_path.with_suffix(".md"),
        ):
            if sibling.exists():
                sibling.unlink()
                removed.append(sibling)
                print(f"  → removed superseded {sibling}")
    return removed


# --- Already-staged skip ---------------------------------------------------


def find_staged_pinned_asset(
    entry: Dict[str, Any], *, repo_root: Path
) -> Optional[Tuple[Path, "gen_manifests.FirmwareMetadata"]]:
    """Return ``(target_path, metadata)`` when the entry is already staged.

    A source entry counts as already staged when ALL of the following hold:

    * the entry pins ``expected_sha256`` (WebFlash's own per-entry pin),
    * the canonical target ``.bin`` already exists under
      ``firmware/configurations/`` and hashes to exactly that pin,
    * the ``.meta.json`` provenance sidecar exists next to it.

    In that case the bytes the import would produce are already on disk and
    verified against the strongest check the importer has (the pinned SHA), so
    the network re-import — including re-verification against the *current*
    upstream ``checksums-sha256.txt`` — can be skipped. Upstream releases
    regenerate that checksum manifest over time (for example when superseded
    assets are pruned from a shared preview release), which would otherwise
    hard-fail the whole import run for assets that are already correctly
    imported and pinned (the recorded failure mode of the firmware-import
    workflow: "checksums-sha256.txt does not list an entry for '<asset>'").

    Entries without a pinned ``expected_sha256`` never skip — they always take
    the full download + upstream-checksum verification path. A changed pin (a
    new upstream version or a deliberately replaced asset) also re-takes the
    full path, because the staged file no longer matches the pin.

    The static policies that need no network — declared-name shape,
    config-string match, block-token absence, minimum size — are re-enforced
    by the caller before the skip is honoured.
    """

    raw_pin = entry.get("expected_sha256")
    if not isinstance(raw_pin, str) or not _HEX64_PATTERN.match(raw_pin.strip()):
        return None
    pin = raw_pin.strip().lower()

    asset_name = entry.get("asset_name")
    if not isinstance(asset_name, str) or not asset_name:
        return None
    try:
        metadata = gen_manifests.parse_firmware_metadata(
            Path(asset_name), default_channel=entry.get("channel") or "stable"
        )
    except ValueError:
        # Unparseable names fall through to the full path, which reports the
        # same parse problem the way it always has.
        return None

    target_path = metadata.target_path(repo_root / "firmware")
    sidecar_path = sync_releases.sidecar_target_path(target_path)
    if not target_path.exists() or not sidecar_path.exists():
        return None
    if sha256_of_file(target_path) != pin:
        return None
    return target_path, metadata


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

    # Idempotent skip for already-imported, pin-verified assets. The staged
    # bytes are re-verified against the entry's own expected_sha256 (see
    # find_staged_pinned_asset), and the static policies below are still
    # enforced; the network fetch, the upstream checksums-sha256.txt
    # re-verification, and the W-H1 default-credential scan (which governs
    # what may be NEWLY imported — see assert_no_default_credentials) are
    # skipped. This keeps the import run green when an upstream release
    # later regenerates its checksum manifest without the already-imported
    # asset's line, and keeps the pre-#779 binaries that are already
    # published from being torn out by a routine re-run before their tracked
    # clean rebuild lands.
    staged = find_staged_pinned_asset(entry, repo_root=repo_root)
    if staged is not None:
        staged_path, staged_metadata = staged
        assert_filename_matches_entry(asset_name, entry)
        assert_config_string_matches(staged_metadata, entry)
        assert_block_tokens_absent(asset_name, staged_metadata, block_tokens)
        assert_size_meets_threshold(staged_path, min_size_bytes, asset_name)
        print(
            "  ✓ Already imported: staged file matches pinned expected_sha256; "
            "skipping re-download and upstream re-verification."
        )
        return staged_path

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
        assert_expected_sha256_matches(entry, asset_sha, asset_name)
        # W-H1 import gate: checksum integrity alone is not enough — the
        # verified bytes must also be free of known default credentials.
        assert_no_default_credentials(
            bin_tmp, asset_name, source_repo=source_repo, release_tag=release_tag
        )
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
        prune_superseded_configurations(target_path, metadata, firmware_dir)
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
    parser.add_argument(
        "--skip-catalog-refresh",
        action="store_true",
        help=(
            "Do not refresh the vendored product-catalog fixture after a "
            "successful import. The refresh keeps "
            "__tests__/fixtures/esphome-product-catalog.json in lock-step with "
            "the regenerated manifest; skip only for offline / hermetic runs."
        ),
    )
    parser.add_argument(
        "--catalog-payload-file",
        help=(
            "Read the upstream product-catalog.json from a local JSON file when "
            "refreshing the fixture, instead of fetching it from the upstream "
            "main branch. Used for hermetic re-runs."
        ),
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    sources = load_sources(Path(args.sources))
    # Canonicalize the human-entered --release-tag filter so it resolves whether
    # it was typed v1.0.5, V1.0.5, or 1.0.5. sources.json stores the canonical
    # tag, so matching the normalized filter against it is sufficient.
    release_tag_filter = (
        normalize_tag(args.release_tag) if args.release_tag else args.release_tag
    )
    selected = filter_sources(
        sources, source_repo=args.source_repo, release_tag=release_tag_filter
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

    # Keep the vendored product-catalog fixture in lock-step with the firmware
    # we just staged. The manifest regeneration that follows this importer will
    # pick up the new version; the strict manifest<->catalog version guard
    # requires the fixture to move with it in the same commit. Refresh is a
    # hard step on a real (non-dry-run) import so we never produce a manifest
    # the fixture disagrees with.
    if args.dry_run:
        print("[dry-run] Skipping product-catalog fixture refresh.")
        return 0
    if args.skip_catalog_refresh:
        print(
            "Skipping product-catalog fixture refresh (--skip-catalog-refresh). "
            "Run scripts/refresh-product-catalog-fixture.py before committing or "
            "the manifest<->catalog version guard may fail."
        )
        return 0

    source_repo = args.source_repo
    if not source_repo:
        repos = {entry.get("source_repo") for entry in selected if entry.get("source_repo")}
        source_repo = next(iter(repos)) if len(repos) == 1 else (
            catalog_refresh.DEFAULT_SOURCE_REPO
        )
    upstream_catalog: Optional[Dict[str, Any]] = None
    if args.catalog_payload_file:
        catalog_payload_path = Path(args.catalog_payload_file)
        try:
            upstream_catalog = json.loads(
                catalog_payload_path.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as exc:
            raise SystemExit(
                f"Failed to load --catalog-payload-file {catalog_payload_path}: {exc}"
            ) from exc
    try:
        summary = catalog_refresh.refresh_catalog_fixture(
            DEFAULT_CATALOG_FIXTURE_PATH,
            upstream_catalog=upstream_catalog,
            source_repo=source_repo,
            token=token,
        )
    except catalog_refresh.CatalogRefreshError as exc:
        print(
            f"\nProduct-catalog fixture refresh failed: {exc}", file=sys.stderr
        )
        return 1
    if summary.get("changed"):
        print("Refreshed product-catalog fixture:")
        for change in summary.get("changes") or []:
            print(
                f"  - {change['identifier']}: {change['field']} "
                f"{change['from']!r} -> {change['to']!r}"
            )
    else:
        print("Product-catalog fixture already in sync; no changes.")
    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
