#!/usr/bin/env python3
"""
WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — guarded automation for importing every
upstream preview / manual-preview firmware artifact that upstream has explicitly
marked WebFlash-import eligible.

This wrapper sits *on top of* the single-source importer
``scripts/import-firmware-sources.py``. It replaces the one-off, per-family
import runs (WF-PREVIEW-IMPORT-FIRST-BATCH-001, WEBFLASH-RELAY-001,
WEBFLASH-PWM-001) with one discoverable, idempotent, heavily-guarded pass that:

  1. **Discovers** every upstream product-catalog entry carrying the explicit
     ``webflash_import_eligibility.eligible: true`` signal (the manual-preview
     import lane upstream #711 / ``RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001``
     introduced). Today that set is exactly FanRelay / FanPWM / FanDAC.
  2. **Cross-checks** each discovered entry against the committed
     ``firmware/sources.json`` declaration (which carries the human-pinned
     ``expected_sha256`` — the security boundary) and the on-disk
     ``firmware/configurations/`` state.
  3. **Plans** an action per entry — ``import`` / ``idempotent`` / ``skip`` /
     ``refuse`` — applying every automation guardrail.
  4. **Applies** the plan (``--apply``) by delegating each ``import`` to the
     existing ``import_source_entry`` machinery, so every checksum / pin /
     block-token / release-body / size gate the single-source importer enforces
     still runs unchanged.

The wrapper imports nothing on its own authority. It only batches and guards
imports the operator has already declared (with a pinned SHA256) in
``firmware/sources.json``. It does **not** sign firmware, regenerate the
production manifest, edit ``REQUIRED_CONFIGS``, edit kits, or touch any wizard /
workflow surface — those stay with the existing pipeline. Run
``scripts/gen-manifests.py`` after a successful apply, exactly as the one-off
flow does.

Hard guardrails (each is enforced for every discovered target):

* **Eligibility** — only entries with ``webflash_import_eligibility.eligible ==
  True`` are even discovered. ``eligible == false`` / absent is never imported.
* **Channel** — the entry must be ``channel: preview`` (or
  ``delivery_lane: manual-preview``). Stable / full-release entries are refused.
* **Pinned SHA256** — the matching ``firmware/sources.json`` entry must carry a
  well-formed ``expected_sha256``; a missing pin is a hard refusal.
* **Upstream checksum match** — delegated to ``import_source_entry`` (verifies
  the download against the release ``checksums-sha256.txt`` *and* the pin).
* **Release asset must exist** — delegated to ``import_source_entry``.
* **.meta.json provenance** — delegated to ``import_source_entry`` (always
  writes the sidecar).
* **No stable/full-release import** — refused (see Channel above).
* **No REQUIRED_CONFIGS change** — the wrapper never writes the workflow;
  additionally it reads ``REQUIRED_CONFIGS`` before/after and asserts it is
  unchanged, and refuses any target whose catalog status is ``production``.
* **TRIAC stays out** — any FanTRIAC-token-bearing target is refused unless the
  operator passes ``--allow-triac`` *and* the catalog entry carries the explicit
  ``triac_preview_import_allowed: true`` opt-in (no such entry exists today).
* **No overwrite with different bytes** — if the target ``.bin`` is already on
  disk, the wrapper only treats it as ``idempotent`` when its SHA256 matches the
  pin; a differing on-disk file is a hard refusal (never overwritten).
* **Simple install unchanged** — the wrapper imports only preview-channel
  builds; the stable Bathroom PoE default path is untouched.

Usage::

    # Plan only (default). Safe, no network downloads of .bin files.
    python3 scripts/import-preview-eligible-sources.py --dry-run

    # Apply (download + verify + stage every importable target).
    python3 scripts/import-preview-eligible-sources.py --apply

    # Hermetic / network-restricted apply: supply release metadata payloads.
    python3 scripts/import-preview-eligible-sources.py --apply \\
        --release-payload-dir /tmp/release-payloads

    # JSON report (for CI / tests).
    python3 scripts/import-preview-eligible-sources.py --format json

Exit codes:
  0 — plan is consistent (no refusals); in --apply, every import succeeded and
      REQUIRED_CONFIGS is unchanged.
  1 — at least one target was refused, an import failed, or REQUIRED_CONFIGS
      changed.
  2 — usage error or file-load failure.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

DEFAULT_CATALOG_PATH = (
    REPO_ROOT / "__tests__" / "fixtures" / "esphome-product-catalog.json"
)
DEFAULT_SOURCES_PATH = REPO_ROOT / "firmware" / "sources.json"
DEFAULT_CONFIGURATIONS_DIR = REPO_ROOT / "firmware" / "configurations"
DEFAULT_WORKFLOW_PATH = (
    REPO_ROOT / ".github" / "workflows" / "firmware-publish.yml"
)

# Channels the automation will import on. Stable / full release is deliberately
# excluded — automated imports are preview / manual-preview only.
PREVIEW_CHANNELS = ("preview",)
MANUAL_PREVIEW_LANES = ("manual-preview",)

FANTRIAC_TOKEN = "FanTRIAC"
RESCUE_CONFIG_STRING = "Rescue"
PRODUCTION_STATUS = "production"

_HEX64_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")


# --- Action vocabulary -----------------------------------------------------

# An action is the planned outcome for one discovered target.
ACTION_IMPORT = "import"          # not on disk, all gates pass → import it
ACTION_IDEMPOTENT = "idempotent"  # on disk, SHA matches pin → no-op
ACTION_SKIP = "skip"              # benign: not declared in sources.json yet
ACTION_REFUSE = "refuse"          # policy violation / unsafe → hard failure

# Actions that fail the run (non-zero exit).
HARD_ACTIONS = frozenset({ACTION_REFUSE})


# --- Sibling importer loading ----------------------------------------------
#
# scripts/import-firmware-sources.py is the single-source importer. Load it via
# importlib (the scripts dir is not a package and the filename is hyphenated) so
# this wrapper reuses its verified download/verify/stage path without copying it.


def _load_sibling(name: str, filename: str):
    path = SCRIPT_DIR / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:  # pragma: no cover - import guard
        raise ImportError(f"Unable to load helper module {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


importer = _load_sibling("import_firmware_sources", "import-firmware-sources.py")
ImportValidationError = importer.ImportValidationError


class PreviewAutomationError(RuntimeError):
    """Raised for usage / load failures specific to this wrapper."""


# --- Loaders ---------------------------------------------------------------


def load_catalog(catalog_path: Path) -> Dict[str, Any]:
    if not catalog_path.exists():
        raise PreviewAutomationError(f"Catalog not found: {catalog_path}")
    try:
        data = json.loads(catalog_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PreviewAutomationError(
            f"Catalog {catalog_path} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict) or not isinstance(data.get("products"), list):
        raise PreviewAutomationError(
            f"Catalog {catalog_path} is missing a 'products' array."
        )
    return data


def index_sources_by_config(sources: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    by_config: Dict[str, Dict[str, Any]] = {}
    for entry in sources:
        cs = entry.get("config_string")
        if isinstance(cs, str) and cs:
            by_config.setdefault(cs, entry)
    return by_config


def parse_required_configs(workflow_path: Path) -> List[str]:
    """Parse the REQUIRED_CONFIGS=( ... ) bash array from the publish workflow.

    Mirrors the parser in scripts/validate-product-import-readiness.js so the
    wrapper can assert the allowlist is unchanged across an apply.
    """

    if not workflow_path.exists():
        return []
    text = workflow_path.read_text(encoding="utf-8")
    block = re.search(r"REQUIRED_CONFIGS=\(([\s\S]*?)\)", text)
    if not block:
        return []
    return re.findall(r'"([^"\n]+)"', block.group(1))


# --- Eligibility helpers ---------------------------------------------------


def is_explicit_preview_import_eligible(entry: Dict[str, Any]) -> bool:
    """True iff the entry carries the explicit upstream import authorisation.

    This is the *discovery* signal — the manual-preview import lane that upstream
    #711 (RELEASE-PREVIEW-FAN-WEBFLASH-ELIGIBILITY-001) added in
    config/preview-release-targets.json and mirrored onto each catalog entry as
    ``webflash_import_eligibility.eligible``. A bare ``status: preview`` does NOT
    qualify here — those entries (the first preview batch, the LED preview) were
    imported by the plain importer and are not re-managed by this automation.
    """

    block = entry.get("webflash_import_eligibility")
    return isinstance(block, dict) and block.get("eligible") is True


def is_catalog_import_eligible(entry: Dict[str, Any]) -> bool:
    """Mirror of validate-product-import-readiness.js ``isWebflashImportEligible``.

    Used to cross-check that a discovered target is genuinely import-eligible at
    the catalog level (status production/preview OR the explicit flag).
    """

    if entry.get("status") in ("production", "preview"):
        return True
    return is_explicit_preview_import_eligible(entry)


def config_contains_triac(config_string: Optional[str]) -> bool:
    if not isinstance(config_string, str) or not config_string:
        return False
    return FANTRIAC_TOKEN in config_string.split("-")


def entry_is_preview_channel(entry: Dict[str, Any]) -> bool:
    channel = entry.get("channel")
    lane = entry.get("delivery_lane")
    return channel in PREVIEW_CHANNELS or lane in MANUAL_PREVIEW_LANES


def _valid_pin(value: Any) -> bool:
    return isinstance(value, str) and bool(_HEX64_PATTERN.match(value.strip()))


# --- Planning (pure, no network, no disk writes) ---------------------------


def plan_targets(
    catalog: Dict[str, Any],
    sources: Sequence[Dict[str, Any]],
    *,
    configurations_dir: Path,
    allow_triac: bool = False,
) -> List[Dict[str, Any]]:
    """Compute the per-target action plan.

    Pure with respect to the network and the firmware tree: it only *reads* the
    on-disk ``.bin`` (to compare its SHA256 against the pin) and never writes.
    Returns one decision dict per discovered (eligible) catalog entry.
    """

    sources_by_config = index_sources_by_config(sources)
    targets: List[Dict[str, Any]] = []

    for product in catalog.get("products") or []:
        if not is_explicit_preview_import_eligible(product):
            continue  # not in the automation's discovery scope

        config_string = product.get("config_string")
        artifact_name = product.get("artifact_name")
        status = product.get("status")
        channel = product.get("channel")
        source_entry = (
            sources_by_config.get(config_string) if config_string else None
        )

        target: Dict[str, Any] = {
            "config_string": config_string,
            "artifact_name": artifact_name,
            "status": status,
            "channel": channel,
            "source_present": source_entry is not None,
            "on_disk": False,
            "expected_sha256": (source_entry or {}).get("expected_sha256"),
            "action": None,
            "reason": None,
        }

        def decide(action: str, reason: str) -> None:
            target["action"] = action
            target["reason"] = reason

        # 1. TRIAC stays out — even if a future catalog flips its eligible flag.
        if config_contains_triac(config_string):
            triac_opt_in = product.get("triac_preview_import_allowed") is True
            if not (allow_triac and triac_opt_in):
                decide(
                    ACTION_REFUSE,
                    "TRIAC firmware is never auto-imported: requires both "
                    "--allow-triac and an explicit triac_preview_import_allowed: "
                    "true catalog opt-in (none exists). FanTRIAC stays "
                    "build-blocked under the upstream hardware/compliance gate.",
                )
                targets.append(target)
                continue

        # 2. Stable / full-release is out of scope for the automation.
        if status == PRODUCTION_STATUS or channel == "stable":
            decide(
                ACTION_REFUSE,
                f"refusing stable/full-release import (status={status!r}, "
                f"channel={channel!r}); automation imports preview / "
                "manual-preview only. Production lands through the "
                "single-source importer, never this automation.",
            )
            targets.append(target)
            continue

        # 3. Must be a preview / manual-preview entry.
        if not entry_is_preview_channel(product):
            decide(
                ACTION_REFUSE,
                f"catalog channel/lane is not preview (channel={channel!r}, "
                f"delivery_lane={product.get('delivery_lane')!r}); only "
                "channel: preview or delivery_lane: manual-preview is auto-importable.",
            )
            targets.append(target)
            continue

        # 4. Defence-in-depth: the catalog cross-check must agree it is eligible.
        if not is_catalog_import_eligible(product):
            decide(
                ACTION_REFUSE,
                "catalog cross-check failed: entry is not import-eligible "
                "(status not production/preview and no eligible flag).",
            )
            targets.append(target)
            continue

        # 5. Must be declared in firmware/sources.json (carries the pinned SHA).
        if source_entry is None:
            decide(
                ACTION_SKIP,
                "eligible upstream, but not declared in firmware/sources.json. "
                "Add a source entry with a pinned expected_sha256 before it can "
                "be auto-imported (the pin is the human-committed trust anchor).",
            )
            targets.append(target)
            continue

        # 6. The source entry's expected_sha256 pin is mandatory.
        if not _valid_pin(source_entry.get("expected_sha256")):
            decide(
                ACTION_REFUSE,
                "firmware/sources.json entry has no well-formed expected_sha256 "
                "pin; the pin is mandatory for automated preview imports.",
            )
            targets.append(target)
            continue

        # 7. The source channel must itself be preview (consistency with catalog).
        if source_entry.get("channel") not in PREVIEW_CHANNELS:
            decide(
                ACTION_REFUSE,
                f"firmware/sources.json channel is {source_entry.get('channel')!r}; "
                "automated imports require a preview-channel source entry.",
            )
            targets.append(target)
            continue

        # 8. On-disk overwrite protection / idempotency.
        pin = source_entry["expected_sha256"].strip().lower()
        asset = source_entry.get("asset_name") or artifact_name
        bin_path = configurations_dir / asset if asset else None
        if bin_path is not None and bin_path.exists():
            target["on_disk"] = True
            on_disk_sha = importer.sha256_of_file(bin_path).lower()
            if on_disk_sha == pin:
                decide(
                    ACTION_IDEMPOTENT,
                    f"already imported; on-disk SHA256 matches the pin ({pin}). "
                    "No re-download, no overwrite.",
                )
            else:
                decide(
                    ACTION_REFUSE,
                    f"on-disk binary SHA256 ({on_disk_sha}) differs from the "
                    f"pinned expected_sha256 ({pin}); refusing to overwrite a "
                    "published binary with different bytes.",
                )
            targets.append(target)
            continue

        # 9. Clear to import.
        decide(
            ACTION_IMPORT,
            f"eligible, declared, pinned ({pin}), not yet on disk → import.",
        )
        targets.append(target)

    return targets


def summarize(targets: Sequence[Dict[str, Any]], *, apply: bool, required_unchanged: bool) -> Dict[str, Any]:
    counts = {
        "discovered": len(targets),
        ACTION_IMPORT: 0,
        ACTION_IDEMPOTENT: 0,
        ACTION_SKIP: 0,
        ACTION_REFUSE: 0,
        "imported": 0,
        "import_failures": 0,
    }
    for t in targets:
        counts[t["action"]] = counts.get(t["action"], 0) + 1
        if t.get("imported") is True:
            counts["imported"] += 1
        if t.get("import_error"):
            counts["import_failures"] += 1
    ok = (
        counts[ACTION_REFUSE] == 0
        and counts["import_failures"] == 0
        and required_unchanged
    )
    counts["apply"] = apply
    counts["required_configs_unchanged"] = required_unchanged
    counts["ok"] = ok
    return counts


# --- Apply (network) -------------------------------------------------------


def _load_release_payloads(
    payload_file: Optional[str], payload_dir: Optional[str]
) -> Dict[str, Dict[str, Any]]:
    """Load release metadata keyed by release_tag for hermetic / restricted runs.

    --release-payload-file supplies one payload (used for whatever release_tag
    the targets share). --release-payload-dir reads <release_tag>.json files.
    """

    payloads: Dict[str, Dict[str, Any]] = {}
    if payload_file:
        data = json.loads(Path(payload_file).read_text(encoding="utf-8"))
        payloads["*"] = data
    if payload_dir:
        d = Path(payload_dir)
        for path in d.glob("*.json"):
            payloads[path.stem] = json.loads(path.read_text(encoding="utf-8"))
    return payloads


def execute_imports(
    targets: List[Dict[str, Any]],
    sources_by_config: Dict[str, Dict[str, Any]],
    *,
    repo_root: Path,
    token: Optional[str],
    imported_at: str,
    release_payloads: Optional[Dict[str, Dict[str, Any]]] = None,
) -> None:
    """Run the actual import for every ACTION_IMPORT target (mutates targets)."""

    release_payloads = release_payloads or {}
    for target in targets:
        if target["action"] != ACTION_IMPORT:
            continue
        entry = sources_by_config.get(target["config_string"])
        if entry is None:  # pragma: no cover - planning guarantees presence
            target["import_error"] = "source entry vanished between plan and apply"
            continue
        release_override = release_payloads.get(entry.get("release_tag")) or release_payloads.get("*")
        try:
            written = importer.import_source_entry(
                entry,
                repo_root=repo_root,
                token=token,
                dry_run=False,
                imported_at=imported_at,
                release_override=release_override,
            )
            target["imported"] = True
            target["written_path"] = str(written)
        except ImportValidationError as exc:
            target["imported"] = False
            target["import_error"] = str(exc)


# --- Reporting -------------------------------------------------------------


def format_text(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    s = report["summary"]
    mode = "APPLY" if s["apply"] else "DRY-RUN"
    lines.append(f"WEBFLASH-PREVIEW-IMPORT-AUTOMATION-001 — preview-eligible import plan ({mode})")
    lines.append("")
    lines.append(f"  discovered (eligible)  : {s['discovered']}")
    lines.append(f"  to import              : {s[ACTION_IMPORT]}")
    lines.append(f"  idempotent (on disk)   : {s[ACTION_IDEMPOTENT]}")
    lines.append(f"  skipped (no source)    : {s[ACTION_SKIP]}")
    lines.append(f"  refused                : {s[ACTION_REFUSE]}")
    if s["apply"]:
        lines.append(f"  imported               : {s['imported']}")
        lines.append(f"  import failures        : {s['import_failures']}")
    lines.append(f"  REQUIRED_CONFIGS unchanged : {s['required_configs_unchanged']}")
    lines.append("")
    for t in report["targets"]:
        icon = {
            ACTION_IMPORT: "→",
            ACTION_IDEMPOTENT: "=",
            ACTION_SKIP: "·",
            ACTION_REFUSE: "✗",
        }.get(t["action"], "?")
        cs = t.get("config_string") or "<unknown>"
        applied = ""
        if t.get("imported") is True:
            applied = " [IMPORTED]"
        elif t.get("import_error"):
            applied = f" [IMPORT FAILED: {t['import_error']}]"
        lines.append(f"  {icon} {t['action'].upper():10s} {cs}{applied}")
        lines.append(f"      {t['reason']}")
    lines.append("")
    lines.append(f"Overall: {'OK' if report['ok'] else 'FAIL'}")
    return "\n".join(lines)


def build_report(
    *,
    targets: List[Dict[str, Any]],
    apply: bool,
    required_before: List[str],
    required_after: List[str],
) -> Dict[str, Any]:
    required_unchanged = required_before == required_after
    summary = summarize(targets, apply=apply, required_unchanged=required_unchanged)
    return {
        "summary": summary,
        "targets": targets,
        "required_configs_before": required_before,
        "required_configs_after": required_after,
        "ok": summary["ok"],
    }


# --- CLI -------------------------------------------------------------------


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Discover and import every upstream preview / manual-preview "
            "firmware artifact marked webflash_import_eligibility.eligible=true."
        )
    )
    parser.add_argument("--catalog", default=str(DEFAULT_CATALOG_PATH))
    parser.add_argument("--sources", default=str(DEFAULT_SOURCES_PATH))
    parser.add_argument(
        "--configurations-dir", default=str(DEFAULT_CONFIGURATIONS_DIR)
    )
    parser.add_argument("--workflow", default=str(DEFAULT_WORKFLOW_PATH))
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually download + verify + stage importable targets. "
        "Without it the wrapper only prints the plan (dry-run).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicit dry-run (default when --apply is absent).",
    )
    parser.add_argument(
        "--allow-triac",
        action="store_true",
        help="Opt in to TRIAC import IF the catalog entry also carries "
        "triac_preview_import_allowed: true (none exists today).",
    )
    parser.add_argument("--token", help="GitHub token (falls back to env).")
    parser.add_argument(
        "--release-payload-file",
        help="Single release metadata JSON (hermetic / network-restricted runs).",
    )
    parser.add_argument(
        "--release-payload-dir",
        help="Directory of <release_tag>.json release metadata files.",
    )
    parser.add_argument("--format", choices=("text", "json"), default="text")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    apply = bool(args.apply) and not args.dry_run

    try:
        catalog = load_catalog(Path(args.catalog))
        sources = importer.load_sources(Path(args.sources))
    except (PreviewAutomationError, ImportValidationError) as exc:
        print(f"Failed to load inputs: {exc}", file=sys.stderr)
        return 2

    configurations_dir = Path(args.configurations_dir)
    sources_by_config = index_sources_by_config(sources)
    required_before = parse_required_configs(Path(args.workflow))

    targets = plan_targets(
        catalog,
        sources,
        configurations_dir=configurations_dir,
        allow_triac=args.allow_triac,
    )

    if apply:
        import os

        token = (
            args.token
            or os.environ.get("GITHUB_TOKEN")
            or os.environ.get("GH_TOKEN")
        )
        imported_at = (
            _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()
        )
        try:
            release_payloads = _load_release_payloads(
                args.release_payload_file, args.release_payload_dir
            )
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Failed to load release payloads: {exc}", file=sys.stderr)
            return 2
        execute_imports(
            targets,
            sources_by_config,
            repo_root=REPO_ROOT,
            token=token,
            imported_at=imported_at,
            release_payloads=release_payloads,
        )

    # REQUIRED_CONFIGS must be byte-identical after the run — the automation
    # never writes the workflow, so this is a belt-and-braces assertion.
    required_after = parse_required_configs(Path(args.workflow))

    report = build_report(
        targets=targets,
        apply=apply,
        required_before=required_before,
        required_after=required_after,
    )

    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        print(format_text(report))

    return 0 if report["ok"] else 1


if __name__ == "__main__":  # pragma: no cover - entry point
    sys.exit(main())
