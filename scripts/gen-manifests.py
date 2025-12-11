#!/usr/bin/env python3
"""
Generate Sense360 firmware manifests for ESP Web Tools and the WebFlash UI.

This script normalises firmware binaries under ./firmware, rebuilds manifest.json,
and regenerates the numbered firmware-*.json files consumed by ESP Web Tools.

Usage (from repository root):
    python scripts/gen-manifests.py --summary
    python scripts/gen-manifests.py --dry-run   # preview without writing files
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

try:
    from packaging.version import Version as _PackagingVersion
except Exception:  # pragma: no cover - packaging is optional
    _PackagingVersion = None  # type: ignore

DEFAULT_CHANNEL = "stable"
DEFAULT_DEVICE_TYPE = "Core Module"

CANONICAL_CHANNELS = {"stable", "preview", "beta", "dev", "rescue"}
CHANNEL_ALIASES: Dict[str, str] = {}
CHANNEL_ALIASES.update(
    {
        "general": "stable",
        "ga": "stable",
        "release": "stable",
        "prod": "stable",
        "production": "stable",
        "lts": "stable",
        "prerelease": "preview",
        "rc": "beta",
        "candidate": "beta",
        "alpha": "dev",
        "nightly": "dev",
        "canary": "dev",
        "experimental": "dev",
    }
)

CHANNEL_ORDER = {
    "stable": 0,
    "general": 0,
    "preview": 1,
    "beta": 2,
    "dev": 3,
    "rescue": 4,
}


def _channel_descriptor(channel: str) -> Tuple[str, str]:
    lowered = canonical_channel(channel, DEFAULT_CHANNEL)
    if lowered == "stable":
        return (
            "Stable firmware",
            "Recommended for production deployments.",
        )
    if lowered == "preview":
        return (
            "Preview firmware",
            "Early-access build intended for limited validation of upcoming updates.",
        )
    if lowered == "beta":
        return (
            "Beta firmware",
            "Release candidate build for broader testing ahead of stable rollout.",
        )
    if lowered == "dev":
        return (
            "Development firmware",
            "Experimental build for internal testing only.",
        )
    if lowered == "rescue":
        return (
            "Rescue firmware",
            "Known-good recovery build for unbricking Sense360 hubs.",
        )
    title = lowered.title() if lowered else "Firmware"
    return (f"{title} firmware", "")


def describe_configuration(channel: str, config_string: str) -> str:
    headline, suffix = _channel_descriptor(channel)
    base = f"{headline} for Sense360 {config_string} configuration."
    return f"{base} {suffix}".strip()


def describe_legacy(channel: str, model: str, variant: Optional[str], sensor_addon: Optional[str]) -> str:
    headline, suffix = _channel_descriptor(channel)
    details = model
    if variant:
        details += f" {variant}"
    if sensor_addon:
        details += f" ({sensor_addon})"
    base = f"{headline} for {details}."
    return f"{base} {suffix}".strip()

MOUNTING_TOKENS = {
    "wall",
    "ceiling",
    "desk",
    "portable",
    "lab",
    "bench",
    "dev",
    "test",
}
POWER_TOKENS = {
    "usb",
    "poe",
    "pwr",
    "dc",
    "ac",
    "battery",
    "mains",
    "solar",
}

CHIP_HINTS = [
    ("esp32s3", "ESP32-S3"),
    ("esp32-s3", "ESP32-S3"),
    ("esp32s2", "ESP32-S2"),
    ("esp32-s2", "ESP32-S2"),
    ("esp32c3", "ESP32-C3"),
    ("esp32-c3", "ESP32-C3"),
    ("esp32c6", "ESP32-C6"),
    ("esp32-c6", "ESP32-C6"),
    ("esp32h2", "ESP32-H2"),
    ("esp32-h2", "ESP32-H2"),
    ("esp32", "ESP32"),
]

CONFIG_CHIP_HINTS = {
    "esp32": "ESP32",
    "esp32c3": "ESP32-C3",
    "esp32s3": "ESP32-S3",
}


def canonical_channel(value: Optional[str], fallback: str = DEFAULT_CHANNEL) -> str:
    base = fallback.strip().lower() if fallback else DEFAULT_CHANNEL
    if base not in CANONICAL_CHANNELS:
        base = DEFAULT_CHANNEL
    if not value:
        return base
    key = value.strip().lower()
    if key in CANONICAL_CHANNELS:
        return key
    if key in CHANNEL_ALIASES:
        return CHANNEL_ALIASES[key]
    return base


def normalise_version(raw: Optional[str]) -> str:
    value = (raw or "").strip()
    if not value:
        return "0.0.0"
    if value[0] in {"v", "V"} and len(value) > 1:
        value = value[1:]
    return value


def _safe_segment(value: Optional[str], fallback: str) -> str:
    if not value:
        return fallback
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    slug = slug.strip("-")
    return slug or fallback


def split_name_version_channel(base: str, default_channel: str) -> Tuple[str, str, str]:
    if "-v" not in base:
        raise ValueError(f"Missing '-v' segment in '{base}'")
    name_part, remainder = base.rsplit("-v", 1)
    if "-" in remainder:
        version_part, channel_part = remainder.rsplit("-", 1)
    else:
        version_part, channel_part = remainder, default_channel
    return name_part, version_part, channel_part


@dataclass
class FirmwareMetadata:
    name_part: str
    version: str
    channel: str
    is_configuration: bool
    config_string: Optional[str]
    mounting: Optional[str]
    power: Optional[str]
    modules: List[str]
    model: Optional[str]
    variant: Optional[str]
    sensor_addon: Optional[str]
    chip_family: Optional[str] = None
    device_type: str = DEFAULT_DEVICE_TYPE
    description: Optional[str] = None
    features: List[str] = field(default_factory=list)
    hardware_requirements: List[str] = field(default_factory=list)
    improv: bool = True
    custom_directory: Optional[str] = None

    def normalized_filename(self) -> str:
        return f"Sense360-{self.name_part}-v{self.version}-{self.channel}.bin"

    def target_path(self, firmware_dir: Path) -> Path:
        if self.custom_directory:
            return firmware_dir / self.custom_directory / self.normalized_filename()
        if self.is_configuration:
            return firmware_dir / "configurations" / self.normalized_filename()
        model_dir = _safe_segment(self.model, "Sense360")
        variant_dir = _safe_segment(self.variant, "Default")
        return firmware_dir / model_dir / variant_dir / self.normalized_filename()


def _normalise_config_tokens(tokens: List[str]) -> Tuple[List[str], Optional[str]]:
    filtered: List[str] = []
    chip_hint: Optional[str] = None
    for token in tokens:
        lowered = token.lower()
        if lowered == "none":
            continue
        if lowered in CONFIG_CHIP_HINTS:
            chip_hint = CONFIG_CHIP_HINTS[lowered]
            continue
        filtered.append(token)
    return filtered, chip_hint


def parse_firmware_metadata(
    path: Path,
    *,
    default_channel: Optional[str] = None,
    force_configuration: Optional[bool] = None,
) -> FirmwareMetadata:
    fallback_channel = canonical_channel(default_channel, DEFAULT_CHANNEL)
    name = path.name
    base = name[:-4] if name.lower().endswith(".bin") else Path(name).stem
    if not base.startswith("Sense360-"):
        raise ValueError(f"Firmware name '{name}' must start with 'Sense360-'")
    name_body = base[len("Sense360-") :]
    name_part, version_part, channel_part = split_name_version_channel(
        name_body, fallback_channel
    )
    version = normalise_version(version_part)
    channel = canonical_channel(channel_part, fallback_channel)
    tokens = [token for token in name_part.split("-") if token]
    if not tokens:
        raise ValueError(f"Unable to derive metadata from '{name}'")
    config_tokens, chip_hint = _normalise_config_tokens(tokens)
    rescue_context = (
        channel == "rescue"
        or name_part.lower() == "rescue"
        or any(part.lower() == "rescue" for part in path.parts)
    )
    if rescue_context:
        description = (
            "Known-good recovery firmware that bypasses configuration checks to "
            "restore a bricked Sense360 hub."
        )
        metadata = FirmwareMetadata(
            name_part="Rescue",
            version=version,
            channel=channel,
            is_configuration=True,
            config_string="Rescue",
            mounting="Universal",
            power="Universal",
            modules=[],
            model=None,
            variant=None,
            sensor_addon=None,
            chip_family=chip_hint,
            device_type=DEFAULT_DEVICE_TYPE,
            description=description,
            features=["rescue"],
            hardware_requirements=[],
            improv=False,
            custom_directory="rescue",
        )
        return metadata
    first_token = config_tokens[0] if config_tokens else ""
    is_config = False
    if force_configuration is not None:
        is_config = force_configuration
    elif first_token and first_token.lower() in MOUNTING_TOKENS:
        is_config = True
    if is_config:
        if not config_tokens:
            raise ValueError(f"No configuration tokens found in '{name}'")
        mounting = config_tokens[0].replace("_", " ").title()
        power = None
        module_tokens = []
        if len(config_tokens) >= 2 and config_tokens[1].lower() in POWER_TOKENS:
            power = config_tokens[1].upper()
            module_tokens = config_tokens[2:]
        else:
            module_tokens = config_tokens[1:]
        config_string = "-".join(config_tokens)
        description = describe_configuration(channel, config_string)
        return FirmwareMetadata(
            name_part=config_string,
            version=version,
            channel=channel,
            is_configuration=True,
            config_string=config_string,
            mounting=mounting,
            power=power,
            modules=module_tokens,
            model=None,
            variant=None,
            sensor_addon=None,
            chip_family=chip_hint,
            description=description,
        )
    model_suffix = tokens[0]
    model = f"Sense360-{model_suffix}"
    variant = tokens[1] if len(tokens) >= 2 else "Default"
    sensor_addon = "-".join(tokens[2:]) if len(tokens) > 2 else None
    legacy_name_part = "-".join(
        [model_suffix]
        + ([variant] if variant else [])
        + ([sensor_addon] if sensor_addon else [])
    )
    description = describe_legacy(channel, model, variant, sensor_addon)
    return FirmwareMetadata(
        name_part=legacy_name_part,
        version=version,
        channel=channel,
        is_configuration=False,
        config_string=None,
        mounting=None,
        power=None,
        modules=[],
        model=model,
        variant=variant,
        sensor_addon=sensor_addon,
        chip_family=None,
        description=description,
    )


@dataclass
class FirmwareArtifact:
    path: Path
    metadata: FirmwareMetadata
    relative_path: str
    chip_family: str
    md5: str
    sha256: str
    signature: str
    file_size: int
    build_date: str

    def manifest_entry(self) -> Dict[str, object]:
        entry: Dict[str, object] = {
            "device_type": self.metadata.device_type,
            "version": self.metadata.version,
            "channel": self.metadata.channel,
            "description": self.metadata.description or "",
            "chipFamily": self.chip_family,
            "parts": [
                {
                    "path": self.relative_path,
                    "offset": 0,
                    "md5": self.md5,
                    "sha256": self.sha256,
                    "signature": self.signature,
                }
            ],
            "build_date": self.build_date,
            "file_size": self.file_size,
            "improv": self.metadata.improv,
            "md5": self.md5,
            "sha256": self.sha256,
            "signature": self.signature,
            "features": list(self.metadata.features),
            "hardware_requirements": list(self.metadata.hardware_requirements),
            "known_issues": [],
            "changelog": [],
        }
        if self.metadata.is_configuration:
            entry.update(
                {
                    "config_string": self.metadata.config_string,
                    "mounting": self.metadata.mounting,
                    "power": self.metadata.power,
                    "modules": list(self.metadata.modules),
                }
            )
        else:
            entry.update(
                {
                    "model": self.metadata.model,
                    "variant": self.metadata.variant,
                    "sensor_addon": self.metadata.sensor_addon,
                }
            )
        return entry


SIGNATURE_SALT = b"Sense360 Firmware Signing Salt v1"


def compute_digests(path: Path) -> Tuple[str, str, str]:
    md5_digest = hashlib.md5()
    sha_digest = hashlib.sha256()
    signature_digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            md5_digest.update(chunk)
            sha_digest.update(chunk)
            signature_digest.update(chunk)
    signature_digest.update(SIGNATURE_SALT)
    signature_bytes = signature_digest.digest()
    signature_blob = base64.b64encode(signature_bytes).decode("ascii")
    return md5_digest.hexdigest(), sha_digest.hexdigest(), signature_blob


def detect_chip_family(metadata: FirmwareMetadata, path: Path) -> str:
    haystack = f"{path.as_posix()} {metadata.name_part} {(metadata.model or '')}".lower()
    for needle, chip in CHIP_HINTS:
        if needle in haystack:
            return chip
    return "ESP32-S3"


def _version_tuple(value: str) -> Tuple[Tuple[int, ...], int, str]:
    main, _, suffix = value.partition("-")
    numeric_parts: List[int] = []
    for piece in main.split("."):
        piece = piece.strip()
        if not piece:
            numeric_parts.append(0)
            continue
        try:
            numeric_parts.append(int(piece))
        except ValueError:
            digits = "".join(ch for ch in piece if ch.isdigit())
            numeric_parts.append(int(digits) if digits else 0)
    if not numeric_parts:
        numeric_parts = [0]
    stability = 1 if not suffix else 0
    return (tuple(numeric_parts), stability, suffix)


def version_is_newer(candidate: str, current: str) -> bool:
    if _PackagingVersion is not None:
        try:
            return _PackagingVersion(candidate) > _PackagingVersion(current)
        except Exception:
            pass
    return _version_tuple(candidate) > _version_tuple(current)


def _version_sort_key(version: str) -> Tuple[Tuple[int, ...], int, str]:
    numeric_parts, stability, suffix = _version_tuple(version)
    neg_parts = tuple(-part for part in numeric_parts)
    return (neg_parts, -stability, suffix)


def collect_firmware(
    firmware_dir: Path,
    repo_root: Path,
    *,
    dry_run: bool = False,
    default_channel: str = DEFAULT_CHANNEL,
) -> List[FirmwareArtifact]:
    artifacts: List[FirmwareArtifact] = []
    if not firmware_dir.exists():
        return artifacts
    for bin_path in sorted(firmware_dir.rglob("*.bin")):
        try:
            rel_parts = bin_path.relative_to(firmware_dir).parts
        except ValueError:
            rel_parts = ()
        force_config = rel_parts and rel_parts[0] == "configurations"
        try:
            metadata = parse_firmware_metadata(
                bin_path,
                default_channel=default_channel,
                force_configuration=force_config,
            )
        except ValueError as exc:  # pragma: no cover - fatal validation
            raise SystemExit(f"Unable to parse metadata from {bin_path}: {exc}") from exc
        target_path = metadata.target_path(firmware_dir)
        source_path = bin_path
        if bin_path.resolve() != target_path.resolve():
            if dry_run:
                print(f"[dry-run] Would move {bin_path} -> {target_path}")
            else:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                if target_path.exists():
                    target_path.unlink()
                bin_path.replace(target_path)
                print(f"Normalised firmware path: {bin_path} → {target_path}")
                source_path = target_path
        else:
            source_path = bin_path
        chip_family = metadata.chip_family or detect_chip_family(metadata, target_path)
        md5, sha256, signature = compute_digests(source_path)
        stat = source_path.stat()
        build_date = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        rel_path = Path(os.path.relpath(target_path, repo_root)).as_posix()
        artifacts.append(
            FirmwareArtifact(
                path=target_path,
                metadata=metadata,
                relative_path=rel_path,
                chip_family=chip_family,
                md5=md5,
                sha256=sha256,
                signature=signature,
                file_size=stat.st_size,
                build_date=build_date,
            )
        )
    return artifacts


def select_latest_builds(
    artifacts: Sequence[FirmwareArtifact],
) -> Tuple[List[FirmwareArtifact], List[Tuple[FirmwareArtifact, FirmwareArtifact]]]:
    """Identify newer builds without discarding older versions."""

    best: Dict[Tuple[object, ...], FirmwareArtifact] = {}
    superseded: List[Tuple[FirmwareArtifact, FirmwareArtifact]] = []
    for artifact in artifacts:
        meta = artifact.metadata
        if meta.is_configuration:
            key = ("config", meta.config_string, meta.channel)
        else:
            key = (
                "legacy",
                meta.model,
                meta.variant,
                meta.sensor_addon,
                meta.channel,
            )
        current = best.get(key)
        if current is None:
            best[key] = artifact
            continue
        if version_is_newer(meta.version, current.metadata.version):
            superseded.append((current, artifact))
            best[key] = artifact
        elif version_is_newer(current.metadata.version, meta.version):
            superseded.append((artifact, current))
    return list(artifacts), superseded


def sort_artifacts(artifacts: Sequence[FirmwareArtifact]) -> List[FirmwareArtifact]:
    config_builds = [a for a in artifacts if a.metadata.is_configuration]
    legacy_builds = [a for a in artifacts if not a.metadata.is_configuration]
    config_builds.sort(key=lambda art: _version_sort_key(art.metadata.version))
    config_builds.sort(
        key=lambda art: (
            (art.metadata.config_string or "").lower(),
            CHANNEL_ORDER.get(art.metadata.channel, 99),
        )
    )
    legacy_builds.sort(key=lambda art: _version_sort_key(art.metadata.version))
    legacy_builds.sort(
        key=lambda art: (
            (art.metadata.model or "").lower(),
            (art.metadata.variant or "").lower(),
            (art.metadata.sensor_addon or "").lower(),
            CHANNEL_ORDER.get(art.metadata.channel, 99),
        )
    )
    return config_builds + legacy_builds


def determine_manifest_version(artifacts: Sequence[FirmwareArtifact]) -> str:
    stable_versions = []
    beta_versions = []
    fallback_versions = []
    for artifact in artifacts:
        channel = canonical_channel(artifact.metadata.channel, DEFAULT_CHANNEL)
        if channel == "stable":
            stable_versions.append(artifact.metadata.version)
        elif channel == "beta":
            beta_versions.append(artifact.metadata.version)
        else:
            fallback_versions.append(artifact.metadata.version)
    candidates = stable_versions or beta_versions or fallback_versions
    if not candidates:
        return "0.0.0"
    best_version = candidates[0]
    for candidate in candidates[1:]:
        if version_is_newer(candidate, best_version):
            best_version = candidate
    return best_version


def build_manifest(artifacts: Sequence[FirmwareArtifact]) -> Dict[str, object]:
    return {
        "name": "Sense360 Modular Platform Firmware",
        "version": determine_manifest_version(artifacts),
        "home_assistant_domain": "esphome",
        "funding_url": "https://sense360store.com/support",
        "new_install_prompt_erase": True,
        "new_install_improv_wait_time": 15,
        "builds": [artifact.manifest_entry() for artifact in artifacts],
    }


def write_json_file(path: Path, data: Dict[str, object], *, dry_run: bool) -> None:
    if dry_run:
        print(f"[dry-run] Would write {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def write_individual_manifests(
    artifacts: Sequence[FirmwareArtifact],
    prefix: Path,
    repo_root: Path,
    *,
    dry_run: bool,
) -> None:
    base_dir = (repo_root / prefix.parent).resolve()
    prefix_name = prefix.name
    if base_dir.exists():
        existing = sorted(base_dir.glob(f"{prefix_name}[0-9]*.json"))
    else:
        existing = []
    for path in existing:
        if dry_run:
            print(f"[dry-run] Would remove {path}")
        else:
            path.unlink()
    for index, artifact in enumerate(artifacts):
        data = {
            "name": "Sense360 ESP32 Firmware - Core Module",
            "version": artifact.metadata.version,
            "home_assistant_domain": "esphome",
            "funding_url": "https://sense360store.com/support",
            "new_install_prompt_erase": True,
            "new_install_improv_wait_time": 15,
            "builds": [
                {
                    "chipFamily": artifact.chip_family,
                    "parts": [
                        {
                            "path": artifact.relative_path,
                            "offset": 0,
                            "md5": artifact.md5,
                            "sha256": artifact.sha256,
                            "signature": artifact.signature,
                        }
                    ],
                    "improv": artifact.metadata.improv,
                    "md5": artifact.md5,
                    "sha256": artifact.sha256,
                    "signature": artifact.signature,
                }
            ],
        }
        path = base_dir / f"{prefix_name}{index}.json"
        if dry_run:
            print(f"[dry-run] Would write {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", encoding="utf-8") as handle:
                json.dump(data, handle, indent=2)
                handle.write("\n")


def build_summary_table(artifacts: Sequence[FirmwareArtifact]) -> str:
    headers = ["Idx", "Device/Config", "Channel", "Version", "Path", "MD5"]
    rows: List[List[str]] = []
    for index, artifact in enumerate(artifacts):
        meta = artifact.metadata
        if meta.is_configuration:
            device = f"Sense360-{meta.config_string}"
        else:
            parts = [meta.model or "Sense360"]
            if meta.variant:
                parts.append(meta.variant)
            device = " ".join(part for part in parts if part).strip()
            if meta.sensor_addon:
                device += f" ({meta.sensor_addon})"
        rows.append(
            [
                str(index),
                device,
                meta.channel,
                meta.version,
                artifact.relative_path,
                artifact.md5,
            ]
        )
    data = [headers] + rows
    widths = [max(len(row[i]) for row in data) for i in range(len(headers))]
    lines = [
        "  ".join(row[i].ljust(widths[i]) for i in range(len(headers))).rstrip()
        for row in data
    ]
    return "\n".join(lines)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate manifest.json and ESP Web Tools manifests from firmware binaries."
        )
    )
    parser.add_argument(
        "--firmware-dir",
        default="firmware",
        help="Directory that stores firmware binaries (default: firmware)",
    )
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repository root used for relative paths (default: current directory)",
    )
    parser.add_argument(
        "--manifest-path",
        default="manifest.json",
        help="Path to write manifest.json (default: manifest.json)",
    )
    parser.add_argument(
        "--manifest-prefix",
        default="firmware-",
        help="Filename prefix (optionally with directories) for ESP Web Tools manifests.",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print a summary table of detected firmware builds.",
    )
    parser.add_argument(
        "--summary-file",
        help="Optional path to write the summary table.",
    )
    parser.add_argument(
        "--allow-empty",
        action="store_true",
        help="Do not fail when no firmware binaries are found.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing files or moving binaries.",
    )
    parser.add_argument(
        "--assert-config",
        action="append",
        dest="assert_configs",
        help=(
            "Ensure that the specified configuration string exists in the generated "
            "manifest. Can be provided multiple times or as a comma-separated list."
        ),
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    firmware_dir = (repo_root / args.firmware_dir).resolve()
    manifest_path = (repo_root / args.manifest_path).resolve()
    manifest_prefix = Path(args.manifest_prefix)
    artifacts = collect_firmware(
        firmware_dir,
        repo_root,
        dry_run=args.dry_run,
        default_channel=DEFAULT_CHANNEL,
    )
    if not artifacts:
        message = f"No firmware binaries found in {firmware_dir}"
        if args.allow_empty:
            print(message)
            return 0
        raise SystemExit(message)
    selected, superseded = select_latest_builds(artifacts)
    if superseded:
        print("Detected multiple versions of the same firmware; keeping the newest builds.")
        for old, new in superseded:
            print(
                f"  - {new.metadata.name_part} {new.metadata.version} ({new.metadata.channel}) "
                f"supersedes {old.metadata.version}"
            )
    ordered = sort_artifacts(selected)
    manifest = build_manifest(ordered)
    if not manifest["builds"]:
        message = "Manifest would be empty; aborting."
        if args.allow_empty:
            print(message)
            return 0
        raise SystemExit(message)
    requested_configs: List[str] = []
    if args.assert_configs:
        for value in args.assert_configs:
            if not value:
                continue
            requested_configs.extend(
                [item.strip() for item in value.split(",") if item.strip()]
            )
    if args.summary or args.summary_file or requested_configs:
        table = build_summary_table(ordered)
        print("\nFirmware summary:\n")
        print(table)
        summary_path = args.summary_file or os.environ.get("GITHUB_STEP_SUMMARY")
        if summary_path:
            summary_target = Path(summary_path)
            if args.dry_run:
                print(f"[dry-run] Would write summary table to {summary_target}")
            else:
                summary_target.parent.mkdir(parents=True, exist_ok=True)
                summary_target.write_text(table + "\n", encoding="utf-8")
    if requested_configs:
        available_configs = {
            artifact.metadata.config_string
            for artifact in ordered
            if artifact.metadata.is_configuration and artifact.metadata.config_string
        }
        missing_configs = sorted(
            config for config in requested_configs if config not in available_configs
        )
        if missing_configs:
            print(
                "Missing required configuration(s): "
                + ", ".join(missing_configs),
                file=sys.stderr,
            )
            return 1
    write_json_file(manifest_path, manifest, dry_run=args.dry_run)
    write_individual_manifests(
        ordered,
        manifest_prefix,
        repo_root,
        dry_run=args.dry_run,
    )
    print(
        f"Generated {manifest_path} and {len(ordered)} ESP Web Tools manifest file(s) "
        f"with {len(ordered)} build entries."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
