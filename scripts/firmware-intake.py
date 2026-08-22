#!/usr/bin/env python3
"""One-shot WebFlash firmware intake: author + import + retire + refresh.

This orchestrator replaces the two-step operator sequence
("Release 4: Add Source" ``scripts/add-firmware-source.py`` followed by a
separate manual dispatch of "Release 5: Import Firmware"
``scripts/import-firmware-sources.py``) with ONE combined, fail-closed pass
for a single upstream release + config. It is the engine behind
``.github/workflows/firmware-intake.yml`` and is deliberately runnable (and
unit-testable) offline via payload files.

What one successful run stages (never commits, never deploys):

1. **Eligibility gate (WebFlash-owned lanes).** The config must appear in the
   vendored catalog fixture ``__tests__/fixtures/esphome-product-catalog.json``
   with ``webflash_build_matrix: true`` OR an explicit
   ``webflash_import_eligibility.eligible: true``. Upstream lifecycle
   ``status`` is deliberately NOT consulted — these are the two WebFlash-owned
   authorisation lanes established by PR #607 (they are curated fixture
   fields; ``refresh-product-catalog-fixture.py`` never syncs them from
   upstream). Firmware existing upstream is never authorisation.
2. **Source authoring.** Reuses ``add-firmware-source.py`` to derive the asset
   name, pin the SHA256 from the upstream ``checksums-sha256.txt``, compute
   ``block_tokens``, and upsert exactly one ``firmware/sources.json`` entry
   (keyed on source_repo + config_string + channel; human-managed extra
   fields on the replaced entry are preserved).
3. **Import.** Delegates to ``import-firmware-sources.import_source_entry``,
   so EVERY existing gate still runs unchanged: required assets, upstream
   checksum match, pinned ``expected_sha256`` match, the W-H1
   default-credential scan, filename/config-string match, ``block_tokens``
   (FanTRIAC/LED), minimum size, required release-body sections, sidecar
   provenance, and the same-channel superseded-version prune.
4. **Cross-channel retirement.** ``prune_superseded_configurations`` only
   removes a superseded build on the SAME channel. When the incoming version
   strictly supersedes a same-config build on a DIFFERENT channel (the
   AirIQ-RoomIQ v1.0.9-stable → v1.0.10-preview case, PR #607), this
   orchestrator retires it: the old ``.bin``/``.meta.json``/``.md`` are
   removed, its ``firmware/sources.json`` entry is dropped (clean
   supersession — the ``delisted_sources`` register is NEVER touched), and a
   retired-register entry is appended to the expected-surface fixture.
5. **Expected-surface fixture.** ``__tests__/fixtures/expected-surface.json``
   is updated mechanically in the same change set, per its own review_rule
   ("a surface change must edit this file in the SAME PR"): the config's
   ``builds[]`` entry is upserted (sorted, one build per config) and
   cross-channel retirements are appended to ``retired`` with a run-scoped
   ``retired_in`` label (the workflow passes its run URL via ``--retired-in``)
   that the workflow later resolves to the real PR number
   (``--set-retired-in`` + ``--retired-in-match``). Existing entries are
   never edited or removed.
6. **Catalog fixture refresh.** Reuses
   ``refresh-product-catalog-fixture.refresh_catalog_fixture`` so the
   vendored catalog moves in lock-step with the staged firmware.

What it does NOT do: regenerate/sign ``manifest.json`` (the workflow runs
``gen-manifests.py`` with the same signing handshake as
``firmware-publish.yml``), run the test suites, commit, push, open the PR,
merge, or deploy. ``firmware-publish.yml`` remains the sole publication
boundary — nothing here ships until the intake PR merges to ``main`` through
the normal review gate.

Fail-closed refusals (each aborts with a clear message, exit 1):

* config_string not shaped like a config token, or ``Rescue``, or carrying a
  ``FanTRIAC`` segment;
* channel outside {stable, preview};
* config absent from the vendored catalog fixture, or present without either
  WebFlash-owned eligibility lane;
* config present in the ``firmware/sources.json`` ``delisted_sources``
  register (re-listing is a human decision, never automated intake);
* the derived asset filename matches an entry in the expected-surface
  ``retired`` register (retired artifacts must never reappear);
* the incoming version is equal to a different-channel build, or strictly
  older than ANY same-config build/source entry (no downgrades, no ambiguous
  two-build states), or a same-config source entry exists for a different
  source repo;
* the upstream asset for an ALREADY-declared or already-staged version now
  hashes differently (a replaced upstream asset never silently re-pins or
  overwrites staged bytes — that is a human decision);
* every import-time gate delegated to ``import_source_entry``.

Usage::

    # Stage a release into the working tree (network).
    python3 scripts/firmware-intake.py \
        --tag v1.0.11-preview --config Ceiling-POE-AirIQ-RoomIQ

    # Validate everything, write nothing.
    python3 scripts/firmware-intake.py \
        --tag v1.0.11-preview --config Ceiling-POE-AirIQ-RoomIQ --dry-run

    # Hermetic run (tests / offline): supply payloads, skip catalog fetch.
    python3 scripts/firmware-intake.py \
        --tag v1.0.11-preview --config Ceiling-POE-AirIQ-RoomIQ \
        --release-payload-file release.json --skip-catalog-refresh

    # After the PR exists: resolve the retired_in placeholder.
    python3 scripts/firmware-intake.py --set-retired-in "#612"
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

DEFAULT_SOURCES_PATH = REPO_ROOT / "firmware" / "sources.json"
DEFAULT_POLICY_PATH = REPO_ROOT / "firmware" / "sources-policy.json"
DEFAULT_FIRMWARE_DIR = REPO_ROOT / "firmware"
DEFAULT_SURFACE_FIXTURE = REPO_ROOT / "__tests__" / "fixtures" / "expected-surface.json"
DEFAULT_CATALOG_FIXTURE = (
    REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
)

# Placeholder written into mechanically-appended retired-register entries.
# The workflow resolves it to the real PR reference with --set-retired-in
# once the PR exists (the PR number is unknowable before `gh pr create`).
RETIRED_IN_PLACEHOLDER = "PENDING-INTAKE-PR"

# Mirrors the expected-surface helper's CONFIG_RE, with a sane length cap so
# an attacker-controlled repository_dispatch payload cannot smuggle an
# arbitrarily long string into filenames / branch names.
_CONFIG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,63}$")
ACTIVE_CHANNELS = ("stable", "preview")
FANTRIAC_TOKEN = "fantriac"
RESCUE_CONFIG = "rescue"


def _load_sibling(name: str, filename: str):
    path = SCRIPT_DIR / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:  # pragma: no cover - import guard
        raise ImportError(f"Unable to load helper module {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


add_source = _load_sibling("add_firmware_source", "add-firmware-source.py")
importer = _load_sibling("import_firmware_sources", "import-firmware-sources.py")
# The importer already loads these siblings; reuse its instances so every
# gate implementation is byte-identical to the Release 5 path.
gen_manifests = importer.gen_manifests
sync_releases = importer.sync_releases
catalog_refresh = importer.catalog_refresh


class IntakeError(RuntimeError):
    """Raised on any fail-closed condition (clear, actionable message)."""


# =====================================================================
# Pure helpers (no network) — unit-testable with synthetic data.
# =====================================================================


def validate_config_string(config: str) -> str:
    text = (config or "").strip()
    if not _CONFIG_RE.match(text):
        raise IntakeError(
            f"config_string {config!r} is not a valid config token "
            "(letters/digits/hyphens, max 64 chars)."
        )
    tokens = {tok.lower() for tok in text.split("-") if tok}
    if RESCUE_CONFIG in tokens:
        raise IntakeError(
            "The Rescue build is built in-tree (firmware/rescue/) and is never "
            "imported through intake."
        )
    if FANTRIAC_TOKEN in tokens:
        raise IntakeError(
            f"config_string {text!r} carries the blocked FanTRIAC token. "
            "FanTRIAC stays import-blocked (HW-005); intake refuses it outright."
        )
    return text


def assert_webflash_eligibility_lane(
    catalog: Dict[str, Any], config_string: str
) -> Dict[str, Any]:
    """Authorise via the WebFlash-owned lanes (PR #607); never via status.

    Returns the matching catalog product entry. Raises when the config is
    absent or neither lane authorises it. Upstream lifecycle ``status`` is
    deliberately ignored: the two lanes are curated WebFlash-owned fixture
    fields (the catalog refresh never syncs them from upstream), so exposure
    is only ever authorised by a deliberate WebFlash edit.
    """

    products = catalog.get("products")
    if not isinstance(products, list):
        raise IntakeError(
            "Vendored catalog fixture is malformed: no 'products' array."
        )
    entry = next(
        (
            p
            for p in products
            if isinstance(p, dict) and p.get("config_string") == config_string
        ),
        None,
    )
    if entry is None:
        raise IntakeError(
            f"config_string '{config_string}' is not in the vendored catalog "
            "fixture (__tests__/fixtures/esphome-product-catalog.json). A "
            "WebFlash-owned eligibility decision (webflash_build_matrix or "
            "webflash_import_eligibility) must land first; upstream firmware "
            "existence is never authorisation."
        )
    build_matrix = entry.get("webflash_build_matrix") is True
    explicit = (
        isinstance(entry.get("webflash_import_eligibility"), dict)
        and entry["webflash_import_eligibility"].get("eligible") is True
    )
    if not (build_matrix or explicit):
        raise IntakeError(
            f"config_string '{config_string}' is not authorised by either "
            "WebFlash-owned eligibility lane (webflash_build_matrix=true or "
            "webflash_import_eligibility.eligible=true). Upstream lifecycle "
            f"status '{entry.get('status')}' does not authorise WebFlash "
            "exposure (PR #607)."
        )
    return entry


def assert_not_delisted(sources_doc: Dict[str, Any], config_string: str) -> None:
    for delisted in sources_doc.get("delisted_sources") or []:
        if isinstance(delisted, dict) and delisted.get("config_string") == config_string:
            raise IntakeError(
                f"config_string '{config_string}' is in the delisted_sources "
                "register of firmware/sources.json. Re-listing a delisted "
                "config is a human decision (fresh source entry + new "
                "eligibility decision), never automated intake."
            )


def _surface_bin_name(entry: Dict[str, Any]) -> str:
    """Canonical artifact filename for a surface-fixture entry.

    Mirrors ``binNameFor`` in ``__tests__/helpers/expected-surface.js``:
    ``file_channel`` names the immutable filename channel when it differs from
    the SERVED channel.
    """

    channel = entry.get("file_channel") or entry.get("channel")
    return f"Sense360-{entry.get('config_string')}-v{entry.get('version')}-{channel}.bin"


def assert_not_retired_artifact(
    surface_fixture: Dict[str, Any], asset_name: str
) -> None:
    for retired in surface_fixture.get("retired") or []:
        if isinstance(retired, dict) and _surface_bin_name(retired) == asset_name:
            raise IntakeError(
                f"Asset '{asset_name}' matches an entry in the expected-surface "
                "retired register — retired artifacts must never reappear."
            )


def plan_supersession(
    *,
    config_string: str,
    version: str,
    channel: str,
    configurations_dir: Path,
    sources: Sequence[Dict[str, Any]],
    source_repo: str,
) -> Dict[str, Any]:
    """Classify existing same-config builds/entries against the incoming one.

    Returns ``{"retire_bins": [Path], "retire_source_keys": [tuple]}`` where
    ``retire_bins`` are strictly-older same-config builds on a DIFFERENT
    channel (same-channel supersession is the importer prune's job) and
    ``retire_source_keys`` are the sources.json entry keys to drop. Fails
    closed on any state that would leave two builds for one config or would
    be a downgrade.
    """

    retire_bins: List[Path] = []
    if configurations_dir.exists():
        for bin_path in sorted(configurations_dir.glob("*.bin")):
            try:
                other = gen_manifests.parse_firmware_metadata(
                    bin_path, default_channel="stable", force_configuration=True
                )
            except ValueError:
                continue
            if not other.is_configuration:
                continue
            if other.config_string != config_string:
                continue
            if other.version == version:
                if other.channel == channel:
                    continue  # idempotent re-import; the importer handles it
                raise IntakeError(
                    f"A {config_string} v{version} build already exists on the "
                    f"'{other.channel}' channel ({bin_path.name}); importing the "
                    f"same version on '{channel}' would leave two builds for one "
                    "config. Resolve the channel decision manually."
                )
            if gen_manifests.version_is_newer(other.version, version):
                raise IntakeError(
                    f"On-disk build {bin_path.name} (v{other.version}) is newer "
                    f"than the incoming v{version}; intake never downgrades. "
                    "Retire the newer build manually if this is intended."
                )
            if other.channel != channel:
                retire_bins.append(bin_path)
            # Same-channel strictly-older builds are pruned by
            # prune_superseded_configurations inside the importer.

    retire_source_keys: List[tuple] = []
    for entry in sources:
        if not isinstance(entry, dict):
            continue
        if entry.get("config_string") != config_string:
            continue
        key = add_source.source_key(entry)
        if key == (source_repo, config_string, channel):
            # The upsert target. A declared-but-not-yet-imported NEWER version
            # must not be silently replaced by an older dispatch: refuse the
            # downgrade even when no bin is on disk yet.
            declared = str(entry.get("version") or "")
            if declared and gen_manifests.version_is_newer(declared, version):
                raise IntakeError(
                    f"firmware/sources.json already declares '{config_string}' "
                    f"({channel}) at v{declared}; intake never downgrades to "
                    f"v{version}. Retire the newer declaration manually if "
                    "this is intended."
                )
            continue
        if entry.get("source_repo") != source_repo:
            raise IntakeError(
                f"firmware/sources.json already declares '{config_string}' from "
                f"a different source repo ({entry.get('source_repo')}); intake "
                "refuses ambiguous ownership."
            )
        other_version = str(entry.get("version") or "")
        if other_version and not gen_manifests.version_is_newer(
            version, other_version
        ):
            raise IntakeError(
                f"firmware/sources.json entry {key} declares version "
                f"{other_version}, which is not strictly older than the "
                f"incoming v{version}; intake refuses downgrades and "
                "ambiguous two-entry states."
            )
        retire_source_keys.append(key)

    return {"retire_bins": retire_bins, "retire_source_keys": retire_source_keys}


def update_surface_fixture(
    fixture: Dict[str, Any],
    *,
    config_string: str,
    version: str,
    channel: str,
    retired_builds: Sequence[Dict[str, Any]],
    retired_in: str = RETIRED_IN_PLACEHOLDER,
) -> Dict[str, Any]:
    """Upsert the config's builds[] entry and append retired entries.

    Mechanical, append/upsert only: existing build entries for OTHER configs
    and existing retired entries are never edited or removed. ``retired_builds``
    entries are ``{config_string, version, channel, file_channel?}`` describing
    the artifacts this intake retired across channels; each is appended with a
    ``retired_in`` placeholder unless the same artifact key already exists.
    """

    if fixture.get("schema_version") != 1:
        raise IntakeError(
            "expected-surface.json has an unsupported schema_version; refusing "
            "a mechanical edit."
        )
    builds = [dict(b) for b in fixture.get("builds") or []]
    replaced = False
    for build in builds:
        if build.get("config_string") == config_string:
            build.clear()
            build.update(
                {
                    "config_string": config_string,
                    "version": version,
                    "channel": channel,
                }
            )
            replaced = True
            break
    if not replaced:
        builds.append(
            {"config_string": config_string, "version": version, "channel": channel}
        )
    builds.sort(key=lambda b: b.get("config_string", ""))

    retired = [dict(r) for r in fixture.get("retired") or []]
    existing_keys = {
        (r.get("config_string"), r.get("version"), r.get("channel"))
        for r in retired
    }
    for old in retired_builds:
        key = (old.get("config_string"), old.get("version"), old.get("channel"))
        if key in existing_keys:
            continue
        entry: Dict[str, Any] = {
            "config_string": old["config_string"],
            "version": old["version"],
            "channel": old["channel"],
        }
        if old.get("file_channel") and old["file_channel"] != old["channel"]:
            entry["file_channel"] = old["file_channel"]
        entry["retired_in"] = retired_in
        entry["reason"] = (
            f"Superseded by the v{version} {channel} import "
            "(firmware-intake workflow). Retired across channels because "
            "prune_superseded_configurations only removes a superseded build "
            "on the SAME channel; leaving it would keep two "
            f"{config_string} builds in manifest.json."
        )
        retired.append(entry)
        existing_keys.add(key)

    out = dict(fixture)
    out["builds"] = builds
    out["retired"] = retired
    return out


def serialize_surface_fixture(fixture: Dict[str, Any]) -> str:
    return json.dumps(fixture, indent=2, ensure_ascii=True) + "\n"


# =====================================================================
# Orchestration
# =====================================================================


def _load_json(path: Path, label: str) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise IntakeError(f"Failed to load {label} at {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise IntakeError(f"{label} at {path} must be a JSON object.")
    return data


def run_intake(
    *,
    source_repo: str,
    raw_tag: str,
    config_string: str,
    channel: Optional[str],
    version: Optional[str],
    token: Optional[str],
    dry_run: bool,
    sources_path: Path,
    policy_path: Optional[Path],
    firmware_dir: Path,
    surface_fixture_path: Path,
    catalog_fixture_path: Path,
    release_payload: Optional[Dict[str, Any]] = None,
    catalog_payload: Optional[Dict[str, Any]] = None,
    skip_catalog_refresh: bool = False,
    retired_in_label: Optional[str] = None,
) -> Dict[str, Any]:
    config = validate_config_string(config_string)
    tag = add_source.normalize_tag(raw_tag)
    if not tag:
        raise IntakeError("A non-empty upstream release tag is required.")
    resolved_channel = (channel or "").strip() or add_source.infer_channel(tag)
    if resolved_channel not in ACTIVE_CHANNELS:
        raise IntakeError(
            f"Channel '{resolved_channel}' is not an intake channel; only "
            f"{'/'.join(ACTIVE_CHANNELS)} builds enter the served surface."
        )
    resolved_version = add_source.derive_version(tag, version)
    asset_name = add_source.derive_asset_name(
        config, resolved_version, resolved_channel
    )

    surface_fixture = _load_json(surface_fixture_path, "expected-surface fixture")
    # Validate the fixture BEFORE any write phase so a malformed fixture can
    # never abort the run midway with a half-applied working tree.
    if surface_fixture.get("schema_version") != 1:
        raise IntakeError(
            "expected-surface fixture has an unsupported schema_version; "
            "refusing a mechanical edit."
        )
    assert_not_retired_artifact(surface_fixture, asset_name)

    # The eligibility-lane check ALWAYS reads the vendored fixture — the
    # WebFlash-owned curation surface — never the upstream catalog payload
    # (which only feeds the refresh step below). Upstream data must not be
    # able to authorise its own import.
    vendored_catalog = _load_json(catalog_fixture_path, "vendored catalog fixture")
    assert_webflash_eligibility_lane(vendored_catalog, config)

    sources_doc = add_source.load_sources_doc(sources_path)
    assert_not_delisted(sources_doc, config)

    # --- Author the source entry (Release 4 semantics, unchanged) ---------
    if release_payload is not None:
        release = release_payload
    else:
        release = add_source.fetch_release_metadata(
            source_repo, tag, token, raw_tag=raw_tag
        )
    asset_index = add_source.index_assets_by_name(release)
    checksum_text = ""
    if add_source.MANDATORY_CHECKSUM_ASSET in asset_index:
        checksum_text = add_source.download_text(
            add_source._asset_download_url(
                asset_index[add_source.MANDATORY_CHECKSUM_ASSET], token
            ),
            token,
        )
    policy = add_source.load_policy(policy_path)
    existing = add_source.find_existing(
        sources_doc.get("sources", []), (source_repo, config, resolved_channel)
    )
    try:
        entry = add_source.build_entry(
            source_repo=source_repo,
            release_tag=tag,
            config_string=config,
            version=resolved_version,
            channel=resolved_channel,
            asset_names=list(asset_index.keys()),
            checksum_text=checksum_text,
            policy=policy,
            release_url=release.get("html_url"),
            existing=existing,
        )
    except add_source.SourceAuthoringError as exc:
        raise IntakeError(str(exc)) from exc

    # An already-declared or already-staged artifact for this exact version
    # must never have its bytes or pin silently replaced ("never overwrite a
    # published .bin in place"). If the upstream release replaced the asset —
    # even with lock-step checksums — refuse: the pinned SHA is WebFlash's
    # trust anchor and re-pinning is a human decision, never automated intake.
    new_pin = str(entry.get("expected_sha256") or "").lower()
    if existing and str(existing.get("version") or "") == resolved_version:
        old_pin = str(existing.get("expected_sha256") or "").strip().lower()
        if old_pin and new_pin and old_pin != new_pin:
            raise IntakeError(
                f"firmware/sources.json already pins {asset_name} at "
                f"{old_pin}, but the upstream release now serves "
                f"{new_pin} for the same version and channel. The upstream "
                "asset was replaced after it was pinned; intake refuses to "
                "re-pin. A human must retire the entry and re-pin via a "
                "reviewed firmware/sources.json edit."
            )
    staged_bin = firmware_dir / "configurations" / asset_name
    if staged_bin.exists() and new_pin:
        staged_sha = importer.sha256_of_file(staged_bin).lower()
        if staged_sha != new_pin:
            raise IntakeError(
                f"Staged {asset_name} hashes to {staged_sha}, but the "
                f"upstream release now pins {new_pin} for the same version "
                "and channel. A staged artifact's bytes never change through "
                "intake; if upstream deliberately replaced the asset, a human "
                "must retire the staged build and re-pin via a reviewed "
                "change."
            )

    # --- Supersession plan (fail closed before anything is written) ------
    configurations_dir = firmware_dir / "configurations"
    plan = plan_supersession(
        config_string=config,
        version=resolved_version,
        channel=resolved_channel,
        configurations_dir=configurations_dir,
        sources=sources_doc.get("sources", []),
        source_repo=source_repo,
    )

    retired_build_records: List[Dict[str, Any]] = []
    previous_build = next(
        (
            b
            for b in surface_fixture.get("builds") or []
            if isinstance(b, dict) and b.get("config_string") == config
        ),
        None,
    )
    for bin_path in plan["retire_bins"]:
        old_meta = gen_manifests.parse_firmware_metadata(
            bin_path, default_channel="stable", force_configuration=True
        )
        record = {
            "config_string": config,
            "version": old_meta.version,
            "channel": old_meta.channel,
            "file_channel": old_meta.channel,
        }
        # When the surface fixture served this exact artifact on a different
        # channel (a channel_presentation demotion), retire it under its
        # SERVED channel and keep file_channel naming the filename channel.
        if (
            previous_build
            and previous_build.get("version") == old_meta.version
            and previous_build.get("channel")
            and previous_build.get("channel") != old_meta.channel
        ):
            record["channel"] = previous_build["channel"]
        retired_build_records.append(record)

    # --- Import (Release 5 semantics, unchanged gates) --------------------
    imported_at = importer._dt.datetime.now(importer._dt.timezone.utc).replace(
        microsecond=0
    ).isoformat()
    repo_root = firmware_dir.parent
    try:
        target_path = importer.import_source_entry(
            entry,
            repo_root=repo_root,
            token=token,
            dry_run=dry_run,
            imported_at=imported_at,
            release_override=release,
            require_pin=True,
        )
    except (importer.ImportValidationError, ValueError) as exc:
        # ValueError covers the importer's non-typed refusals (an unparseable
        # canonical filename, a filler stable changelog) so they surface as
        # clean fail-closed messages, not tracebacks.
        raise IntakeError(str(exc)) from exc

    summary: Dict[str, Any] = {
        "source_repo": source_repo,
        "release_tag": tag,
        "config_string": config,
        "channel": resolved_channel,
        "version": resolved_version,
        "asset_name": asset_name,
        "target_path": str(target_path),
        "dry_run": dry_run,
        "source_entry_action": "update" if existing else "add",
        "removed_source_entries": [list(k) for k in plan["retire_source_keys"]],
        "retired_cross_channel": [
            _surface_bin_name(r) for r in retired_build_records
        ],
        "retired_in_label": retired_in_label or RETIRED_IN_PLACEHOLDER,
        "retired_in_placeholder": bool(retired_build_records)
        and not retired_in_label,
        "catalog_fixture_refreshed": False,
    }

    if dry_run:
        print("[dry-run] No files were written; sources/fixture edits skipped.")
        summary["planned_sources_write"] = True
        return summary

    # --- Persist the sources doc (upsert + clean supersession removals) ---
    sources = add_source.upsert_source(sources_doc.get("sources", []), entry)
    if plan["retire_source_keys"]:
        drop = set(plan["retire_source_keys"])
        sources = [s for s in sources if add_source.source_key(s) not in drop]
    sources_doc["sources"] = sources
    add_source.write_sources_doc(sources_path, sources_doc)
    print(f"→ wrote {sources_path}")

    # --- Cross-channel retirement (files) ---------------------------------
    for bin_path in plan["retire_bins"]:
        for sibling in (
            bin_path,
            sync_releases.sidecar_target_path(bin_path),
            bin_path.with_suffix(".md"),
        ):
            if sibling.exists():
                sibling.unlink()
                print(f"  → retired superseded {sibling}")

    # --- Expected-surface fixture -----------------------------------------
    updated_fixture = update_surface_fixture(
        surface_fixture,
        config_string=config,
        version=resolved_version,
        channel=resolved_channel,
        retired_builds=retired_build_records,
        retired_in=retired_in_label or RETIRED_IN_PLACEHOLDER,
    )
    surface_fixture_path.write_text(
        serialize_surface_fixture(updated_fixture), encoding="utf-8"
    )
    print(f"→ wrote {surface_fixture_path}")

    # --- Catalog fixture refresh ------------------------------------------
    if skip_catalog_refresh:
        print(
            "Skipping product-catalog fixture refresh (--skip-catalog-refresh). "
            "Run scripts/refresh-product-catalog-fixture.py before committing "
            "or the manifest<->catalog version guard may fail."
        )
    else:
        try:
            refresh = catalog_refresh.refresh_catalog_fixture(
                catalog_fixture_path,
                upstream_catalog=catalog_payload,
                source_repo=source_repo,
                token=token,
            )
        except catalog_refresh.CatalogRefreshError as exc:
            raise IntakeError(
                f"Product-catalog fixture refresh failed: {exc}"
            ) from exc
        summary["catalog_fixture_refreshed"] = bool(refresh.get("changed"))

    return summary


def set_retired_in(
    surface_fixture_path: Path, reference: str, match: Optional[str] = None
) -> int:
    """Rewrite retired_in values equal to ``match`` to ``reference``.

    ``match`` defaults to the placeholder. The workflow passes its own run URL
    as ``match`` so the rewrite is SCOPED to the entries this run appended —
    a stray label from an earlier, partially-failed run can never be
    mis-attributed to a later PR. Returns the number of entries rewritten.
    """

    text = (reference or "").strip()
    if not re.match(r"^#\d+$", text):
        raise IntakeError(
            f"--set-retired-in expects a PR reference like '#612', got {text!r}."
        )
    needle = (match or "").strip() or RETIRED_IN_PLACEHOLDER
    fixture = _load_json(surface_fixture_path, "expected-surface fixture")
    count = 0
    for entry in fixture.get("retired") or []:
        if isinstance(entry, dict) and entry.get("retired_in") == needle:
            entry["retired_in"] = text
            count += 1
    if count:
        surface_fixture_path.write_text(
            serialize_surface_fixture(fixture), encoding="utf-8"
        )
    print(f"Resolved {count} retired_in label(s) matching {needle!r} to {text}.")
    return count


# =====================================================================
# CLI
# =====================================================================


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Combined WebFlash firmware intake: author the source entry, "
            "import + verify the binary, retire the superseded build, and "
            "refresh the fixtures — staged in the working tree for one PR."
        )
    )
    parser.add_argument(
        "--repo",
        default=add_source.DEFAULT_SOURCE_REPO,
        help=f"Upstream source repo (default: {add_source.DEFAULT_SOURCE_REPO}).",
    )
    parser.add_argument("--tag", help="Upstream release tag (e.g. v1.0.0-preview).")
    parser.add_argument(
        "--config", help="The config_string (e.g. Ceiling-POE-AirIQ-RoomIQ)."
    )
    parser.add_argument(
        "--channel",
        default=None,
        help="Release channel (stable|preview). Default: inferred from the tag.",
    )
    parser.add_argument(
        "--version",
        default=None,
        help="Semver version. Default: parsed from the tag.",
    )
    parser.add_argument("--token", default=None, help="GitHub token (or env).")
    parser.add_argument(
        "--sources", default=str(DEFAULT_SOURCES_PATH), help="sources.json path."
    )
    parser.add_argument(
        "--policy", default=str(DEFAULT_POLICY_PATH), help="Optional policy path."
    )
    parser.add_argument(
        "--firmware-dir", default=str(DEFAULT_FIRMWARE_DIR), help="firmware/ path."
    )
    parser.add_argument(
        "--surface-fixture",
        default=str(DEFAULT_SURFACE_FIXTURE),
        help="expected-surface.json path.",
    )
    parser.add_argument(
        "--catalog-fixture",
        default=str(DEFAULT_CATALOG_FIXTURE),
        help="Vendored esphome-product-catalog.json path.",
    )
    parser.add_argument(
        "--release-payload-file",
        help="Read release metadata from a local JSON file (hermetic runs).",
    )
    parser.add_argument(
        "--catalog-payload-file",
        help=(
            "Read the upstream product catalog from a local JSON file for the "
            "fixture refresh step (hermetic runs). The eligibility-lane check "
            "always reads the vendored fixture, never this payload."
        ),
    )
    parser.add_argument(
        "--skip-catalog-refresh",
        action="store_true",
        help="Do not refresh the vendored catalog fixture (offline runs).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate everything; write nothing.",
    )
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Summary output format.",
    )
    parser.add_argument(
        "--retired-in",
        default=None,
        metavar="LABEL",
        help=(
            "Label recorded as retired_in on retired-register entries this "
            "run appends (default: the placeholder). The workflow passes its "
            "run URL so the label is unique per run."
        ),
    )
    parser.add_argument(
        "--set-retired-in",
        default=None,
        metavar="#PR",
        help=(
            "Exclusive mode: rewrite retired_in values matching "
            "--retired-in-match (default: the placeholder) to the given PR "
            "reference, then exit."
        ),
    )
    parser.add_argument(
        "--retired-in-match",
        default=None,
        metavar="LABEL",
        help=(
            "With --set-retired-in: only rewrite entries whose retired_in "
            "equals this label (scopes the rewrite to one run)."
        ),
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        if args.set_retired_in is not None:
            set_retired_in(
                Path(args.surface_fixture),
                args.set_retired_in,
                match=args.retired_in_match,
            )
            return 0

        if not args.tag or not args.config:
            print("✗ --tag and --config are required.", file=sys.stderr)
            return 2

        token = (
            args.token
            or os.environ.get("GITHUB_TOKEN")
            or os.environ.get("GH_TOKEN")
        )
        release_payload: Optional[Dict[str, Any]] = None
        if args.release_payload_file:
            release_payload = _load_json(
                Path(args.release_payload_file), "release payload"
            )
        catalog_payload: Optional[Dict[str, Any]] = None
        if args.catalog_payload_file:
            catalog_payload = _load_json(
                Path(args.catalog_payload_file), "catalog payload"
            )

        summary = run_intake(
            source_repo=args.repo,
            raw_tag=args.tag,
            config_string=args.config,
            channel=args.channel,
            version=args.version,
            token=token,
            dry_run=args.dry_run,
            sources_path=Path(args.sources),
            policy_path=Path(args.policy) if args.policy else None,
            firmware_dir=Path(args.firmware_dir),
            surface_fixture_path=Path(args.surface_fixture),
            catalog_fixture_path=Path(args.catalog_fixture),
            release_payload=release_payload,
            catalog_payload=catalog_payload,
            skip_catalog_refresh=args.skip_catalog_refresh,
            retired_in_label=args.retired_in,
        )
    except (IntakeError, add_source.SourceAuthoringError) as exc:
        # SourceAuthoringError covers the delegated authoring helpers called
        # outside build_entry (tag/version derivation, sources/policy loading,
        # release fetch); both surface as the documented clean refusal.
        print(f"✗ {exc}", file=sys.stderr)
        return 1

    if args.format == "json":
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print("\nIntake summary:")
        for key in (
            "config_string",
            "channel",
            "version",
            "release_tag",
            "asset_name",
            "source_entry_action",
        ):
            print(f"  {key}: {summary[key]}")
        if summary["removed_source_entries"]:
            print(f"  removed source entries: {summary['removed_source_entries']}")
        if summary["retired_cross_channel"]:
            print(f"  retired cross-channel: {summary['retired_cross_channel']}")
        if summary["retired_cross_channel"]:
            print(
                "  NOTE: retired-register entries were appended with "
                f"retired_in={summary['retired_in_label']!r}; resolve them "
                "with --set-retired-in '#<PR>' (and --retired-in-match) once "
                "the PR exists."
            )
    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
