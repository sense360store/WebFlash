#!/usr/bin/env python3
"""Author a single ``firmware/sources.json`` entry from an upstream release.

WebFlash imports raw ``.bin`` firmware from upstream GitHub releases
(``sense360store/esphome-public``) via ``scripts/import-firmware-sources.py``.
That importer is driven by ``firmware/sources.json`` — but until now every
entry in that file was a *hand-edit*: an operator had to look up the asset
name, copy the pinned SHA256 out of ``checksums-sha256.txt``, and compute the
``block_tokens`` deny-list by hand. Hand-editing the pinned SHA and the token
deny-list is exactly the kind of step that is easy to get subtly wrong, and a
wrong ``block_tokens`` value can *reject the config's own legitimate binary*
(see the block-token note below).

This script removes that hand-edit. Given an upstream release, it generates (or
updates) exactly one ``firmware/sources.json`` entry whose shape matches what
``import-firmware-sources.py`` expects, so the generated entry resolves cleanly
through that importer.

What it does NOT do: download firmware, sign anything, regenerate
``manifest.json``/``firmware-*.json``, or deploy. Those stay with the existing
pipeline (``import-firmware-sources.py`` + ``gen-manifests.py`` +
``firmware-publish.yml``). This script only authors a *source declaration*.

Design notes
------------
* **Stdlib only.** Matches the rest of ``scripts/`` (no pip dependency). In
  particular this module deliberately does NOT import the sibling
  ``import-firmware-sources.py`` / ``gen-manifests.py`` modules, so it stays
  trivially unit-testable offline. The checksum-line parsing below is a
  byte-identical copy of ``import-firmware-sources.parse_sha256_manifest`` so
  the pinned SHA this script writes is parsed by the importer the same way.
* **Pure logic is separated from network I/O** so every derivation
  (``build_entry`` and friends) is unit-testable with synthetic data and no
  network.

block_tokens (the critical bit)
-------------------------------
``import-firmware-sources.assert_block_tokens_absent`` UNIONS the config's own
hyphen-split tokens into the haystack it scans for blocked tokens. So if a
``block_tokens`` deny-list ever contained a token that is *also one of the
config's own tokens*, the importer would reject that config's legitimate
binary. To stay safe we compute::

    block_tokens = base_deny_set  MINUS  the config's own (hyphen-split,
                   lowercased) tokens          [a per-config override wins]

with ``base_deny_set`` defaulting to ``["FanTRIAC", "LED"]``. This reproduces
the two committed Release-One-era entries exactly::

    Ceiling-POE-VentIQ-RoomIQ      -> ["FanTRIAC", "LED"]
    Ceiling-POE-VentIQ-RoomIQ-LED  -> ["FanTRIAC"]     (LED is its own token)

Usage
-----
    # Print-only (default): show the entry that WOULD be written.
    python scripts/add-firmware-source.py \
        --tag v1.0.0 --config Ceiling-POE-VentIQ-RoomIQ

    # Write it into firmware/sources.json (upsert + canonical sort).
    python scripts/add-firmware-source.py \
        --tag v1.0.0-preview --config Ceiling-POE-AirIQ-RoomIQ --write
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

USER_AGENT = "sense360-webflash-source-author/1.0"

DEFAULT_SOURCE_REPO = "sense360store/esphome-public"

# Defaults baked into the script. firmware/sources-policy.json (when present)
# may override any of these; the script works identically whether or not that
# file exists.
DEFAULT_BASE_BLOCK_TOKENS: Tuple[str, ...] = ("FanTRIAC", "LED")
DEFAULT_REQUIRED_SECTIONS: Tuple[str, ...] = (
    "Changelog",
    "Known Issues",
    "Features",
    "Hardware Requirements",
)
DEFAULT_MIN_SIZE_BYTES = 102_400
# Optional companion assets, included in required_assets only when actually
# present in the release. checksums-sha256.txt is mandatory and handled
# separately (it is the source of the pinned SHA).
DEFAULT_STANDARD_ASSETS: Tuple[str, ...] = (
    "checksums-sha256.txt",
    "checksums-md5.txt",
    "manifest.json",
)
MANDATORY_CHECKSUM_ASSET = "checksums-sha256.txt"
SCHEMA_VERSION = 1

# Byte-identical copy of import-firmware-sources.parse_sha256_manifest's line
# regex so the SHA we pin is read back by the importer the same way. Accepts
# both "<hex>  <name>" and "<hex> *<name>" (binary mode) and tolerates a
# leading "./" on the filename.
_CHECKSUM_LINE_RE = re.compile(r"^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$")
_HEX64_RE = re.compile(r"^[0-9a-fA-F]{64}$")
_SEMVER_RE = re.compile(r"(\d+\.\d+\.\d+)")

# Canonical key order for a generated entry. Mirrors the committed preview
# entries in firmware/sources.json so generated entries read identically.
_ENTRY_KEY_ORDER: Tuple[str, ...] = (
    "source_repo",
    "release_tag",
    "release_url",
    "version",
    "channel",
    "config_string",
    "asset_name",
    "expected_sha256",
    "min_size_bytes",
    "required_assets",
    "required_release_body_sections",
    "block_tokens",
)


class SourceAuthoringError(RuntimeError):
    """Raised on any fail-closed condition (clear, actionable message)."""


# =====================================================================
# Pure logic (no network) — unit-testable with synthetic data.
# =====================================================================


def normalize_tag(raw: str) -> str:
    """Canonicalize a human-entered release tag to Sense360's form.

    Sense360 release tags are ``v`` + semver + an optional lowercase channel
    suffix, all lowercase (e.g. ``v1.0.0``, ``v1.0.0-preview``). Humans type
    them inconsistently, so this canonicalizes formatting only — it never
    changes *which* release is meant:

    * trim surrounding whitespace,
    * lowercase the whole string (so an uppercase channel suffix like
      ``-PREVIEW`` matches, and ``infer_channel`` sees the canonical suffix),
    * ensure exactly one leading ``v`` (prepend when absent).

    So ``"V1.0.5"`` -> ``"v1.0.5"``, ``" 1.0.5 "`` -> ``"v1.0.5"``, and
    ``"v1.0.0-PREVIEW"`` -> ``"v1.0.0-preview"``. An empty / whitespace-only
    input normalizes to ``""`` (which still fails closed downstream).
    """

    text = (raw or "").strip().lower()
    if not text:
        return text
    # Collapse any leading run of 'v's down to exactly one. The semver core
    # always starts with a digit, so stripping leading 'v's never eats part of
    # the version.
    return "v" + text.lstrip("v")


def infer_channel(tag: str) -> str:
    """Infer the release channel from a tag suffix.

    ``-dev`` -> dev, ``-beta`` -> beta, ``-preview`` -> preview, else stable.
    e.g. ``v1.0.0`` -> stable, ``v1.0.0-preview`` -> preview,
    ``v1.0.0-led-preview`` -> preview.
    """

    text = (tag or "").strip()
    for suffix, channel in (("-dev", "dev"), ("-beta", "beta"), ("-preview", "preview")):
        if text.endswith(suffix):
            return channel
    return "stable"


def derive_version(tag: str, explicit: Optional[str] = None) -> str:
    """Return the MAJOR.MINOR.PATCH version.

    Uses ``explicit`` when provided (a leading ``v`` is tolerated), otherwise
    parses the first semver core out of ``tag``. Fails closed when no
    ``\\d+.\\d+.\\d+`` can be found.
    """

    source = explicit if (explicit and explicit.strip()) else tag
    match = _SEMVER_RE.search(source or "")
    if not match:
        where = f"--version {explicit!r}" if (explicit and explicit.strip()) else f"tag {tag!r}"
        raise SourceAuthoringError(
            f"Could not parse a MAJOR.MINOR.PATCH version from {where}. "
            "Pass --version explicitly (e.g. --version 1.0.0)."
        )
    return match.group(1)


def derive_asset_name(config_string: str, version: str, channel: str) -> str:
    """Canonical firmware asset filename: ``Sense360-<config>-v<ver>-<chan>.bin``."""

    return f"Sense360-{config_string}-v{version}-{channel}.bin"


def parse_sha256_manifest(text: str) -> Dict[str, str]:
    """Parse a ``sha256sum``-style file into ``{filename: hex_digest}``.

    Byte-for-byte the same behaviour as
    ``import-firmware-sources.parse_sha256_manifest``.
    """

    checksums: Dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = _CHECKSUM_LINE_RE.match(line)
        if not match:
            continue
        digest = match.group(1).lower()
        name = match.group(2)
        if name.startswith("./"):
            name = name[2:]
        checksums[name] = digest
    return checksums


def extract_pinned_sha(checksum_text: str, asset_name: str) -> str:
    """Return the 64-hex-lowercase SHA256 for ``asset_name``.

    Fails closed when the asset has no line, or when its SHA column is not a
    64-character hex digest.
    """

    checksums = parse_sha256_manifest(checksum_text)
    sha = checksums.get(asset_name)
    if sha:
        # parse_sha256_manifest only yields 64-hex lowercase digests; re-assert
        # to fail closed should that ever change.
        if not _HEX64_RE.match(sha):
            raise SourceAuthoringError(
                f"checksums-sha256.txt entry for '{asset_name}' is not a "
                f"64-character hex SHA256: {sha!r}."
            )
        return sha.lower()

    # Not matched by the strict importer regex. Distinguish "present but the SHA
    # column is malformed" from "absent" for a clearer operator message.
    for raw_line in checksum_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 2:
            name = parts[-1].lstrip("*")
            if name.startswith("./"):
                name = name[2:]
            if name == asset_name and not _HEX64_RE.match(parts[0]):
                raise SourceAuthoringError(
                    f"checksums-sha256.txt lists '{asset_name}' but its SHA "
                    f"column {parts[0]!r} is not a 64-character hex digest."
                )
    available = ", ".join(sorted(checksums)) or "(no parseable entries)"
    raise SourceAuthoringError(
        f"checksums-sha256.txt has no SHA256 entry for '{asset_name}'. "
        f"Entries present: {available}."
    )


def derive_block_tokens(
    config_string: str,
    base_block_tokens: Sequence[str],
    override: Optional[Sequence[str]] = None,
) -> List[str]:
    """Compute the per-config ``block_tokens`` deny-list.

    ``base_block_tokens`` MINUS the config's own hyphen-split lowercased tokens,
    preserving base order. A per-config ``override`` wins outright.

    The subtraction is load-bearing: ``import-firmware-sources`` unions the
    config's own tokens into the haystack it scans, so leaving a self-token in
    the deny-list would reject the config's own legitimate binary.
    """

    if override is not None:
        return list(override)
    own_tokens = {tok.lower() for tok in config_string.split("-") if tok}
    return [tok for tok in base_block_tokens if tok.lower() not in own_tokens]


def normalize_policy(policy: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Merge a (possibly partial / absent) policy doc onto the script defaults."""

    policy = policy or {}
    base_block_tokens = policy.get("base_block_tokens")
    required_sections = policy.get("required_release_body_sections")
    min_size_bytes = policy.get("min_size_bytes")
    standard_assets = policy.get("standard_assets")
    overrides = policy.get("overrides")
    return {
        "base_block_tokens": list(base_block_tokens)
        if isinstance(base_block_tokens, list)
        else list(DEFAULT_BASE_BLOCK_TOKENS),
        "required_release_body_sections": list(required_sections)
        if isinstance(required_sections, list)
        else list(DEFAULT_REQUIRED_SECTIONS),
        "min_size_bytes": int(min_size_bytes)
        if isinstance(min_size_bytes, int)
        else DEFAULT_MIN_SIZE_BYTES,
        "standard_assets": list(standard_assets)
        if isinstance(standard_assets, list)
        else list(DEFAULT_STANDARD_ASSETS),
        "overrides": overrides if isinstance(overrides, dict) else {},
    }


def _override_block_tokens(
    overrides: Dict[str, Any], config_string: str
) -> Optional[List[str]]:
    cfg_override = overrides.get(config_string)
    if isinstance(cfg_override, dict) and isinstance(
        cfg_override.get("block_tokens"), list
    ):
        return list(cfg_override["block_tokens"])
    return None


def build_entry(
    *,
    source_repo: str,
    release_tag: str,
    config_string: str,
    version: str,
    channel: str,
    asset_names: Sequence[str],
    checksum_text: str,
    policy: Optional[Dict[str, Any]] = None,
    release_url: Optional[str] = None,
    existing: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build one firmware/sources.json entry from already-fetched release data.

    Pure: ``asset_names`` is the list of asset names present in the release and
    ``checksum_text`` is the raw ``checksums-sha256.txt`` body. No network.

    Fails closed when: the expected ``.bin`` is absent (lists available
    ``.bin`` assets), ``checksums-sha256.txt`` is absent, or the pinned SHA is
    missing / not 64-hex.
    """

    resolved = normalize_policy(policy)
    asset_set = set(asset_names)

    asset_name = derive_asset_name(config_string, version, channel)
    if asset_name not in asset_set:
        bins = sorted(name for name in asset_names if name.endswith(".bin"))
        raise SourceAuthoringError(
            f"Release does not expose the expected firmware asset "
            f"'{asset_name}'. Available .bin assets: "
            f"{', '.join(bins) if bins else '(none)'}."
        )
    if MANDATORY_CHECKSUM_ASSET not in asset_set:
        raise SourceAuthoringError(
            f"Release is missing mandatory asset '{MANDATORY_CHECKSUM_ASSET}'; "
            "cannot pin a SHA256."
        )

    expected_sha256 = extract_pinned_sha(checksum_text, asset_name)

    # required_assets = [asset_name] + standard assets actually present, in a
    # stable order. checksums-sha256.txt is guaranteed present above.
    required_assets: List[str] = [asset_name]
    for name in resolved["standard_assets"]:
        if name in asset_set and name not in required_assets:
            required_assets.append(name)
    if MANDATORY_CHECKSUM_ASSET not in required_assets:
        required_assets.append(MANDATORY_CHECKSUM_ASSET)

    block_tokens = derive_block_tokens(
        config_string,
        resolved["base_block_tokens"],
        _override_block_tokens(resolved["overrides"], config_string),
    )

    entry: Dict[str, Any] = {
        "source_repo": source_repo,
        "release_tag": release_tag,
        "release_url": release_url
        or f"https://github.com/{source_repo}/releases/tag/{release_tag}",
        "version": version,
        "channel": channel,
        "config_string": config_string,
        "asset_name": asset_name,
        "expected_sha256": expected_sha256,
        "min_size_bytes": resolved["min_size_bytes"],
        "required_assets": required_assets,
        "required_release_body_sections": list(
            resolved["required_release_body_sections"]
        ),
        "block_tokens": block_tokens,
    }

    # Preserve any human-managed fields the existing entry carried that this
    # generator does not own (e.g. webflash_import_eligibility). Never silently
    # drop data on replace. Canonical keys keep their order; preserved extras
    # follow.
    if existing:
        for key, value in existing.items():
            if key not in entry:
                entry[key] = value

    return entry


def source_key(entry: Dict[str, Any]) -> Tuple[str, str, str]:
    """Identity of a source entry: (source_repo, config_string, channel)."""

    return (
        entry.get("source_repo", ""),
        entry.get("config_string", ""),
        entry.get("channel", ""),
    )


def find_existing(
    sources: Sequence[Dict[str, Any]], key: Tuple[str, str, str]
) -> Optional[Dict[str, Any]]:
    for entry in sources:
        if source_key(entry) == key:
            return entry
    return None


def upsert_source(
    sources: Sequence[Dict[str, Any]], entry: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Replace the entry with the same key (else append), return sorted list.

    Keyed by (source_repo, config_string, channel). Output is deterministically
    sorted by that key so diffs stay clean and stable across runs.
    """

    key = source_key(entry)
    result = [item for item in sources if source_key(item) != key]
    result.append(entry)
    result.sort(key=source_key)
    return result


def order_entry_keys(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Return ``entry`` with canonical keys first, preserved extras after."""

    ordered: Dict[str, Any] = {}
    for key in _ENTRY_KEY_ORDER:
        if key in entry:
            ordered[key] = entry[key]
    for key, value in entry.items():
        if key not in ordered:
            ordered[key] = value
    return ordered


def serialize_sources_doc(doc: Dict[str, Any]) -> str:
    """Serialize the sources doc: 4-space indent, trailing newline."""

    ordered_sources = [order_entry_keys(entry) for entry in doc.get("sources", [])]
    out = dict(doc)
    out["sources"] = ordered_sources
    return json.dumps(out, indent=4, ensure_ascii=False) + "\n"


# =====================================================================
# Sources file I/O
# =====================================================================


def load_sources_doc(path: Path) -> Dict[str, Any]:
    """Load firmware/sources.json (or start a fresh doc when absent).

    Fails closed when the file exists with an unsupported ``schema_version``.
    """

    if not path.exists():
        return {"schema_version": SCHEMA_VERSION, "sources": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SourceAuthoringError(
            f"Sources manifest {path} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise SourceAuthoringError(
            f"Sources manifest {path} must be a JSON object."
        )
    if data.get("schema_version") != SCHEMA_VERSION:
        raise SourceAuthoringError(
            f"Sources manifest {path} has unsupported schema_version="
            f"{data.get('schema_version')!r}; expected {SCHEMA_VERSION}."
        )
    if not isinstance(data.get("sources"), list):
        data["sources"] = []
    return data


def write_sources_doc(path: Path, doc: Dict[str, Any]) -> None:
    path.write_text(serialize_sources_doc(doc), encoding="utf-8")


def load_policy(path: Optional[Path]) -> Dict[str, Any]:
    """Load and normalize the optional policy file (defaults when absent)."""

    if path is None or not path.exists():
        return normalize_policy(None)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SourceAuthoringError(
            f"Policy file {path} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise SourceAuthoringError(f"Policy file {path} must be a JSON object.")
    return normalize_policy(data)


# =====================================================================
# GitHub API I/O (mirrors import-firmware-sources.py conventions)
# =====================================================================


def list_release_tags(source_repo: str, token: Optional[str]) -> List[str]:
    """Return the repo's available release tag names (best-effort).

    Used only to enrich a 404 error message, so this never raises: any failure
    (network, rate-limit, non-JSON) yields an empty list and the caller falls
    back to a plain "no release matching" message.
    """

    url = f"https://api.github.com/repos/{source_repo}/releases?per_page=100"
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
            data = json.loads(response.read().decode(charset))
    except Exception:  # pragma: no cover - best-effort enrichment only
        return []
    if not isinstance(data, list):
        return []
    return [
        release["tag_name"]
        for release in data
        if isinstance(release, dict) and isinstance(release.get("tag_name"), str)
    ]


def fetch_release_metadata(
    source_repo: str,
    release_tag: str,
    token: Optional[str],
    *,
    raw_tag: Optional[str] = None,
) -> Dict[str, Any]:
    url = f"https://api.github.com/repos/{source_repo}/releases/tags/{release_tag}"
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
        if exc.code == 404:
            # A genuinely nonexistent tag still fails closed (SourceAuthoringError);
            # we just make the message actionable by showing what the operator
            # typed, the canonical form we resolved it to, and the tags that do
            # exist upstream.
            shown_input = raw_tag if raw_tag is not None else release_tag
            available = list_release_tags(source_repo, token)
            available_str = ", ".join(available) if available else "(none found)"
            raise SourceAuthoringError(
                f"GitHub API found no release matching '{shown_input}' "
                f"(normalized '{release_tag}') in {source_repo}; "
                f"available: {available_str}."
            ) from exc
        raise SourceAuthoringError(
            f"GitHub API request for {source_repo} {release_tag} failed: "
            f"{exc.code} {exc.reason}. The default GITHUB_TOKEN can read public "
            "cross-repo releases; check the tag exists."
        ) from exc
    except urllib.error.URLError as exc:  # pragma: no cover - network failure
        raise SourceAuthoringError(
            f"GitHub API request for {source_repo} {release_tag} failed: {exc}"
        ) from exc
    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise SourceAuthoringError(
            f"GitHub API response for {source_repo} {release_tag} was not JSON."
        ) from exc


def index_assets_by_name(release: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    indexed: Dict[str, Dict[str, Any]] = {}
    for asset in release.get("assets") or []:
        name = asset.get("name")
        if isinstance(name, str):
            indexed[name] = asset
    return indexed


def _asset_download_url(asset: Dict[str, Any], token: Optional[str]) -> str:
    # The API ``url`` requires the token; ``browser_download_url`` works
    # anonymously. Prefer the API URL when we have a token (rate-limit
    # friendly in CI), fall back to the browser URL otherwise. Same rule as
    # import-firmware-sources.py.
    if token and asset.get("url"):
        return asset["url"]
    return asset.get("browser_download_url") or asset.get("url")


def download_text(url: str, token: Optional[str]) -> str:
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
        with urllib.request.urlopen(request) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset)
    except urllib.error.HTTPError as exc:
        raise SourceAuthoringError(
            f"Failed to download {url}: HTTP {exc.code} {exc.reason}."
        ) from exc
    except urllib.error.URLError as exc:  # pragma: no cover - network failure
        raise SourceAuthoringError(f"Failed to download {url}: {exc}") from exc


# =====================================================================
# CLI
# =====================================================================


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate or update a single firmware/sources.json entry from an "
            "upstream GitHub release."
        )
    )
    parser.add_argument(
        "--repo",
        default=DEFAULT_SOURCE_REPO,
        help=f"Upstream source repo (default: {DEFAULT_SOURCE_REPO}).",
    )
    parser.add_argument(
        "--tag",
        required=True,
        help="Upstream release tag (e.g. v1.0.0 or v1.0.0-preview).",
    )
    parser.add_argument(
        "--config",
        required=True,
        dest="config",
        help="The config_string (e.g. Ceiling-POE-VentIQ-RoomIQ).",
    )
    parser.add_argument(
        "--channel",
        default=None,
        help=(
            "Release channel. Default: inferred from the tag suffix "
            "(-preview/-beta/-dev) else stable."
        ),
    )
    parser.add_argument(
        "--version",
        dest="version",
        default=None,
        help="Semver version. Default: parsed from the tag (e.g. v1.0.0 -> 1.0.0).",
    )
    parser.add_argument(
        "--sources",
        default=str(REPO_ROOT / "firmware" / "sources.json"),
        help="Path to the sources manifest (default: firmware/sources.json).",
    )
    parser.add_argument(
        "--policy",
        default=str(REPO_ROOT / "firmware" / "sources-policy.json"),
        help=(
            "Optional policy overrides (default: firmware/sources-policy.json). "
            "The script works if this file is absent."
        ),
    )
    parser.add_argument(
        "--token",
        default=None,
        help="GitHub token; falls back to GITHUB_TOKEN / GH_TOKEN env vars.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write the entry into the sources manifest. Default: print only.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    token = (
        args.token
        or os.environ.get("GITHUB_TOKEN")
        or os.environ.get("GH_TOKEN")
    )

    try:
        # Canonicalize the human-entered tag once, up front, so fetch,
        # derive_version, and infer_channel all see the same canonical form
        # (e.g. "V1.0.5" / " 1.0.5 " -> "v1.0.5", "-PREVIEW" -> "-preview").
        # This only normalizes formatting; a nonexistent tag still 404s below.
        tag = normalize_tag(args.tag)
        policy = load_policy(Path(args.policy) if args.policy else None)
        channel = (args.channel or "").strip() or infer_channel(tag)
        version = derive_version(tag, args.version)

        release = fetch_release_metadata(args.repo, tag, token, raw_tag=args.tag)
        asset_index = index_assets_by_name(release)
        asset_names = list(asset_index.keys())

        # Download checksums-sha256.txt (when present) so build_entry can pin
        # the SHA. build_entry still owns the fail-closed checks; when the
        # asset is absent we pass empty text and let it raise the clear error.
        checksum_text = ""
        if MANDATORY_CHECKSUM_ASSET in asset_index:
            checksum_text = download_text(
                _asset_download_url(asset_index[MANDATORY_CHECKSUM_ASSET], token),
                token,
            )

        doc = load_sources_doc(Path(args.sources))
        existing = find_existing(
            doc.get("sources", []),
            (args.repo, args.config, channel),
        )

        entry = build_entry(
            source_repo=args.repo,
            release_tag=tag,
            config_string=args.config,
            version=version,
            channel=channel,
            asset_names=asset_names,
            checksum_text=checksum_text,
            policy=policy,
            release_url=release.get("html_url"),
            existing=existing,
        )
    except SourceAuthoringError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1

    ordered = order_entry_keys(entry)
    verb = "Updating" if existing else "Adding"

    if not args.write:
        print(
            f"# Print-only ({verb.lower()} {args.config} / {channel}). "
            "Re-run with --write to apply.",
            file=sys.stderr,
        )
        print(json.dumps(ordered, indent=4, ensure_ascii=False))
        return 0

    doc["sources"] = upsert_source(doc.get("sources", []), entry)
    write_sources_doc(Path(args.sources), doc)
    print(f"✓ {verb} {args.config} ({channel}) in {args.sources}")
    print(f"  asset_name:     {ordered['asset_name']}")
    print(f"  expected_sha256:{ordered['expected_sha256']}")
    print(f"  block_tokens:   {ordered['block_tokens']}")
    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
