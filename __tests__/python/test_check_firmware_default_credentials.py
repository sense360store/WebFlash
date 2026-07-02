"""WF-H1-IMPORT-GATE regression guard for the default-credential import gate.

Locks in the behaviour of ``scripts/check-firmware-default-credentials.py``
and its wiring into ``scripts/import-firmware-sources.py`` (SECURITY-AUDIT-
2026-06 finding W-H1, downstream half; the upstream half is the
esphome-public#779 release gate):

  * a firmware binary containing ANY denylisted default / placeholder /
    burned credential byte-string is refused at import time, with the
    failure naming the source and the credential class;
  * the placeholder API encryption key is caught BOTH as the base64 literal
    and as its decoded 32-byte key material (the form ESPHome stores in
    flash — 0x69-leading bytes, not the printable literal);
  * a clean binary imports exactly as before;
  * the intentionally-public setup-network pair is excluded — and ONLY that
    pair; the api/ota/web/fallback classes are never excluded;
  * the default web username flags only IN COMBINATION with a default web
    password, never on its own;
  * checksum-valid but credential-dirty is rejected, and nothing is staged;
  * the already-staged skip path does NOT re-scan (the published pre-#779
    binaries stay until their tracked clean rebuild + re-import), while any
    genuine re-import of the same bytes takes the full path and is refused.

All fixtures are built in-test; no real firmware binary is committed.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
GATE_SCRIPT = SCRIPTS_DIR / "check-firmware-default-credentials.py"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Load gen_manifests + sync_releases first so the importer reuses the same
# module instances (matches how the script loads them at runtime).
_load_module("gen_manifests", SCRIPTS_DIR / "gen-manifests.py")
_load_module("sync_releases", SCRIPTS_DIR / "sync-from-releases.py")
importer = _load_module(
    "import_firmware_sources", SCRIPTS_DIR / "import-firmware-sources.py"
)
gate = importer.credential_gate

ImportValidationError = importer.ImportValidationError

API_KEY_LITERAL = b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa="


# ---- Fixtures -------------------------------------------------------------


VALID_BODY = """\
## Changelog

- First production stable release for Ceiling-POE-VentIQ-RoomIQ.
- Adds VentIQ bathroom air-quality sensing and RoomIQ presence/comfort sensing.

## Known Issues

- None.

## Features

- PoE-powered Sense360 Core with VentIQ and RoomIQ modules.

## Hardware Requirements

- Sense360 Core (S360-100 R4 or newer).
- Sense360 VentIQ (S360-211 R4).
- Sense360 RoomIQ (S360-200 R4).
"""

ASSET = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"


def _make_bin(size: int = 200_000) -> bytes:
    # Deterministic non-zero bytes so SHA256 is stable across runs. The
    # filler contains no denylisted needle (asserted by the clean-path test).
    return (b"sense360-firmware-test-fixture\n" * 8000)[:size]


def _splice(needle: bytes) -> bytes:
    """A valid-sized synthetic firmware blob with `needle` mid-payload."""
    clean = _make_bin()
    return clean[:1000] + needle + clean[1000:]


def _entry(**overrides: Any) -> Dict[str, Any]:
    base = {
        "source_repo": "sense360store/esphome-public",
        "release_tag": "v1.0.0",
        "release_url": "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0",
        "version": "1.0.0",
        "channel": "stable",
        "config_string": "Ceiling-POE-VentIQ-RoomIQ",
        "asset_name": ASSET,
        "min_size_bytes": 102_400,
        "required_assets": [
            ASSET,
            "checksums-sha256.txt",
            "checksums-md5.txt",
            "manifest.json",
        ],
        "required_release_body_sections": [
            "Changelog",
            "Known Issues",
            "Features",
            "Hardware Requirements",
        ],
        "block_tokens": ["FanTRIAC", "LED"],
    }
    base.update(overrides)
    return base


class _FakeNetwork:
    """Stand-in for fetch_release_metadata + download_to_path."""

    def __init__(self, release: Dict[str, Any], asset_bytes: Dict[str, bytes]):
        self.release = release
        self.asset_bytes = asset_bytes
        self.calls: List[str] = []

    def fetch_release_metadata(self, *_args, **_kwargs):
        self.calls.append("fetch_release_metadata")
        return self.release

    def download_to_path(self, url: str, dest: Path, _token):
        self.calls.append(f"download:{url}")
        name = url.rsplit("/", 1)[-1]
        if name not in self.asset_bytes:
            raise importer.ImportValidationError(
                f"Test fixture has no bytes for asset '{name}'."
            )
        dest.write_bytes(self.asset_bytes[name])


def _build_network(bin_bytes: bytes, *, asset_name: str = ASSET) -> _FakeNetwork:
    # The checksum manifest always matches the (possibly dirty) bytes, so a
    # rejection in these tests can only come from the credential scan —
    # exactly the "checksum-valid but credential-dirty" case W-H1 calls out.
    sha_hex = hashlib.sha256(bin_bytes).hexdigest()
    asset_bytes = {
        asset_name: bin_bytes,
        "checksums-sha256.txt": f"{sha_hex}  {asset_name}\n".encode("utf-8"),
        "checksums-md5.txt": b"placeholder\n",
        "manifest.json": json.dumps(
            {
                "name": "Sense360 ESPhome public build",
                "version": "1.0.0",
                "source_commit": "abc123def456",
                "esphome_version": "2025.10.1",
            }
        ).encode("utf-8"),
    }
    assets = [
        {
            "name": name,
            "url": f"https://api.github.example/{name}",
            "browser_download_url": f"https://download.example/{name}",
        }
        for name in asset_bytes
    ]
    release = {
        "html_url": "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0",
        "body": VALID_BODY,
        "assets": assets,
    }
    return _FakeNetwork(release, asset_bytes)


def _run_import(
    entry: Dict[str, Any],
    network: _FakeNetwork,
    *,
    dry_run: bool = False,
    repo_root: Optional[Path] = None,
) -> Path:
    with mock.patch.object(
        importer, "fetch_release_metadata", side_effect=network.fetch_release_metadata
    ), mock.patch.object(
        importer, "download_to_path", side_effect=network.download_to_path
    ):
        return importer.import_source_entry(
            entry,
            repo_root=repo_root or REPO_ROOT,
            token=None,
            dry_run=dry_run,
            imported_at="2026-06-10T00:00:00+00:00",
            # These tests exercise the default-credential gate with a pinless
            # _entry(); opt out of the fail-closed pin requirement so they hit
            # the credential gate rather than the missing-pin gate.
            require_pin=False,
        )


# ---- Denylist contract ----------------------------------------------------


class DenylistContractTests(unittest.TestCase):
    """The shape of the denylist itself is part of the security contract."""

    def test_four_device_control_classes_are_always_present(self) -> None:
        classes = {entry[0] for entry in gate.DENYLIST}
        for required in (
            "api_encryption_key",
            "ota_password",
            "web_password",
            "fallback_ap_password",
        ):
            self.assertIn(required, classes)
        self.assertEqual(
            set(gate.NEVER_EXCLUDED_CLASSES),
            {
                "api_encryption_key",
                "ota_password",
                "web_password",
                "fallback_ap_password",
            },
        )

    def test_api_key_denied_as_literal_and_decoded_material(self) -> None:
        # The decoded-key matcher must be the REAL base64-decoded bytes, not
        # the printable literal: 32 bytes, leading 0x69 ('a'*43+'=' decodes
        # to the 0x69 0xa6 0x9a pattern), nothing like the 0x61 ASCII 'a'.
        needles = {n for c, _, n in gate.DENYLIST if c == "api_encryption_key"}
        self.assertIn(API_KEY_LITERAL, needles)
        decoded = base64.b64decode(API_KEY_LITERAL)
        self.assertEqual(len(decoded), 32)
        self.assertEqual(decoded[0], 0x69)
        self.assertNotEqual(decoded, b"a" * 32)
        self.assertIn(decoded, needles)
        self.assertEqual(gate.API_KEY_PLACEHOLDER_RAW, decoded)

    def test_shipped_release_defaults_are_denied_by_class(self) -> None:
        # The W-H1 evidence set, by credential class.
        by_class = {}
        for cred_class, _, needle in gate.DENYLIST:
            by_class.setdefault(cred_class, set()).add(needle)
        self.assertIn(b"sense360-ota-default", by_class["ota_password"])
        self.assertIn(b"sense360admin", by_class["web_password"])
        self.assertIn(b"sense360fallback", by_class["fallback_ap_password"])

    def test_setup_network_credentials_are_excluded_and_only_those(self) -> None:
        # The intentionally-public setup-only WiFi pair is documented and
        # excluded. Nothing else from the shipped credential set may be.
        self.assertEqual(
            set(gate.INTENTIONALLY_PUBLIC_SETUP_CREDENTIALS),
            {b"Sense360_Setup", b"sense360setup"},
        )
        denylisted = {n for _, _, n in gate.DENYLIST}
        for excluded in gate.INTENTIONALLY_PUBLIC_SETUP_CREDENTIALS:
            self.assertNotIn(excluded, denylisted)

    def test_bare_admin_username_is_not_a_standalone_needle(self) -> None:
        self.assertNotIn(b"admin", {n for _, _, n in gate.DENYLIST})


# ---- scan_blob ------------------------------------------------------------


class ScanBlobTests(unittest.TestCase):
    def test_every_denylisted_needle_flags_a_dirty_blob(self) -> None:
        for cred_class, label, needle in gate.DENYLIST:
            with self.subTest(cred_class=cred_class, label=label):
                matches = gate.scan_blob(_splice(needle))
                self.assertIn((cred_class, label), matches)

    def test_clean_blob_passes(self) -> None:
        self.assertEqual(gate.scan_blob(_make_bin()), [])

    def test_decoded_api_key_material_flags_without_the_literal(self) -> None:
        blob = _splice(gate.API_KEY_PLACEHOLDER_RAW)
        self.assertNotIn(API_KEY_LITERAL, blob)
        classes = {c for c, _ in gate.scan_blob(blob)}
        self.assertIn("api_encryption_key", classes)

    def test_setup_pair_is_not_flagged(self) -> None:
        blob = _splice(b"Sense360_Setup\x00sense360setup")
        self.assertEqual(gate.scan_blob(blob), [])

    def test_bare_admin_alone_is_not_flagged(self) -> None:
        # Neutral filler on purpose: splicing into the standard fixture text
        # would place "admin" right after its "sense360" run and form the
        # real default web password by accident.
        blob = b"\xff" * 2048 + b"admin" + b"\xff" * 2048
        self.assertEqual(gate.scan_blob(blob), [])

    def test_admin_flags_in_combination_with_default_web_password(self) -> None:
        # "sense360admin" contains the username token, so the default web
        # login pair is reported as both classes.
        classes = {c for c, _ in gate.scan_blob(_splice(b"sense360admin"))}
        self.assertIn("web_password", classes)
        self.assertIn("web_username", classes)

    def test_web_password_without_admin_does_not_add_username_finding(self) -> None:
        # The CI test-lane web password has no "admin" substring; the
        # combination rule must not fire without the username bytes.
        classes = {c for c, _ in gate.scan_blob(_splice(b"test_web_password"))}
        self.assertIn("web_password", classes)
        self.assertNotIn("web_username", classes)


# ---- Importer integration -------------------------------------------------


class ImporterCredentialGateTests(unittest.TestCase):
    """The gate is wired into import_source_entry after checksum verification."""

    def _import_into_tmp(self, bin_bytes: bytes, **entry_overrides: Any):
        net = _build_network(bin_bytes)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        tmp_root = Path(tmp.name)
        (tmp_root / "firmware").mkdir()
        return _run_import(_entry(**entry_overrides), net, repo_root=tmp_root), tmp_root

    def test_checksum_valid_but_credential_dirty_import_is_refused(self) -> None:
        dirty = _splice(b"sense360-ota-default")
        net = _build_network(dirty)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            with self.assertRaises(ImportValidationError) as ctx:
                _run_import(_entry(), net, repo_root=tmp_root)
            msg = str(ctx.exception)
            # Names the source and the matched credential class.
            self.assertIn(ASSET, msg)
            self.assertIn("sense360store/esphome-public@v1.0.0", msg)
            self.assertIn("[ota_password]", msg)
            # Neither the .bin nor its sidecar was staged.
            configurations = tmp_root / "firmware" / "configurations"
            staged = list(configurations.glob("*")) if configurations.exists() else []
            self.assertEqual(staged, [])

    def test_clean_import_still_passes(self) -> None:
        clean = _make_bin()
        target, _tmp_root = self._import_into_tmp(clean)
        self.assertTrue(target.exists())
        self.assertEqual(target.read_bytes(), clean)
        self.assertTrue(target.with_suffix(".meta.json").exists())

    def test_decoded_api_key_material_is_refused_without_the_literal(self) -> None:
        dirty = _splice(gate.API_KEY_PLACEHOLDER_RAW)
        self.assertNotIn(API_KEY_LITERAL, dirty)
        net = _build_network(dirty)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            with self.assertRaises(ImportValidationError) as ctx:
                _run_import(_entry(), net, repo_root=tmp_root)
            self.assertIn("[api_encryption_key]", str(ctx.exception))
            self.assertIn("decoded 32-byte material", str(ctx.exception))

    def test_setup_pair_does_not_block_import(self) -> None:
        # Released firmware legitimately carries the intentionally-public
        # setup-network SSID/password; the import gate must not flag them.
        target, _tmp_root = self._import_into_tmp(
            _splice(b"Sense360_Setup\x00sense360setup")
        )
        self.assertTrue(target.exists())

    def test_dirty_asset_fails_even_in_dry_run(self) -> None:
        dirty = _splice(b"sense360fallback")
        net = _build_network(dirty)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            with self.assertRaises(ImportValidationError) as ctx:
                _run_import(_entry(), net, repo_root=tmp_root, dry_run=True)
            self.assertIn("[fallback_ap_password]", str(ctx.exception))

    def test_staged_pinned_assets_are_not_rescanned(self) -> None:
        # The W-H1 consequence decision, pinned: the binaries already
        # published predate the upstream #779 fix and WOULD be flagged by
        # this scanner — but a routine import re-run must not tear them out.
        # The already-staged skip path (pin-matching bytes + sidecar) skips
        # the scan along with the network fetch; only NEW imports are gated.
        dirty = _splice(b"sense360-ota-default")
        net = _build_network(dirty)
        entry = _entry(expected_sha256=hashlib.sha256(dirty).hexdigest())
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            configurations = tmp_root / "firmware" / "configurations"
            configurations.mkdir(parents=True)
            staged = configurations / ASSET
            staged.write_bytes(dirty)
            staged.with_suffix(".meta.json").write_text("{}", encoding="utf-8")
            target = _run_import(entry, net, repo_root=tmp_root)
            self.assertEqual(target, staged)
            self.assertTrue(staged.exists())
            self.assertEqual(net.calls, [])

    def test_reimport_of_dirty_bytes_via_full_path_is_refused(self) -> None:
        # Companion to the skip test: once the staged copy is gone (or the
        # pin changes), the same pre-#779 bytes must take the full path and
        # be refused — re-importing the published defaults is blocked until
        # the upstream rebuild ships clean binaries.
        dirty = _splice(b"sense360-ota-default")
        net = _build_network(dirty)
        entry = _entry(expected_sha256=hashlib.sha256(dirty).hexdigest())
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            (tmp_root / "firmware").mkdir()
            with self.assertRaises(ImportValidationError) as ctx:
                _run_import(entry, net, repo_root=tmp_root)
            self.assertIn("[ota_password]", str(ctx.exception))
            self.assertGreater(len(net.calls), 0)


# ---- Standalone CLI -------------------------------------------------------


class CommandLineTests(unittest.TestCase):
    """The scanner is also runnable standalone over an artifact set."""

    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)

    def _write(self, name: str, data: bytes) -> Path:
        path = self.tmp / name
        path.write_bytes(data)
        return path

    def _run_main(self, argv: List[str]) -> tuple:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = gate.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_dirty_binary_exits_1_naming_artifact_and_class(self) -> None:
        path = self._write("dirty.bin", _splice(b"sense360admin"))
        code, _, err = self._run_main([str(path)])
        self.assertEqual(code, 1)
        self.assertIn("dirty.bin", err)
        self.assertIn("[web_password]", err)
        self.assertIn("[web_username]", err)

    def test_clean_binary_exits_0(self) -> None:
        path = self._write("clean.bin", _make_bin())
        code, out, err = self._run_main([str(path)])
        self.assertEqual(code, 0, err)
        self.assertIn("no default/placeholder credential material", out)

    def test_empty_artifact_set_fails_closed(self) -> None:
        empty = self.tmp / "empty"
        empty.mkdir()
        code, _, err = self._run_main(["--dir", str(empty)])
        self.assertEqual(code, 2)
        self.assertIn("fails closed", err)

    def test_missing_artifact_fails(self) -> None:
        code, _, err = self._run_main([str(self.tmp / "nope.bin")])
        self.assertEqual(code, 2)
        self.assertIn("does not exist", err)

    def test_subprocess_exit_codes(self) -> None:
        dirty = self._write("dirty.bin", _splice(b"fallback123"))
        clean = self._write("clean.bin", _make_bin())
        failing = subprocess.run(
            [sys.executable, str(GATE_SCRIPT), str(dirty)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(failing.returncode, 1, failing.stderr)
        self.assertIn("[fallback_ap_password]", failing.stderr)
        passing = subprocess.run(
            [sys.executable, str(GATE_SCRIPT), str(clean)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(passing.returncode, 0, passing.stderr)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
