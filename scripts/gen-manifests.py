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
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

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

CORE_TOKENS = {
    "core",
    "corevoice",
}
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

CANONICAL_MOUNTINGS = {
    "ceiling": "Ceiling",
    "wall": "Wall",
    "mini": "Mini",
    "desk": "Desk",
    "portable": "Portable",
    "lab": "Lab",
    "bench": "Bench",
    "dev": "Dev",
    "test": "Test",
    "universal": "Universal",
}

EXACT_POWER_TOKENS = {"USB", "POE", "PWR"}

CANONICAL_MODULE_TOKENS: Dict[str, str] = {
    "airiqpro": "AirIQ",
    "bathroomairiq": "VentIQ",
    "bathroomairiqbase": "VentIQ",
    "bathroomairiqpro": "VentIQ",
    "ventiqpro": "VentIQ",
    # The DAC SKU was historically called "Fan Analog"; canonicalise legacy
    # FanAnalog tokens in firmware filenames to the current FanDAC SKU name.
    "fananalog": "FanDAC",
}

LEGACY_MODULE_TOKENS = frozenset(CANONICAL_MODULE_TOKENS.keys())
DEPRECATED_MODULE_TOKENS = frozenset(
    {
        "airiqpro",
        "bathroomairiq",
        "bathroomairiqbase",
        "bathroomairiqpro",
        "ventiqpro",
    }
)

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
    core_type: Optional[str]
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
    # Improv Serial support is a property of the firmware source, not of
    # WebFlash: no currently shipped upstream binary implements improv_serial
    # (empirically verified against sense360store/esphome-public; see the
    # improv_serial finding recorded there in docs/improv-serial-finding.md),
    # so the default is False. A build gets improv=True only when its
    # .meta.json sidecar says so, which the importer writes only from an
    # explicit `improv: true` opt-in on the matching firmware/sources.json
    # entry once an improv-bearing release actually ships.
    improv: bool = False
    custom_directory: Optional[str] = None
    changelog: List[str] = field(default_factory=list)
    known_issues: List[str] = field(default_factory=list)
    deprecated: bool = False
    deprecation_reason: Optional[str] = None
    signed_by: Optional[str] = None
    artifact_type: str = "application"
    local_only: bool = False

    # Presentation-only channel demotion (see _apply_channel_presentation):
    # `channel` stays the immutable file channel the published filename
    # declares and keeps governing the filename, path normalisation, dedupe
    # keys and per-file channel policy; `presented_channel` governs only what
    # the manifest serves (entry channel, description, ordering, defaulting),
    # so the wizard gates the build on the presented channel while the
    # published .bin never moves or renames.
    presented_channel: Optional[str] = None

    @property
    def effective_channel(self) -> str:
        return self.presented_channel or self.channel

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
            core_type=None,
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
            artifact_type="rescue",
        )
        return metadata
    first_token = config_tokens[0] if config_tokens else ""
    is_config = False
    if force_configuration is not None:
        is_config = force_configuration
    elif first_token and first_token.lower() in CORE_TOKENS:
        # New format: Core/CoreVoice-Mounting-Power-Modules
        is_config = True
    elif first_token and first_token.lower() in MOUNTING_TOKENS:
        # Legacy format: Mounting-Power-Modules
        is_config = True
    if is_config:
        if not config_tokens:
            raise ValueError(f"No configuration tokens found in '{name}'")

        # Check if first token is Core/CoreVoice
        core_type = None
        token_index = 0
        if config_tokens[0].lower() in CORE_TOKENS:
            core_type = config_tokens[0]  # Preserve original casing (Core or CoreVoice)
            token_index = 1

        if len(config_tokens) <= token_index:
            raise ValueError(f"Missing mounting token in '{name}'")

        config_tail = config_tokens[token_index:]
        if not config_tail:
            raise ValueError(f"Missing mounting token in '{name}'")

        mounting = None
        mounting_index = None
        for index, token in enumerate(config_tail):
            canonical_mount = CANONICAL_MOUNTINGS.get(token.replace("_", "-").lower())
            if canonical_mount:
                mounting = canonical_mount
                mounting_index = index
                break
        if mounting is None:
            raw_mounting = config_tail[0].replace("_", "-").strip()
            mounting = CANONICAL_MOUNTINGS.get(raw_mounting.lower(), raw_mounting.title())
            mounting_index = 0

        power = None
        power_index = None
        for index, token in enumerate(config_tail):
            candidate = token.upper()
            if candidate in EXACT_POWER_TOKENS:
                power = candidate
                power_index = index
                break

        consumed_indexes = {mounting_index}
        if power_index is not None:
            consumed_indexes.add(power_index)
        module_tokens = [
            token for index, token in enumerate(config_tail) if index not in consumed_indexes
        ]
        config_string = "-".join(config_tokens)
        description = describe_configuration(channel, config_string)
        return FirmwareMetadata(
            name_part=config_string,
            version=version,
            channel=channel,
            is_configuration=True,
            config_string=config_string,
            core_type=core_type,
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
        core_type=None,
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
    source_commit: Optional[str] = None
    source_url: Optional[str] = None
    # Real Ed25519 signature (RFC 8032) over the raw firmware bytes. Mirrors
    # the `signature_ed25519` / `signature_key_id` fields the wizard
    # verifies via Web Crypto. Unsigned artifacts (e.g. when --no-sign is
    # passed for a smoke test) leave both fields empty and the runtime gate
    # blocks the install.
    signature_ed25519: str = ""
    signature_key_id: str = ""

    def manifest_entry(self) -> Dict[str, object]:
        # Changelogs are intentionally NOT synthesised here — a generated
        # changelog proves only that the generator ran, not that a human
        # documented the release. Stable builds without a sidecar-provided
        # changelog will fail the runtime provenance gate, which is the
        # desired behaviour: the publishing pipeline must produce a real,
        # human-authored entry (typically via a `.meta.json` sidecar or a
        # release-notes file).
        changelog = list(self.metadata.changelog) if self.metadata.changelog else []

        part_entry: Dict[str, object] = {
            "path": self.relative_path,
            "offset": 0,
            "md5": self.md5,
            "sha256": self.sha256,
            "signature": self.signature,
        }
        if self.signature_ed25519:
            part_entry["signature_ed25519"] = self.signature_ed25519
            part_entry["signature_key_id"] = self.signature_key_id

        entry: Dict[str, object] = {
            "device_type": self.metadata.device_type,
            "version": self.metadata.version,
            "channel": self.metadata.effective_channel,
            "description": self.metadata.description or "",
            "chipFamily": self.chip_family,
            "parts": [part_entry],
            "build_date": self.build_date,
            "file_size": self.file_size,
            "improv": self.metadata.improv,
            "md5": self.md5,
            "sha256": self.sha256,
            "signature": self.signature,
            "signature_ed25519": self.signature_ed25519,
            "signature_key_id": self.signature_key_id,
            "features": list(self.metadata.features),
            "hardware_requirements": list(self.metadata.hardware_requirements),
            "known_issues": list(self.metadata.known_issues),
            "changelog": changelog,
            "source_commit": self.source_commit,
            "source_url": self.source_url,
            "signed_by": self.metadata.signed_by,
            "deprecated": bool(self.metadata.deprecated),
            "deprecation_reason": self.metadata.deprecation_reason,
            "artifact_type": self.metadata.artifact_type or "application",
            "local_only": bool(self.metadata.local_only),
        }
        if self.metadata.is_configuration:
            entry.update(
                {
                    "config_string": self.metadata.config_string,
                    "core_type": self.metadata.core_type,
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

# --- Ed25519 firmware signing -----------------------------------------------
#
# WebFlash refuses to flash production (`stable`-channel) firmware unless the
# binary's bytes verify against an Ed25519 (RFC 8032) signature produced by a
# private key whose matching public key is pinned in
# `scripts/utils/firmware-trusted-keys.js`. The signature is computed over
# the raw firmware bytes themselves — no manifest canonicalisation step.
#
# Key resolution order (signing pipeline):
#   1. --signing-key <path> CLI flag.
#   2. WEBFLASH_FIRMWARE_PRIVATE_KEY_B64 env var (raw 32-byte seed, base64).
#   3. WEBFLASH_FIRMWARE_PRIVATE_KEY_PATH env var.
#   4. firmware-signing/keys/dev-2026-01-private.raw.b64 (committed dev key).
# When --no-sign is set, every artifact ships with empty signature_ed25519
# fields and the wizard refuses to install. That mode exists for offline
# smoke tests, never for production.

DEFAULT_DEV_KEY_ID = "dev-2026-01"
DEFAULT_DEV_KEY_RELATIVE_PATH = (
    "firmware-signing/keys/dev-2026-01-private.raw.b64"
)
TRUSTED_KEYS_RELATIVE_PATH = "firmware-signing/trusted-keys.json"


def _decode_b64(value: str) -> bytes:
    return base64.b64decode(value.strip().encode("ascii"), validate=True)


def load_signing_key(
    *,
    repo_root: Path,
    cli_path: Optional[str] = None,
) -> Tuple[Optional["ed25519.Ed25519PrivateKey"], Optional[str]]:
    """Return ``(private_key, key_id)`` or ``(None, None)`` when signing is
    disabled. Raises :class:`SystemExit` when a key was requested but cannot
    be loaded (e.g. the path does not exist) — silent fallback would let a
    publish run produce unsigned artifacts that the wizard would refuse to
    install, surfacing the failure far too late.
    """

    try:
        from cryptography.hazmat.primitives.asymmetric import ed25519
        from cryptography.hazmat.primitives import serialization
    except ImportError as exc:  # pragma: no cover - exercised in CI
        raise SystemExit(
            "The 'cryptography' package is required to sign firmware. "
            "Install it via `pip install cryptography` or pass --no-sign for "
            "an unsigned (non-installable) manifest."
        ) from exc

    env_key_id = os.environ.get("WEBFLASH_FIRMWARE_KEY_ID", "").strip()

    def _from_raw_b64(raw_b64: str, source: str) -> "ed25519.Ed25519PrivateKey":
        try:
            seed = _decode_b64(raw_b64)
        except (ValueError, base64.binascii.Error) as exc:
            raise SystemExit(
                f"Signing key from {source} is not valid base64: {exc}"
            ) from exc
        if len(seed) != 32:
            raise SystemExit(
                f"Signing key from {source} must decode to 32 bytes (got {len(seed)})."
            )
        return ed25519.Ed25519PrivateKey.from_private_bytes(seed)

    def _from_path(path: Path) -> "ed25519.Ed25519PrivateKey":
        if not path.exists():
            raise SystemExit(
                f"Signing key path {path} does not exist. Pass --no-sign for "
                "an explicitly unsigned (non-installable) manifest."
            )
        raw = path.read_bytes()
        # Accept both PEM (PKCS#8) and raw-base64 forms; the dev key on disk
        # is raw-base64, but operators rotating to a production key may keep
        # the PEM emitted by `openssl genpkey`.
        text = raw.decode("ascii", errors="ignore").strip()
        if text.startswith("-----BEGIN"):
            try:
                key = serialization.load_pem_private_key(raw, password=None)
            except Exception as exc:  # pragma: no cover - cryptography raises various subclasses
                raise SystemExit(f"Unable to load PEM signing key {path}: {exc}") from exc
            if not isinstance(key, ed25519.Ed25519PrivateKey):
                raise SystemExit(
                    f"Signing key {path} is not an Ed25519 key; firmware "
                    "authenticity verification only supports Ed25519."
                )
            return key
        return _from_raw_b64(text, str(path))

    # 1. CLI flag.
    if cli_path:
        priv = _from_path(Path(cli_path))
        kid = env_key_id or Path(cli_path).stem.replace("-private", "").replace(".raw", "")
        return priv, kid

    # 2. Env var (raw base64 seed).
    env_b64 = os.environ.get("WEBFLASH_FIRMWARE_PRIVATE_KEY_B64", "").strip()
    if env_b64:
        priv = _from_raw_b64(env_b64, "WEBFLASH_FIRMWARE_PRIVATE_KEY_B64")
        if not env_key_id:
            raise SystemExit(
                "WEBFLASH_FIRMWARE_PRIVATE_KEY_B64 was set but "
                "WEBFLASH_FIRMWARE_KEY_ID is missing. Set it to the kid that "
                "matches the corresponding entry in trusted-keys.json."
            )
        return priv, env_key_id

    # 3. Env var (path).
    env_path = os.environ.get("WEBFLASH_FIRMWARE_PRIVATE_KEY_PATH", "").strip()
    if env_path:
        priv = _from_path(Path(env_path))
        kid = env_key_id or Path(env_path).stem.replace("-private", "").replace(".raw", "")
        return priv, kid

    # 4. Default committed dev key (signs placeholder fixtures only).
    default_path = repo_root / DEFAULT_DEV_KEY_RELATIVE_PATH
    if default_path.exists():
        priv = _from_path(default_path)
        kid = env_key_id or DEFAULT_DEV_KEY_ID
        return priv, kid

    # No key found at all.
    raise SystemExit(
        f"Could not locate a firmware signing key. Tried CLI flag, "
        f"WEBFLASH_FIRMWARE_PRIVATE_KEY_B64, WEBFLASH_FIRMWARE_PRIVATE_KEY_PATH, "
        f"and {default_path}. Pass --no-sign to opt out (the resulting "
        "manifest will not be installable)."
    )


def lookup_trusted_key(repo_root: Path, key_id: str) -> Dict[str, Any]:
    """Return the trust-list entry for ``key_id``. Raises :class:`SystemExit`
    when the entry is missing or the public key on disk does not match the
    pinned value — both indicate a misconfigured signing pipeline.
    """

    trusted_path = repo_root / TRUSTED_KEYS_RELATIVE_PATH
    if not trusted_path.exists():
        raise SystemExit(
            f"Trusted keys file {trusted_path} not found; cannot verify the "
            "signing key against the pinned trust list."
        )
    try:
        data = json.loads(trusted_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SystemExit(f"Unable to read {trusted_path}: {exc}") from exc

    keys = data.get("keys") if isinstance(data, dict) else None
    if not isinstance(keys, list):
        raise SystemExit(
            f"{trusted_path} is missing a 'keys' array; cannot verify trust."
        )

    matched = next(
        (entry for entry in keys
         if isinstance(entry, dict)
         and entry.get("kid") == key_id),
        None,
    )
    if matched is None:
        raise SystemExit(
            f"Signing key id {key_id!r} is not pinned in {trusted_path}. "
            "Add it (with the matching public key) before publishing, or "
            "rotate to an existing trusted key."
        )
    return matched


def assert_key_pinned_in_trust_list(
    repo_root: Path,
    key_id: str,
    public_key_b64: str,
    *,
    mode: str = "production",
) -> Dict[str, Any]:
    """Fail the build when the signing key id is not pinned with an
    acceptable status, OR when the matching public key on disk has been
    rotated without updating trusted-keys.json.

    Returns the matched trust entry so the caller can use the status field.

    Mode semantics mirror ``verifyFirmwareSignature`` / ``isKeyAcceptable``
    in the JS layer:
      * ``production`` — only ``status: 'active'`` keys may sign. Rejects
        ``test_only`` so the public-repo dev key cannot sign a real
        production manifest.
      * ``development`` / ``test`` — also accepts ``status: 'test_only'``.
    """

    matched = lookup_trusted_key(repo_root, key_id)
    status = matched.get("status")
    pinned_pub = (matched.get("public_key_b64") or "").strip()

    if pinned_pub != public_key_b64:
        raise SystemExit(
            f"Signing key id {key_id!r} public key does not match the "
            f"pinned trust list entry. Either the private key on disk has "
            "been rotated without updating trusted-keys.json, or the wrong "
            "key id was supplied."
        )

    accepted_statuses = {"active"}
    if mode in {"development", "test"}:
        accepted_statuses.add("test_only")

    if status not in accepted_statuses:
        if status == "test_only" and mode == "production":
            raise SystemExit(
                f"Signing key id {key_id!r} is marked 'test_only' (its "
                f"private half is exposed in the repo). It MUST NOT sign "
                f"production manifests — anyone with read access could "
                f"forge installable firmware. Pass --mode development for "
                f"local fixture builds, or rotate to an 'active' key whose "
                f"private half lives only in CI secrets. See "
                f"firmware-signing/README.md."
            )
        raise SystemExit(
            f"Signing key id {key_id!r} has status {status!r} in "
            f"{repo_root / TRUSTED_KEYS_RELATIVE_PATH}; only "
            f"{sorted(accepted_statuses)} keys may sign new firmware in "
            f"mode={mode!r}."
        )

    return matched


def sign_firmware_bytes(
    private_key: "ed25519.Ed25519PrivateKey", payload: bytes
) -> str:
    """Return base64 of the raw 64-byte Ed25519 signature over ``payload``."""

    signature = private_key.sign(payload)
    return base64.b64encode(signature).decode("ascii")

# Required provenance fields for the runtime install gate. Mirrored in
# scripts/utils/firmware-provenance.js — keep the lists aligned.
REQUIRED_PROVENANCE_FIELDS: Tuple[str, ...] = (
    "sha256",
    "signature",
    "source_commit",
    "file_size",
    "changelog",
)

# Critical provenance primitives — blocking for any remotely flashable
# firmware regardless of channel. Mirrors CRITICAL_PROVENANCE_FIELDS in
# scripts/utils/firmware-provenance.js.
CRITICAL_PROVENANCE_FIELDS: Tuple[str, ...] = (
    "sha256",
    "signature",
    "source_commit",
    "file_size",
)

# Channels only allowed in development/test mode. Production manifests must
# not expose them.
DEVELOPMENT_ONLY_CHANNELS = frozenset({"dev", "alpha", "nightly", "canary",
                                      "experimental", "test"})

# Trust-mode names for manifest validation. `production` is the public
# default and rejects any weak provenance. `development` and `test` are
# explicit opt-ins for fixtures and bench builds.
VALIDATION_MODES = ("production", "development", "test")

# Default repository URL used to build per-build `source_url` links when a
# source commit is known. Override at the CLI with --source-url-template.
DEFAULT_SOURCE_URL_TEMPLATE = "https://github.com/sense360store/WebFlash/commit/{commit}"

# URL fragments that mark a source_url as MUTABLE (branch, latest tag, HEAD).
# Mirrors MUTABLE_SOURCE_URL_PATTERNS in scripts/utils/firmware-provenance.js.
_MUTABLE_SOURCE_URL_PATTERNS = [
    re.compile(r"/tree/(?:main|master|develop|dev|trunk|head)(?:/|$|\?|#)", re.IGNORECASE),
    re.compile(r"/blob/(?:main|master|develop|dev|trunk|head)(?:/|$|\?|#)", re.IGNORECASE),
    re.compile(r"/commits/(?:main|master|develop|dev|trunk|head)(?:/|$|\?|#)", re.IGNORECASE),
    re.compile(r"/raw/(?:main|master|develop|dev|trunk|head)(?:/|$|\?|#)", re.IGNORECASE),
    re.compile(r"/releases/latest(?:/|$|\?|#)", re.IGNORECASE),
    re.compile(r"[?&]ref=(?:main|master|develop|dev|trunk|head)(?:&|$)", re.IGNORECASE),
]

# Generic boilerplate that must NOT be accepted as a hand-authored changelog
# for stable builds. Sidecar metadata is otherwise free to paper over missing
# provenance with filler text.
_GENERIC_CHANGELOG_FILLERS = [
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
]


def _is_mutable_source_url(url: Optional[str]) -> bool:
    if not isinstance(url, str):
        return False
    value = url.strip()
    if not value:
        return False
    return any(pattern.search(value) for pattern in _MUTABLE_SOURCE_URL_PATTERNS)


def _source_url_matches_commit(url: Optional[str], commit: Optional[str]) -> bool:
    if not isinstance(url, str) or not isinstance(commit, str):
        return False
    u = url.strip()
    c = commit.strip()
    if not u or not c:
        return False
    if c in u:
        return True
    if len(c) >= 7 and c[:7] in u:
        return True
    return False


def _changelog_looks_filler(changelog: Sequence[Any]) -> bool:
    if not isinstance(changelog, list) or not changelog:
        return False
    for entry in changelog:
        if not isinstance(entry, str):
            return False
        text = entry.strip()
        if not text:
            continue
        if not any(pattern.match(text) for pattern in _GENERIC_CHANGELOG_FILLERS):
            return False
    return True


def detect_source_commit(repo_root: Path) -> Optional[str]:
    """Best-effort source commit lookup, used so each manifest entry can be
    traced back to the tree that produced it.

    Order of preference:
      1. ``WEBFLASH_SOURCE_COMMIT`` env var (CI-friendly override).
      2. ``git rev-parse HEAD`` from ``repo_root``.
    Returns ``None`` if neither path yields a SHA.
    """

    override = os.environ.get("WEBFLASH_SOURCE_COMMIT", "").strip()
    if override:
        return override
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        sha = result.stdout.strip()
        return sha or None
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        return None


def load_sidecar_metadata(bin_path: Path) -> Dict[str, Any]:
    """Optional sidecar JSON keyed off the firmware filename. Lets release
    pipelines attach hand-curated provenance (signed_by, deprecated flag,
    upstream changelog, etc.) without modifying the binary.
    """

    sidecar = bin_path.with_suffix(bin_path.suffix + ".meta.json")
    if not sidecar.exists():
        sidecar = bin_path.with_suffix(".meta.json")
    if not sidecar.exists():
        return {}
    try:
        with sidecar.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        print(
            f"[warn] Unable to read sidecar metadata {sidecar}: {exc}",
            file=sys.stderr,
        )
        return {}
    if not isinstance(data, dict):
        print(
            f"[warn] Sidecar metadata {sidecar} did not contain a JSON object; ignoring.",
            file=sys.stderr,
        )
        return {}
    return data


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


def _apply_sidecar_metadata(metadata: FirmwareMetadata, sidecar: Dict[str, Any]) -> None:
    if not sidecar:
        return
    changelog = sidecar.get("changelog")
    if isinstance(changelog, list):
        metadata.changelog = [str(entry) for entry in changelog if str(entry).strip()]
    elif isinstance(changelog, str) and changelog.strip():
        metadata.changelog = [changelog.strip()]
    known_issues = sidecar.get("known_issues")
    if isinstance(known_issues, list):
        metadata.known_issues = [str(entry) for entry in known_issues if str(entry).strip()]
    # ``features`` and ``hardware_requirements`` flow through the same path
    # as the other release-body sections so the generated manifest exposes
    # the human-authored copy verbatim. Sidecar values override the
    # parser-supplied defaults (e.g. the "rescue" feature tag) so explicit
    # operator intent always wins.
    if "features" in sidecar:
        features = sidecar.get("features")
        if isinstance(features, list):
            metadata.features = [str(entry) for entry in features if str(entry).strip()]
    if "hardware_requirements" in sidecar:
        hardware_requirements = sidecar.get("hardware_requirements")
        if isinstance(hardware_requirements, list):
            metadata.hardware_requirements = [
                str(entry) for entry in hardware_requirements if str(entry).strip()
            ]
    if "improv" in sidecar:
        metadata.improv = bool(sidecar.get("improv"))
    if "deprecated" in sidecar:
        metadata.deprecated = bool(sidecar.get("deprecated"))
    if sidecar.get("deprecation_reason"):
        metadata.deprecation_reason = str(sidecar["deprecation_reason"]).strip() or None
    if sidecar.get("signed_by"):
        metadata.signed_by = str(sidecar["signed_by"]).strip() or None
    if sidecar.get("artifact_type"):
        candidate = str(sidecar["artifact_type"]).strip().lower()
        if candidate in {"application", "rescue", "bootloader",
                          "partition_table", "test_fixture"}:
            metadata.artifact_type = candidate
    if "local_only" in sidecar:
        metadata.local_only = bool(sidecar.get("local_only"))
    if "channel_presentation" in sidecar:
        _apply_channel_presentation(metadata, sidecar)


# Presentation demotions only: a sidecar may present a build on a LESS
# prominent channel than its immutable filename declares (stable -> preview,
# so the preview acknowledgement gate applies), never a more prominent one.
# A promotion via sidecar would let an unpublished or preview binary present
# as stable, weakening the trust model, so it is a hard error, as is any
# attempt to touch the rescue channel. Introduced for the owner decision of
# 2026-07-28 (SENSE360-CANONICALISATION-001): esphome-public PR #834 is
# upheld, Ceiling-POE-AirIQ-RoomIQ's recorded channel stays preview, and the
# served presentation of its immutable v1.0.9 stable-named binary follows
# the recorded channel.
CHANNEL_PROMINENCE = {"stable": 3, "beta": 2, "preview": 1, "dev": 0}


def _apply_channel_presentation(metadata: "FirmwareMetadata", sidecar: Dict[str, object]) -> None:
    requested = str(sidecar.get("channel_presentation") or "").strip().lower()
    reason = str(sidecar.get("channel_presentation_reason") or "").strip()
    current = metadata.channel
    if requested not in CHANNEL_PROMINENCE or current not in CHANNEL_PROMINENCE:
        raise SystemExit(
            f"channel_presentation {requested!r} on a {current!r} build is not "
            "supported: only the non-rescue channels "
            f"{sorted(CHANNEL_PROMINENCE)} participate in presentation demotion"
        )
    if CHANNEL_PROMINENCE[requested] >= CHANNEL_PROMINENCE[current]:
        raise SystemExit(
            f"channel_presentation {requested!r} would not demote a {current!r} "
            "build: presentation overrides may only move a build to a less "
            "prominent channel, never promote it"
        )
    if not reason:
        raise SystemExit(
            "channel_presentation requires channel_presentation_reason: a "
            "presentation demotion is an operator decision and must say why"
        )
    metadata.presented_channel = requested
    # The customer-facing description carries the channel copy, so it is
    # re-derived from the presented channel; metadata.channel, the filename
    # and the binary stay exactly as published.
    if metadata.is_configuration and metadata.config_string:
        metadata.description = describe_configuration(requested, metadata.config_string)


def collect_firmware(
    firmware_dir: Path,
    repo_root: Path,
    *,
    dry_run: bool = False,
    default_channel: str = DEFAULT_CHANNEL,
    source_commit: Optional[str] = None,
    source_url_template: str = DEFAULT_SOURCE_URL_TEMPLATE,
    signing_key: Optional["ed25519.Ed25519PrivateKey"] = None,
    signing_key_id: Optional[str] = None,
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
        sidecar = load_sidecar_metadata(bin_path)
        _apply_sidecar_metadata(metadata, sidecar)
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
        per_build_commit = sidecar.get("source_commit") if isinstance(sidecar, dict) else None
        if isinstance(per_build_commit, str) and per_build_commit.strip():
            commit_value: Optional[str] = per_build_commit.strip()
        else:
            commit_value = source_commit
        per_build_url = sidecar.get("source_url") if isinstance(sidecar, dict) else None
        if isinstance(per_build_url, str) and per_build_url.strip():
            url_value: Optional[str] = per_build_url.strip()
        elif commit_value and source_url_template:
            try:
                url_value = source_url_template.format(commit=commit_value)
            except (KeyError, IndexError, ValueError):
                url_value = None
        else:
            url_value = None
        signature_ed25519 = ""
        if signing_key is not None and signing_key_id:
            payload = source_path.read_bytes()
            signature_ed25519 = sign_firmware_bytes(signing_key, payload)
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
                source_commit=commit_value,
                source_url=url_value,
                signature_ed25519=signature_ed25519,
                signature_key_id=signing_key_id if signature_ed25519 else "",
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
            CHANNEL_ORDER.get(art.metadata.effective_channel, 99),
        )
    )
    legacy_builds.sort(key=lambda art: _version_sort_key(art.metadata.version))
    legacy_builds.sort(
        key=lambda art: (
            (art.metadata.model or "").lower(),
            (art.metadata.variant or "").lower(),
            (art.metadata.sensor_addon or "").lower(),
            CHANNEL_ORDER.get(art.metadata.effective_channel, 99),
        )
    )
    return config_builds + legacy_builds


def determine_manifest_version(artifacts: Sequence[FirmwareArtifact]) -> str:
    stable_versions = []
    beta_versions = []
    fallback_versions = []
    for artifact in artifacts:
        channel = canonical_channel(artifact.metadata.effective_channel, DEFAULT_CHANNEL)
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


# Schema version of the top-level WebFlash manifest envelope (independent
# of the ESP Web Tools `version` field, which tracks the latest firmware
# build). Bump only when the WebFlash front-end requires a coordinated
# change to read the new shape.
MANIFEST_SCHEMA_VERSION = 1

# Seconds ESP Web Tools waits for an Improv Serial handshake after a new
# install. Emitted only for improv-capable builds; manifests whose builds
# implement no Improv get 0 so the flasher does not stall on a handshake
# the firmware cannot send.
IMPROV_WAIT_TIME_SECONDS = 15


def build_manifest(
    artifacts: Sequence[FirmwareArtifact],
    *,
    source_commit: Optional[str] = None,
    generated_at: Optional[str] = None,
) -> Dict[str, object]:
    return {
        "name": "Sense360 Modular Platform Firmware",
        "version": determine_manifest_version(artifacts),
        "manifest_version": MANIFEST_SCHEMA_VERSION,
        "generated_at": generated_at or datetime.now(timezone.utc).isoformat(),
        "source_commit": source_commit or "unknown",
        "home_assistant_domain": "esphome",
        "funding_url": "https://sense360store.com/support",
        "new_install_prompt_erase": True,
        # Only advertise an improv wait when at least one build actually
        # implements Improv Serial; otherwise the flasher stalls 15 seconds
        # after every install waiting for a handshake that never arrives.
        "new_install_improv_wait_time": (
            IMPROV_WAIT_TIME_SECONDS
            if any(artifact.metadata.improv for artifact in artifacts)
            else 0
        ),
        "builds": [artifact.manifest_entry() for artifact in artifacts],
    }


def _collect_deprecated_module_hits(values: Sequence[str]) -> List[str]:
    hits: List[str] = []
    for value in values:
        parts = [part for part in value.split("-") if part]
        for part in parts:
            if part.lower() in DEPRECATED_MODULE_TOKENS:
                hits.append(part)
    return hits


def validate_no_deprecated_modules(artifacts: Sequence[FirmwareArtifact]) -> None:
    for artifact in artifacts:
        meta = artifact.metadata
        if not meta.is_configuration:
            continue
        deprecated_hits = _collect_deprecated_module_hits([meta.config_string or ""])
        deprecated_hits.extend(_collect_deprecated_module_hits(meta.modules))
        deprecated_hits.extend(_collect_deprecated_module_hits([meta.description]))
        if deprecated_hits:
            hits = ", ".join(sorted(set(deprecated_hits), key=str.lower))
            raise SystemExit(
                f"Deprecated module name(s) found in {artifact.path.name}: {hits}. "
                "Use current module taxonomy (for example: AirIQ, VentIQ)."
            )




def validate_no_duplicate_config_strings(artifacts: Sequence[FirmwareArtifact]) -> None:
    """Refuse to emit a manifest with two builds sharing config_string+channel.

    The frontend resolves a wizard selection by matching ``build.config_string``
    (within a channel), so two builds carrying the same key produce an
    ambiguous, non-deterministic match. The importer's prune step keeps the
    tree clean during a normal import, but a standalone regen over a dirty
    ``firmware/configurations/`` (e.g. an old and a new version of the same
    config both present) would otherwise silently emit both. Fail loudly here
    instead.
    """

    seen: Dict[Tuple[str, str], str] = {}
    duplicates: List[str] = []
    for artifact in artifacts:
        meta = artifact.metadata
        if not meta.is_configuration or not meta.config_string:
            continue
        key = (meta.config_string, meta.channel or "")
        if key in seen:
            duplicates.append(
                f"{meta.config_string} ({meta.channel}): "
                f"{seen[key]} and {artifact.path.name}"
            )
        else:
            seen[key] = artifact.path.name
    if duplicates:
        raise SystemExit(
            "Duplicate config_string+channel builds would be written to the "
            "manifest (the frontend cannot disambiguate them):\n  - "
            + "\n  - ".join(duplicates)
            + "\nRemove the superseded .bin(s) from firmware/configurations/ "
            "before regenerating."
        )


def validate_structured_config_consistency(artifacts: Sequence[FirmwareArtifact]) -> None:
    mismatches: List[str] = []
    for artifact in artifacts:
        meta = artifact.metadata
        if not meta.is_configuration or not meta.config_string:
            continue
        tokens = [token for token in meta.config_string.split("-") if token]
        token_set = {token.upper() for token in tokens}
        required_power_tokens = token_set.intersection(EXACT_POWER_TOKENS)
        if required_power_tokens and meta.power is None:
            mismatches.append(
                f"{artifact.path.name}: config_string includes {sorted(required_power_tokens)} but power is null"
            )
            continue
        if meta.power is not None and meta.power.upper() in EXACT_POWER_TOKENS and meta.power.upper() not in token_set:
            mismatches.append(
                f"{artifact.path.name}: power='{meta.power}' not present in config_string='{meta.config_string}'"
            )
    if mismatches:
        joined = "\n  - "+"\n  - ".join(mismatches)
        raise SystemExit(
            "Structured metadata/config_string mismatch detected:" + joined
        )


# Minimum firmware size below which we suspect a placeholder / corrupted binary.
# 100 KB chosen because real ESP32-S3 application partitions are ~500 KB+; anything
# smaller than this is almost certainly a stub. The repo currently ships some 18-byte
# placeholder binaries, so this threshold is enforced as a warning by default and
# only fails the build when --strict-validate is passed.
DEFAULT_MIN_FIRMWARE_SIZE_BYTES = 100 * 1024

# Sentinel size for the placeholder stubs already committed (18-byte files). Anything
# at or below this is treated as "intentional placeholder" rather than a suspicious
# size. Production firmware will not produce values this low.
#
# Production-mode policy: a placeholder-sized binary is fixture data, not
# real firmware. `validate_manifest_metadata` rejects placeholder stable /
# rescue / application firmware in production mode so the publish pipeline
# cannot ship a manifest entry whose `.bin` is just the committed stub.
# Development / test mode (or `artifact_type=test_fixture`) tolerate
# placeholders so unit fixtures keep working.
PLACEHOLDER_FIRMWARE_SIZE_BYTES = 64

# Known placeholder payloads that the committed fixture binaries use. The
# 18-byte stubs in `firmware/configurations/` contain the literal bytes
# `Binary placeholder`; we keep the list here so the production gate can
# reject "real-sized" binaries that still happen to be a placeholder
# masquerading as firmware (e.g. a fixture padded out to a plausible size).
KNOWN_PLACEHOLDER_PAYLOADS: Tuple[bytes, ...] = (
    b"Binary placeholder",
)


def _file_bytes_look_like_placeholder(path: Path, file_size: int) -> bool:
    """Return True when the file at ``path`` is one of the known
    placeholder fixtures.

    A binary is considered a placeholder when:
      * its size is <= PLACEHOLDER_FIRMWARE_SIZE_BYTES *and* its full
        contents match one of ``KNOWN_PLACEHOLDER_PAYLOADS``, OR
      * its first ``len(payload)`` bytes equal one of the known payloads
        (covers placeholders padded out to a larger size).
    """

    if not path.exists():
        return False
    try:
        if file_size <= PLACEHOLDER_FIRMWARE_SIZE_BYTES:
            data = path.read_bytes()
            for payload in KNOWN_PLACEHOLDER_PAYLOADS:
                if data == payload:
                    return True
                # Tolerate trailing newline / whitespace so a placeholder
                # written with `echo` still trips the check.
                if data.strip() == payload.strip():
                    return True
            return False
        # File is larger than the sentinel; sniff the first 64 bytes only.
        # Reading more would defeat the streaming-friendly compute_digests
        # path elsewhere in this script.
        with path.open("rb") as handle:
            head = handle.read(max((len(p) for p in KNOWN_PLACEHOLDER_PAYLOADS), default=0))
        for payload in KNOWN_PLACEHOLDER_PAYLOADS:
            if head.startswith(payload):
                return True
    except OSError:
        return False
    return False

# Mirrors SYNTH_CHANGELOG_PATTERN in scripts/utils/firmware-provenance.js. Used to
# defensively detect changelogs that look like an old auto-synthesised line so
# they are not silently accepted as human-authored content.
_SYNTH_CHANGELOG_RE = re.compile(
    r"^(?:stable|general|preview|beta|dev|rescue)\s+build\s+of\s+sense360\s+.+\s+v\d+(?:\.\d+)*\.?$",
    re.IGNORECASE,
)


def _changelog_looks_synthesised(changelog: Sequence[Any]) -> bool:
    """Return True when the changelog has exactly one entry and it matches the
    historical auto-synth template. Multi-entry changelogs that include a
    synth-style line plus real notes are not flagged."""

    if not isinstance(changelog, list) or len(changelog) != 1:
        return False
    entry = changelog[0]
    if not isinstance(entry, str):
        return False
    return bool(_SYNTH_CHANGELOG_RE.match(entry.strip()))


def validate_manifest_metadata(
    artifacts: Sequence[FirmwareArtifact],
    *,
    min_firmware_size: int = DEFAULT_MIN_FIRMWARE_SIZE_BYTES,
    mode: str = "production",
    strict: bool = False,
    informational_findings: Optional[List[str]] = None,
    repo_root: Optional[Path] = None,
) -> List[str]:
    """Run trust-signal checks across the generated manifest entries.

    Findings are returned as a list of human-readable strings. When ``strict``
    is set (or ``mode == 'production'``), the caller should treat a non-empty
    list as a build failure; otherwise they're informational warnings printed
    to stderr.

    Modes:
      * ``production`` — the public-default. ANY weak provenance is a finding:
        missing critical primitives, mutable source_url, deprecated builds
        without a deprecation_reason, dev/test channels, sidecar boilerplate.
      * ``development`` — relaxes channel and source-URL strictness for bench
        builds, but still demands every critical primitive.
      * ``test`` — also tolerates test fixtures (artifact_type=test_fixture).
    """

    if mode not in VALIDATION_MODES:
        raise ValueError(
            f"Unknown validation mode {mode!r}; expected one of {VALIDATION_MODES}"
        )

    findings: List[str] = []
    is_production = mode == "production"

    # Pre-load the trust list once so per-artifact key-status checks don't
    # hit the disk N times. When called without a repo_root (e.g. from a
    # test) we fall back to skipping the trust-status check; the caller
    # signing path is the primary enforcement surface anyway.
    trusted_keys_by_kid: Dict[str, Dict[str, Any]] = {}
    if repo_root is not None:
        trusted_path = repo_root / TRUSTED_KEYS_RELATIVE_PATH
        if trusted_path.exists():
            try:
                trusted_data = json.loads(trusted_path.read_text(encoding="utf-8"))
                for entry in trusted_data.get("keys", []):
                    if isinstance(entry, dict) and entry.get("kid"):
                        trusted_keys_by_kid[entry["kid"]] = entry
            except (OSError, ValueError):
                # If the trust list is broken, the lookup_trusted_key path
                # already surfaces a hard error during the signing step;
                # don't double-report here.
                pass

    for artifact in artifacts:
        meta = artifact.metadata
        name = artifact.path.name
        channel = canonical_channel(meta.channel, DEFAULT_CHANNEL)

        # ---- (a) description / module / config-string drift -----------------
        if meta.is_configuration and meta.config_string and meta.channel != "rescue":
            description = (meta.description or "").lower()
            if description and meta.config_string.lower() not in description:
                findings.append(
                    f"{name}: description does not reference config_string "
                    f"'{meta.config_string}' (got: {meta.description!r})."
                )
        if meta.is_configuration and meta.modules and meta.config_string:
            cs_lower = meta.config_string.lower()
            stray = [m for m in meta.modules if m.lower() not in cs_lower]
            if stray:
                findings.append(
                    f"{name}: modules {stray} not present in config_string "
                    f"'{meta.config_string}'."
                )

        # ---- (b) channel allowed for mode -----------------------------------
        if is_production and channel in DEVELOPMENT_ONLY_CHANNELS:
            findings.append(
                f"{name}: channel '{meta.channel}' is only allowed in "
                "development/test mode and must not appear in a production "
                "manifest. Move the binary outside firmware/configurations or "
                "regenerate with --mode development."
            )

        # ---- (c) critical metadata primitives ------------------------------
        # These are blocking for any remotely flashable firmware. Test
        # fixtures (artifact_type=test_fixture) running in test/development
        # mode are exempt from file_size only.
        artifact_type = (meta.artifact_type or "application").lower()
        is_test_fixture = artifact_type == "test_fixture"

        if not artifact.sha256:
            findings.append(f"{name}: missing sha256.")
        if not artifact.signature:
            findings.append(f"{name}: missing signature metadata.")
        if not artifact.signature_ed25519:
            findings.append(
                f"{name}: missing signature_ed25519 (real cryptographic "
                "signature). Run gen-manifests.py with a signing key (see "
                "firmware-signing/README.md) — production firmware must be "
                "authenticatable against a pinned trust anchor."
            )
        elif not artifact.signature_key_id:
            findings.append(
                f"{name}: signature_ed25519 is present but signature_key_id "
                "is empty; the wizard cannot resolve which trusted key to "
                "verify against."
            )
        elif is_production and channel in {"stable", "rescue"}:
            # Stable/rescue builds in production mode MUST be signed by an
            # 'active' trust-list key, not a 'test_only' fixture key. The
            # wizard's install gate enforces the same rule at runtime; the
            # check here stops a publish run from emitting a manifest the
            # wizard would later refuse for every user.
            trust_entry = trusted_keys_by_kid.get(artifact.signature_key_id)
            if trust_entry is None:
                findings.append(
                    f"{name}: signature_key_id={artifact.signature_key_id!r} "
                    f"is not present in {TRUSTED_KEYS_RELATIVE_PATH}; the "
                    "wizard would refuse this build because the key cannot "
                    "be resolved."
                )
            elif trust_entry.get("status") == "test_only":
                findings.append(
                    f"{name}: signature_key_id={artifact.signature_key_id!r} "
                    "is marked 'test_only' (its private half is exposed in "
                    "the public repo). Production stable/rescue firmware "
                    "MUST be signed by an 'active' key whose private half "
                    "lives only in CI secrets. See firmware-signing/README.md."
                )
            elif trust_entry.get("status") not in {"active"}:
                findings.append(
                    f"{name}: signature_key_id={artifact.signature_key_id!r} "
                    f"has status {trust_entry.get('status')!r}; only "
                    "'active' keys may sign production stable/rescue firmware."
                )
        if not artifact.source_commit:
            findings.append(
                f"{name}: missing source_commit. Set WEBFLASH_SOURCE_COMMIT or "
                "run inside a git checkout so manifest entries are traceable "
                "to a specific tree."
            )
        if not artifact.file_size and not (is_test_fixture and not is_production):
            findings.append(f"{name}: missing file_size.")

        # ---- (d) firmware path + artifact identity --------------------------
        if not artifact.relative_path:
            findings.append(f"{name}: missing firmware path.")
        if meta.is_configuration:
            if not (meta.config_string and meta.config_string.strip()):
                findings.append(f"{name}: missing artifact identity (config_string).")
        else:
            if not (meta.model and meta.model.strip()):
                findings.append(f"{name}: missing artifact identity (model).")

        # ---- (e) source URL immutability -----------------------------------
        if artifact.source_url:
            if _is_mutable_source_url(artifact.source_url):
                msg = (
                    f"{name}: source_url '{artifact.source_url}' references a "
                    "mutable branch/tag (e.g. /tree/main, /releases/latest); "
                    "pin to a commit SHA."
                )
                if is_production:
                    findings.append(msg)
                else:
                    print(f"[warn] {msg}", file=sys.stderr)
            elif (artifact.source_commit
                  and not _source_url_matches_commit(
                      artifact.source_url, artifact.source_commit)):
                msg = (
                    f"{name}: source_url '{artifact.source_url}' does not "
                    f"contain source_commit ({artifact.source_commit[:12]}…)."
                )
                if is_production:
                    findings.append(msg)
                else:
                    print(f"[warn] {msg}", file=sys.stderr)

        # ---- (f) file_size sanity (artifact-type-aware in production) -------
        if not is_test_fixture:
            if PLACEHOLDER_FIRMWARE_SIZE_BYTES < artifact.file_size < min_firmware_size:
                findings.append(
                    f"{name}: file_size={artifact.file_size} bytes is below the "
                    f"plausible-firmware threshold ({min_firmware_size} bytes). "
                    "Verify this isn't a truncated build."
                )
            # Production-mode placeholder rejection. The committed stub
            # binaries (18-byte "Binary placeholder" files) MUST NOT ship
            # in a production manifest; they are fixture data, not real
            # firmware. Two checks compose:
            #   * file_size at or below the sentinel — clearly a stub.
            #   * file content matches a known placeholder payload — covers
            #     stubs that were padded out to a plausible size, so an
            #     attacker cannot smuggle a placeholder past the size gate
            #     just by appending zeros.
            # Only stable / rescue (the user-facing install channels) are
            # affected; preview/beta/dev placeholders continue to be tolerated
            # so internal fixtures keep working.
            if is_production and channel in {"stable", "rescue"}:
                if 0 < artifact.file_size <= PLACEHOLDER_FIRMWARE_SIZE_BYTES:
                    findings.append(
                        f"Production stable firmware cannot use placeholder "
                        f"binary: {name} (file_size={artifact.file_size} bytes "
                        f"is at or below the placeholder sentinel "
                        f"{PLACEHOLDER_FIRMWARE_SIZE_BYTES}). Publish a real "
                        f"signed firmware binary for this configuration."
                    )
                elif _file_bytes_look_like_placeholder(
                    artifact.path, artifact.file_size
                ):
                    findings.append(
                        f"Production stable firmware cannot use placeholder "
                        f"binary: {name} (file content matches a known "
                        f"placeholder payload). Publish a real signed firmware "
                        f"binary for this configuration."
                    )
        elif is_production:
            findings.append(
                f"{name}: artifact_type=test_fixture must not appear in a "
                "production manifest."
            )

        # ---- (g) stable channel changelog rules ----------------------------
        # The features/hardware-requirements check is a CONTENT SUGGESTION,
        # not a provenance correctness failure. Surface it as an
        # informational warning so production mode does not fail the build
        # over a missing release-notes hint.
        if meta.channel == "stable" and meta.is_configuration:
            has_features = bool(meta.features)
            has_hardware = bool(meta.hardware_requirements)
            if not has_features and not has_hardware:
                msg = (
                    f"{name}: stable build has no features and no hardware_requirements; "
                    "consider adding a release-notes .md so users get context."
                )
                if informational_findings is not None:
                    informational_findings.append(msg)
                else:
                    print(f"[info] {msg}", file=sys.stderr)
        if meta.channel == "stable":
            if not meta.changelog:
                findings.append(
                    f"{name}: stable build has no changelog. Add one via a "
                    "`*.meta.json` sidecar (`changelog: [\"...\"]`) or a release-notes "
                    "file — auto-generated changelogs are no longer accepted."
                )
            elif _changelog_looks_synthesised(meta.changelog):
                findings.append(
                    f"{name}: stable build changelog looks auto-generated "
                    f"({meta.changelog[0]!r}). Replace it with a human-authored "
                    "release note in the firmware sidecar."
                )
            elif _changelog_looks_filler(meta.changelog):
                findings.append(
                    f"{name}: stable build changelog only contains generic "
                    f"boilerplate ({meta.changelog!r}). Replace with substantive "
                    "release notes in the sidecar."
                )

        # ---- (h) deprecated builds without a deprecation_reason ------------
        if meta.deprecated and not (
            isinstance(meta.deprecation_reason, str)
            and meta.deprecation_reason.strip()
        ):
            findings.append(
                f"{name}: deprecated build is missing deprecation_reason. "
                "Add `deprecation_reason` to the sidecar so users learn why "
                "the build is being kept around."
            )

        # ---- (i) known_issues must be a list when present ------------------
        if meta.known_issues is not None and not isinstance(meta.known_issues, list):
            findings.append(
                f"{name}: known_issues must be an array; got {type(meta.known_issues).__name__}."
            )

    return findings


def validate_no_placeholder_descriptions(artifacts: Sequence[FirmwareArtifact]) -> List[str]:
    """Soft check: catch obvious description/config drift like the historical
    'AirIQPro described as a minimal configuration with no expansion modules'.
    Returns findings (never raises)."""

    findings: List[str] = []
    minimal_phrases = ("no expansion modules", "minimal configuration", "no modules")
    for artifact in artifacts:
        meta = artifact.metadata
        if not meta.is_configuration or not meta.modules or not meta.description:
            continue
        desc_lower = meta.description.lower()
        for phrase in minimal_phrases:
            if phrase in desc_lower:
                findings.append(
                    f"{artifact.path.name}: description claims '{phrase}' but build "
                    f"has modules {meta.modules}."
                )
                break
    return findings


def write_json_file(path: Path, data: Dict[str, object], *, dry_run: bool) -> None:
    if dry_run:
        print(f"[dry-run] Would write {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def prune_stale_individual_manifests(
    base_dir: Path,
    prefix_name: str,
    build_count: int,
    *,
    dry_run: bool = False,
) -> List[Path]:
    """Delete numbered per-build manifests whose index is >= ``build_count``.

    ``write_individual_manifests`` writes exactly ``<prefix>0.json`` …
    ``<prefix>(build_count - 1).json`` for the current build set. A release
    that *shrinks* the build set must also drop the higher-numbered files it no
    longer writes; otherwise they survive as orphans (for example, going from
    15 to 14 builds leaves ``firmware-14.json`` behind, which then fails the
    manifest-health and github-pages-surface guards).

    Enumerate every ``<prefix><int>.json`` in ``base_dir`` and remove any whose
    index is out of range for the current build count. Files that merely share
    the prefix but are not a pure ``<prefix><int>.json`` (e.g.
    ``firmware-14-backup.json``) are left untouched. Returns the paths pruned
    (the paths that *would* be pruned in ``dry_run`` mode). Idempotent and a
    no-op when there is nothing to prune.
    """

    pruned: List[Path] = []
    if build_count < 0 or not base_dir.exists():
        return pruned
    index_pattern = re.compile(rf"^{re.escape(prefix_name)}(\d+)\.json$")
    for path in sorted(base_dir.glob(f"{prefix_name}[0-9]*.json")):
        match = index_pattern.match(path.name)
        if match is None:
            continue
        if int(match.group(1)) < build_count:
            continue
        pruned.append(path)
        if dry_run:
            print(f"[dry-run] Would prune stale per-build manifest {path}")
        else:
            path.unlink()
            print(f"Pruned stale per-build manifest {path}")
    return pruned


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
        part_entry: Dict[str, object] = {
            "path": artifact.relative_path,
            "offset": 0,
            "md5": artifact.md5,
            "sha256": artifact.sha256,
            "signature": artifact.signature,
        }
        if artifact.signature_ed25519:
            part_entry["signature_ed25519"] = artifact.signature_ed25519
            part_entry["signature_key_id"] = artifact.signature_key_id

        data = {
            "name": "Sense360 ESP32 Firmware - Core Module",
            "version": artifact.metadata.version,
            "home_assistant_domain": "esphome",
            "funding_url": "https://sense360store.com/support",
            "new_install_prompt_erase": True,
            "new_install_improv_wait_time": (
                IMPROV_WAIT_TIME_SECONDS if artifact.metadata.improv else 0
            ),
            "builds": [
                {
                    "chipFamily": artifact.chip_family,
                    "parts": [part_entry],
                    "improv": artifact.metadata.improv,
                    "md5": artifact.md5,
                    "sha256": artifact.sha256,
                    "signature": artifact.signature,
                    "signature_ed25519": artifact.signature_ed25519,
                    "signature_key_id": artifact.signature_key_id,
                    "file_size": artifact.file_size,
                    "source_commit": artifact.source_commit,
                    "source_url": artifact.source_url,
                    "deprecated": bool(artifact.metadata.deprecated),
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
    # A release that shrinks the build set must also remove the higher-numbered
    # per-build manifests it no longer writes. The pre-write cleanup above
    # clears matched files before a full run, but this explicit index-based
    # pass pins the on-disk firmware-N.json namespace to the current build
    # count regardless of how the directory got into its current state, so a
    # smaller release never leaves an orphan behind.
    prune_stale_individual_manifests(
        base_dir, prefix_name, len(artifacts), dry_run=dry_run
    )


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
                meta.effective_channel,
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
    parser.add_argument(
        "--strict-validate",
        action="store_true",
        help=(
            "Alias for --mode=production. Promotes any provenance finding "
            "(missing critical primitive, mutable source_url, sidecar "
            "boilerplate, deprecated without reason, dev/test channel) to a "
            "build failure."
        ),
    )
    parser.add_argument(
        "--mode",
        choices=list(VALIDATION_MODES),
        default=None,
        help=(
            "Validation mode. 'production' (the default) blocks on any weak "
            "provenance and is what CI should run. 'development' relaxes "
            "channel and source-URL strictness. 'test' additionally tolerates "
            "test_fixture artifacts. --strict-validate is an alias for "
            "--mode=production."
        ),
    )
    parser.add_argument(
        "--min-firmware-size",
        type=int,
        default=DEFAULT_MIN_FIRMWARE_SIZE_BYTES,
        help=(
            "Minimum plausible firmware size in bytes; smaller builds are flagged as "
            "suspicious. Default: %(default)s. Set to 0 to disable the size check."
        ),
    )
    parser.add_argument(
        "--source-commit",
        default=None,
        help=(
            "Override the source commit recorded for every build. Defaults to the "
            "WEBFLASH_SOURCE_COMMIT environment variable, then `git rev-parse HEAD`."
        ),
    )
    parser.add_argument(
        "--source-url-template",
        default=DEFAULT_SOURCE_URL_TEMPLATE,
        help=(
            "Format string used to build per-build source_url links. Must contain "
            "the substring '{commit}'. Set to an empty string to disable source URL "
            "generation. Default: %(default)s."
        ),
    )
    parser.add_argument(
        "--signing-key",
        default=None,
        help=(
            "Path to the Ed25519 private key used to sign each firmware binary. "
            "Accepts PEM PKCS#8 or a raw 32-byte seed encoded as base64 in a text "
            "file. When omitted, falls back to WEBFLASH_FIRMWARE_PRIVATE_KEY_B64, "
            "WEBFLASH_FIRMWARE_PRIVATE_KEY_PATH, then the committed dev key under "
            "firmware-signing/keys/."
        ),
    )
    parser.add_argument(
        "--signing-key-id",
        default=None,
        help=(
            "Stable identifier of the signing key (must match a 'kid' entry in "
            "firmware-signing/trusted-keys.json). When omitted, derived from the "
            "key file name or the WEBFLASH_FIRMWARE_KEY_ID env var."
        ),
    )
    parser.add_argument(
        "--no-sign",
        action="store_true",
        help=(
            "Skip Ed25519 firmware signing entirely. The resulting manifest will "
            "be REJECTED by the wizard's install gate. Use only for offline smoke "
            "tests; never for a production publish."
        ),
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    firmware_dir = (repo_root / args.firmware_dir).resolve()
    manifest_path = (repo_root / args.manifest_path).resolve()
    manifest_prefix = Path(args.manifest_prefix)
    source_commit = (args.source_commit or "").strip() or detect_source_commit(repo_root)
    if source_commit:
        print(f"Recording source_commit={source_commit} on every build entry.")
    else:
        print(
            "[warn] No source_commit detected; stable builds will fail provenance "
            "validation. Set WEBFLASH_SOURCE_COMMIT or pass --source-commit.",
            file=sys.stderr,
        )
    # --mode wins over --strict-validate; --strict-validate is the legacy
    # alias for --mode=production. If neither is set, default to
    # 'production' so a CI invocation cannot silently downgrade.
    if args.mode is not None:
        validation_mode = args.mode
    elif args.strict_validate:
        validation_mode = "production"
    else:
        validation_mode = "production"

    signing_key = None
    signing_key_id = None
    if args.no_sign:
        print(
            "[warn] --no-sign requested; manifest entries will lack a real "
            "Ed25519 signature and the wizard will refuse to install them.",
            file=sys.stderr,
        )
    else:
        signing_key, signing_key_id = load_signing_key(
            repo_root=repo_root,
            cli_path=args.signing_key,
        )
        if args.signing_key_id:
            signing_key_id = args.signing_key_id
        # Compute the matching public key and assert it is pinned in the
        # JSON trust list with an *acceptable* status for the active mode.
        # In production mode this rejects the committed dev key so the
        # publish pipeline cannot accidentally ship a manifest the wizard
        # would refuse to install for every user.
        try:
            from cryptography.hazmat.primitives import serialization as _serialization
        except ImportError as exc:  # pragma: no cover - cryptography is required when signing
            raise SystemExit(
                "The 'cryptography' package is required to sign firmware."
            ) from exc
        public_key_b64 = base64.b64encode(
            signing_key.public_key().public_bytes(
                encoding=_serialization.Encoding.Raw,
                format=_serialization.PublicFormat.Raw,
            )
        ).decode("ascii")
        trust_entry = assert_key_pinned_in_trust_list(
            repo_root, signing_key_id, public_key_b64, mode=validation_mode
        )
        print(
            f"Signing firmware with key id={signing_key_id} "
            f"status={trust_entry.get('status')!r} pub={public_key_b64[:12]}…. "
            f"Trusted-list match confirmed for mode={validation_mode!r}."
        )

    artifacts = collect_firmware(
        firmware_dir,
        repo_root,
        dry_run=args.dry_run,
        default_channel=DEFAULT_CHANNEL,
        source_commit=source_commit,
        source_url_template=args.source_url_template or "",
        signing_key=signing_key,
        signing_key_id=signing_key_id,
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
    validate_no_deprecated_modules(ordered)
    validate_no_duplicate_config_strings(ordered)
    validate_structured_config_consistency(ordered)
    # validation_mode was already resolved above (so it could gate the
    # signing key load). Reuse it here for the metadata findings sweep.
    informational_findings: List[str] = []
    metadata_findings = validate_manifest_metadata(
        ordered,
        min_firmware_size=args.min_firmware_size,
        mode=validation_mode,
        strict=args.strict_validate,
        informational_findings=informational_findings,
        repo_root=repo_root,
    )
    metadata_findings.extend(validate_no_placeholder_descriptions(ordered))
    if informational_findings:
        print(
            "Manifest metadata informational notes:\n  - "
            + "\n  - ".join(informational_findings),
            file=sys.stderr,
        )
    if metadata_findings:
        header = (
            f"Manifest metadata validation findings (mode={validation_mode}):"
        )
        body = "\n  - " + "\n  - ".join(metadata_findings)
        if validation_mode == "production":
            raise SystemExit(header + body)
        print(header + body, file=sys.stderr)
    manifest = build_manifest(ordered, source_commit=source_commit)
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
