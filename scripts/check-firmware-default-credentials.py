#!/usr/bin/env python3
"""WF-H1-IMPORT-GATE: refuse to import firmware carrying default credentials.

SECURITY-AUDIT-2026-06 (WebFlash) finding W-H1: the stable binaries WebFlash
serves were found to carry the fixed upstream default credential set (shared
OTA / web / fallback-AP passwords plus the placeholder API encryption key,
stored in flash as decoded 32-byte material). WebFlash flashes prebuilt
``.bin`` files as-is, so a defaulted binary on the installer is a remotely
controllable device. See ``docs/security/SECURITY-AUDIT-2026-06.md`` (W-H1)
for the finding; this module deliberately does not restate it.

Upstream ``sense360store/esphome-public#779`` (SEC-ESP-BUILD-GATES-001)
closed the producer half: its release pipeline scans every artifact against
this same denylist and ships unprovisioned binaries. This module is the
*downstream*, import-time half — an independent backstop so a defaulted
binary can never be staged into ``firmware/configurations/`` even if the
upstream gate were bypassed or the asset predates it. The denylist is kept
in lock-step with upstream ``scripts/check_firmware_default_credentials.py``.

The denylist values below are not secrets: every one of them is already
public (in upstream workflow history, in the public audits, or extractable
from previously published binaries). They exist here solely as scan needles.
New text elsewhere should reference them by credential-class name, not value.

The cross-repo importer (``scripts/import-firmware-sources.py``) calls
``scan_blob`` on every newly downloaded asset after checksum verification —
checksum-valid but credential-dirty assets are refused.

Exit codes (standalone CLI use):
  0  all scanned binaries are clean
  1  at least one binary matched a denylisted credential
  2  usage error / nothing to scan (fail closed: an empty artifact set must
     never pass the gate silently)

Usage::

    python3 scripts/check-firmware-default-credentials.py FILE [FILE ...]
    python3 scripts/check-firmware-default-credentials.py --dir firmware/configurations
"""

from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path
from typing import List, Tuple

# The all-'a' placeholder API encryption key (upstream secrets.example.yaml
# ships it so `esphome config` validates on a fresh checkout; it must never
# ship in a binary). ESPHome stores the key in flash as the DECODED 32-byte
# material, not the base64 literal, so BOTH forms are denylisted — matching
# only the printable literal would miss every real-world occurrence.
API_KEY_PLACEHOLDER_B64 = b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa="
API_KEY_PLACEHOLDER_RAW = base64.b64decode(API_KEY_PLACEHOLDER_B64)

# ---------------------------------------------------------------------------
# Denylist: (credential_class, needle_label, needle_bytes)
#
# credential_class matches the upstream secrets.yaml key the value belonged
# to. The four device-control credential classes — api_encryption_key,
# ota_password, web_password, fallback_ap_password — are NEVER excluded from
# this list. Case-sensitive exact byte search. Kept in lock-step with the
# upstream release gate (esphome-public scripts/
# check_firmware_default_credentials.py, merged as #779).
# ---------------------------------------------------------------------------
DENYLIST: Tuple[Tuple[str, str, bytes], ...] = (
    # --- api_encryption_key (native API control of the device) ---
    ("api_encryption_key", "placeholder key, base64 literal", API_KEY_PLACEHOLDER_B64),
    (
        "api_encryption_key",
        "placeholder key, decoded 32-byte material",
        API_KEY_PLACEHOLDER_RAW,
    ),
    # --- ota_password (persistent firmware overwrite) ---
    ("ota_password", "shipped release default", b"sense360-ota-default"),
    ("ota_password", "CI test-lane value", b"test-ota-password"),
    # --- web_password (web UI auth on :80) ---
    # web_username "admin" is intentionally NOT a standalone needle here: a
    # bare 5-byte generic token false-positives on legitimate binary content
    # (e.g. embedded web assets). It is flagged only IN COMBINATION with a
    # matched default web password — see scan_blob below.
    ("web_password", "shipped release default", b"sense360admin"),
    ("web_password", "CI test-lane value", b"test_web_password"),
    # --- fallback_ap_password (RF-range captive-portal access) ---
    ("fallback_ap_password", "shipped release default", b"sense360fallback"),
    ("fallback_ap_password", "CI test-lane value", b"fallback123"),
    # Upstream audit H2 forward half: two earlier fallback-AP literals are
    # readable in public git history forever and are permanently burned. They
    # must never be served by the installer either.
    (
        "fallback_ap_password",
        "burned historical literal (upstream audit H2)",
        b"Sense360Fallback",
    ),
    (
        "fallback_ap_password",
        "burned historical literal (upstream audit H2)",
        b"sense360poe",
    ),
    # --- wifi_ssid / wifi_password (CI test-lane values only; the
    # intentionally-public setup pair is excluded — see below) ---
    ("wifi_ssid", "CI test-lane value", b"TestNetwork"),
    ("wifi_password", "CI test-lane value", b"TestPassword123"),
)

# web_username default — flagged ONLY in combination with a matched default
# web_password (the actual secret material). Never a standalone needle.
WEB_USERNAME_DEFAULT = b"admin"

# ---------------------------------------------------------------------------
# Intentionally-public setup-network credentials — EXCLUDED from the denylist.
#
# Released firmware deliberately ships trying to join the fixed first-boot
# setup network (wifi_ssid "Sense360_Setup" / wifi_password "sense360setup")
# so a user can bring a fresh device online by creating a hotspot with that
# name. These two values are setup-only UX, are documented as public
# upstream, and grant no control over the device's API / OTA / web surfaces.
# ONLY these two values are excluded; the api/ota/web/fallback credential
# classes are never excluded.
# ---------------------------------------------------------------------------
INTENTIONALLY_PUBLIC_SETUP_CREDENTIALS: Tuple[bytes, ...] = (
    b"Sense360_Setup",
    b"sense360setup",
)

# Classes that must always be represented in DENYLIST (regression pin; the
# unit test asserts this too).
NEVER_EXCLUDED_CLASSES = (
    "api_encryption_key",
    "ota_password",
    "web_password",
    "fallback_ap_password",
)


def scan_blob(data: bytes) -> List[Tuple[str, str]]:
    """Return (credential_class, needle_label) for every denylist match.

    Adds a ``web_username`` finding only when the default username appears
    IN COMBINATION with a matched default web_password — a bare "admin"
    token alone never flags (it false-positives on legitimate binary
    content), and a default web password alone is already a finding in its
    own right.
    """

    matches = [
        (cred_class, label)
        for cred_class, label, needle in DENYLIST
        if needle in data
    ]
    if WEB_USERNAME_DEFAULT in data and any(
        cred_class == "web_password" for cred_class, _ in matches
    ):
        matches.append(
            (
                "web_username",
                "shipped release default (flagged only in combination "
                "with a default web_password)",
            )
        )
    return matches


def scan_files(paths: List[Path]) -> List[str]:
    """Scan binaries; return human-readable problems (empty when clean)."""
    problems: List[str] = []
    for path in paths:
        try:
            data = path.read_bytes()
        except OSError as exc:
            problems.append(f"{path}: cannot read artifact: {exc}")
            continue
        for cred_class, label in scan_blob(data):
            problems.append(
                f"{path}: contains a denylisted default credential — "
                f"class [{cred_class}] ({label})"
            )
    return problems


def collect_binaries(args_paths: List[str], directory: str | None) -> List[Path]:
    """Resolve positional paths plus --dir/*.bin into a file list."""
    paths: List[Path] = [Path(raw) for raw in args_paths]
    if directory is not None:
        paths.extend(sorted(Path(directory).glob("*.bin")))
    return paths


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Fail if any firmware binary carries a known default/placeholder "
            "credential (WF-H1-IMPORT-GATE; downstream half of "
            "esphome-public#779)."
        ),
    )
    parser.add_argument(
        "binaries",
        nargs="*",
        help="Firmware .bin file(s) to scan.",
    )
    parser.add_argument(
        "--dir",
        dest="directory",
        default=None,
        help="Also scan every *.bin directly inside this directory.",
    )
    args = parser.parse_args(argv)

    paths = collect_binaries(args.binaries, args.directory)

    if not paths:
        sys.stderr.write(
            "ERROR: no firmware binaries to scan (WF-H1-IMPORT-GATE fails "
            "closed: an empty artifact set must not pass the gate).\n"
        )
        return 2

    missing = [p for p in paths if not p.is_file()]
    if missing:
        for p in missing:
            sys.stderr.write(f"ERROR: artifact does not exist: {p}\n")
        return 2

    problems = scan_files(paths)
    if problems:
        sys.stderr.write(
            "ERROR: default/placeholder credential material found "
            "(WF-H1-IMPORT-GATE / SECURITY-AUDIT-2026-06 W-H1):\n"
        )
        for problem in problems:
            sys.stderr.write(f"  - {problem}\n")
        sys.stderr.write(
            "A credential-dirty binary must never be imported or served by "
            "the installer. The upstream build needs the post-#779 release "
            "secret posture (no shared defaults) before import.\n"
        )
        return 1

    print(
        f"OK: {len(paths)} firmware binar{'y' if len(paths) == 1 else 'ies'} "
        f"scanned against {len(DENYLIST)} denylisted credential needles; "
        "no default/placeholder credential material found."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
