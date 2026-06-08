"""Unit tests for ``scripts/add-firmware-source.py``.

Fully offline / hermetic: every test drives the *pure* logic (block-token
derivation, version/channel/asset-name derivation, checksum parsing,
``build_entry``, and the upsert) with synthetic data. No network, no pip
installs, stdlib only. The hyphenated script is loaded via importlib, matching
the pattern the other __tests__/python tests use.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from typing import Any, Dict, List
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
REAL_SOURCES = REPO_ROOT / "firmware" / "sources.json"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# The script is deliberately self-contained (stdlib only, no sibling imports),
# so this loads cleanly with no cryptography / gen-manifests dependency.
mod = _load_module("add_firmware_source", SCRIPTS_DIR / "add-firmware-source.py")
SourceAuthoringError = mod.SourceAuthoringError

CANONICAL_KEYS = {
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
}

# A real, valid 64-hex SHA shape (content is synthetic).
SYNTHETIC_SHA = "93310d2cbc27355e399f36a232336b6b9075dacfc178d603c7a92aa1089182d3"


def _checksum_text(asset_name: str, sha: str = SYNTHETIC_SHA, *, sep: str = "  ") -> str:
    return (
        "# synthetic checksums-sha256.txt\n"
        f"{sha}{sep}{asset_name}\n"
        f"{SYNTHETIC_SHA}  some-other-asset.bin\n"
    )


def _all_assets(asset_name: str) -> List[str]:
    return [
        asset_name,
        "checksums-sha256.txt",
        "checksums-md5.txt",
        "manifest.json",
    ]


# ---------------------------------------------------------------------------
# block_tokens (the critical derivation)
# ---------------------------------------------------------------------------


class BlockTokenTests(unittest.TestCase):
    def test_non_led_config_keeps_full_deny_set(self):
        self.assertEqual(
            mod.derive_block_tokens(
                "Ceiling-POE-VentIQ-RoomIQ", ["FanTRIAC", "LED"]
            ),
            ["FanTRIAC", "LED"],
        )

    def test_led_config_drops_its_own_led_token(self):
        # LED is one of the config's own tokens, so it must be subtracted or the
        # importer would reject the config's own legitimate binary.
        self.assertEqual(
            mod.derive_block_tokens(
                "Ceiling-POE-VentIQ-RoomIQ-LED", ["FanTRIAC", "LED"]
            ),
            ["FanTRIAC"],
        )

    def test_explicit_override_wins(self):
        self.assertEqual(
            mod.derive_block_tokens(
                "Ceiling-POE-VentIQ-RoomIQ", ["FanTRIAC", "LED"], override=["LED"]
            ),
            ["LED"],
        )

    def test_override_empty_list_is_respected(self):
        self.assertEqual(
            mod.derive_block_tokens(
                "Ceiling-POE-VentIQ-RoomIQ", ["FanTRIAC", "LED"], override=[]
            ),
            [],
        )

    def test_subtraction_is_case_insensitive(self):
        # config tokens are lowercased before comparison
        self.assertEqual(
            mod.derive_block_tokens("Ceiling-POE-led", ["FanTRIAC", "LED"]),
            ["FanTRIAC"],
        )

    def test_non_block_token_module_does_not_disturb_deny_set(self):
        self.assertEqual(
            mod.derive_block_tokens(
                "Ceiling-POE-VentIQ-FanRelay-RoomIQ", ["FanTRIAC", "LED"]
            ),
            ["FanTRIAC", "LED"],
        )

    def test_reproduces_both_committed_entries_exactly(self):
        """The headline requirement: reproduce the two committed entries."""
        base = list(mod.DEFAULT_BASE_BLOCK_TOKENS)
        self.assertEqual(
            mod.derive_block_tokens("Ceiling-POE-VentIQ-RoomIQ", base),
            ["FanTRIAC", "LED"],
        )
        self.assertEqual(
            mod.derive_block_tokens("Ceiling-POE-VentIQ-RoomIQ-LED", base),
            ["FanTRIAC"],
        )


# ---------------------------------------------------------------------------
# normalize_tag — human-entered release-tag canonicalization
# ---------------------------------------------------------------------------


class NormalizeTagTests(unittest.TestCase):
    def test_all_case_and_spacing_variants_resolve_to_canonical(self):
        for raw in ("v1.0.5", "V1.0.5", "1.0.5", " v1.0.5 ", "  1.0.5", "V1.0.5 "):
            self.assertEqual(mod.normalize_tag(raw), "v1.0.5", raw)

    def test_channel_suffix_is_lowercased(self):
        self.assertEqual(mod.normalize_tag("v1.0.0-preview"), "v1.0.0-preview")
        self.assertEqual(mod.normalize_tag("V1.0.0-PREVIEW"), "v1.0.0-preview")
        self.assertEqual(mod.normalize_tag(" v1.0.0-Led-Preview "), "v1.0.0-led-preview")

    def test_already_canonical_is_idempotent(self):
        self.assertEqual(mod.normalize_tag("v1.0.0"), "v1.0.0")
        self.assertEqual(mod.normalize_tag(mod.normalize_tag("V1.0.0")), "v1.0.0")

    def test_exactly_one_leading_v(self):
        # Duplicate leading v's collapse to one; the semver core (digit-led) is
        # never eaten by the leading-v strip.
        self.assertEqual(mod.normalize_tag("vv1.0.5"), "v1.0.5")

    def test_empty_input_stays_empty(self):
        self.assertEqual(mod.normalize_tag(""), "")
        self.assertEqual(mod.normalize_tag("   "), "")

    def test_lowercasing_makes_infer_channel_correct_for_any_case(self):
        # The reason normalize_tag lowercases: infer_channel's suffix match.
        self.assertEqual(mod.infer_channel(mod.normalize_tag("V1.0.0-PREVIEW")), "preview")
        self.assertEqual(mod.infer_channel(mod.normalize_tag("V2.1.3-BETA")), "beta")
        self.assertEqual(mod.infer_channel(mod.normalize_tag("V9.9.9")), "stable")


# ---------------------------------------------------------------------------
# fetch_release_metadata — 404 fails closed with an actionable message
# ---------------------------------------------------------------------------


class _FakeHeaders:
    def get_content_charset(self):
        return "utf-8"


class _FakeResponse:
    def __init__(self, body: bytes):
        self._body = body
        self.headers = _FakeHeaders()

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FetchRelease404Tests(unittest.TestCase):
    def _urlopen(self, *, available_tags):
        def fake(request, *_a, **_k):
            url = request.full_url
            if "/releases/tags/" in url:
                raise urllib.error.HTTPError(url, 404, "Not Found", None, None)
            # The best-effort available-tags listing call.
            body = json.dumps([{"tag_name": t} for t in available_tags]).encode("utf-8")
            return _FakeResponse(body)

        return fake

    def test_bogus_tag_still_raises_source_authoring_error(self):
        with mock.patch(
            "urllib.request.urlopen",
            side_effect=self._urlopen(available_tags=["v1.0.0", "v1.0.0-preview"]),
        ):
            with self.assertRaises(SourceAuthoringError) as ctx:
                mod.fetch_release_metadata(
                    "sense360store/esphome-public",
                    "v9.9.9",
                    None,
                    raw_tag="9.9.9",
                )
        message = str(ctx.exception)
        # Shows what the operator typed, the normalized form, and the real tags.
        self.assertIn("no release matching '9.9.9'", message)
        self.assertIn("normalized 'v9.9.9'", message)
        self.assertIn("v1.0.0", message)
        self.assertIn("v1.0.0-preview", message)

    def test_404_message_degrades_when_listing_unavailable(self):
        def fake(request, *_a, **_k):
            raise urllib.error.HTTPError(request.full_url, 404, "Not Found", None, None)

        with mock.patch("urllib.request.urlopen", side_effect=fake):
            with self.assertRaises(SourceAuthoringError) as ctx:
                mod.fetch_release_metadata(
                    "sense360store/esphome-public", "v9.9.9", None
                )
        message = str(ctx.exception)
        self.assertIn("no release matching", message)
        self.assertIn("(none found)", message)

    def test_non_404_http_error_keeps_generic_message(self):
        def fake(request, *_a, **_k):
            raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", None, None)

        with mock.patch("urllib.request.urlopen", side_effect=fake):
            with self.assertRaises(SourceAuthoringError) as ctx:
                mod.fetch_release_metadata(
                    "sense360store/esphome-public", "v1.0.0", None
                )
        self.assertIn("403 Forbidden", str(ctx.exception))


# ---------------------------------------------------------------------------
# version / channel / asset-name derivation
# ---------------------------------------------------------------------------


class DerivationTests(unittest.TestCase):
    def test_infer_channel(self):
        self.assertEqual(mod.infer_channel("v1.0.0"), "stable")
        self.assertEqual(mod.infer_channel("v1.0.0-preview"), "preview")
        self.assertEqual(mod.infer_channel("v1.0.0-led-preview"), "preview")
        self.assertEqual(mod.infer_channel("v1.0.0-beta"), "beta")
        self.assertEqual(mod.infer_channel("v2.1.3-dev"), "dev")

    def test_derive_version_from_tag(self):
        self.assertEqual(mod.derive_version("v1.0.0"), "1.0.0")
        self.assertEqual(mod.derive_version("v1.0.0-led-preview"), "1.0.0")
        self.assertEqual(mod.derive_version("v2.3.1-beta"), "2.3.1")

    def test_derive_version_explicit_overrides_tag(self):
        self.assertEqual(mod.derive_version("v9.9.9", "1.0.0"), "1.0.0")
        self.assertEqual(mod.derive_version("v9.9.9", "v1.2.3"), "1.2.3")

    def test_derive_version_fails_closed_without_semver(self):
        with self.assertRaises(SourceAuthoringError):
            mod.derive_version("vlatest")
        with self.assertRaises(SourceAuthoringError):
            mod.derive_version("v1.0", explicit="not-a-version")

    def test_derive_asset_name(self):
        self.assertEqual(
            mod.derive_asset_name("Ceiling-POE-VentIQ-RoomIQ", "1.0.0", "stable"),
            "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
        )
        self.assertEqual(
            mod.derive_asset_name("Ceiling-POE-RoomIQ-LED", "1.0.0", "preview"),
            "Sense360-Ceiling-POE-RoomIQ-LED-v1.0.0-preview.bin",
        )


# ---------------------------------------------------------------------------
# checksum parsing
# ---------------------------------------------------------------------------


class ChecksumParsingTests(unittest.TestCase):
    def test_two_space_form(self):
        parsed = mod.parse_sha256_manifest(f"{SYNTHETIC_SHA}  asset.bin\n")
        self.assertEqual(parsed["asset.bin"], SYNTHETIC_SHA)

    def test_binary_star_form(self):
        parsed = mod.parse_sha256_manifest(f"{SYNTHETIC_SHA} *asset.bin\n")
        self.assertEqual(parsed["asset.bin"], SYNTHETIC_SHA)

    def test_leading_dot_slash_is_stripped(self):
        parsed = mod.parse_sha256_manifest(f"{SYNTHETIC_SHA}  ./asset.bin\n")
        self.assertIn("asset.bin", parsed)

    def test_comments_and_blank_lines_skipped(self):
        text = f"# header\n\n{SYNTHETIC_SHA}  asset.bin\n"
        self.assertEqual(mod.parse_sha256_manifest(text), {"asset.bin": SYNTHETIC_SHA})

    def test_uppercase_digest_lowercased(self):
        parsed = mod.parse_sha256_manifest(f"{SYNTHETIC_SHA.upper()}  asset.bin\n")
        self.assertEqual(parsed["asset.bin"], SYNTHETIC_SHA)

    def test_extract_pinned_sha_happy(self):
        self.assertEqual(
            mod.extract_pinned_sha(_checksum_text("a.bin"), "a.bin"),
            SYNTHETIC_SHA,
        )

    def test_extract_pinned_sha_star_form(self):
        self.assertEqual(
            mod.extract_pinned_sha(_checksum_text("a.bin", sep=" *"), "a.bin"),
            SYNTHETIC_SHA,
        )

    def test_extract_pinned_sha_missing(self):
        with self.assertRaises(SourceAuthoringError) as ctx:
            mod.extract_pinned_sha(_checksum_text("a.bin"), "missing.bin")
        self.assertIn("no SHA256 entry", str(ctx.exception))

    def test_extract_pinned_sha_malformed_hex(self):
        bad = "zz1122  a.bin\n"  # filename present, hash not 64-hex
        with self.assertRaises(SourceAuthoringError) as ctx:
            mod.extract_pinned_sha(bad, "a.bin")
        self.assertIn("64-character hex", str(ctx.exception))


# ---------------------------------------------------------------------------
# build_entry — happy path + each fail-closed case
# ---------------------------------------------------------------------------


class BuildEntryTests(unittest.TestCase):
    def _build(self, **kw: Any) -> Dict[str, Any]:
        defaults = dict(
            source_repo="sense360store/esphome-public",
            release_tag="v1.0.0",
            config_string="Ceiling-POE-VentIQ-RoomIQ",
            version="1.0.0",
            channel="stable",
            asset_names=_all_assets(
                "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
            ),
            checksum_text=_checksum_text(
                "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
            ),
        )
        defaults.update(kw)
        return mod.build_entry(**defaults)

    def test_happy_path_full_shape(self):
        entry = self._build()
        self.assertEqual(set(entry.keys()), CANONICAL_KEYS)
        self.assertEqual(entry["source_repo"], "sense360store/esphome-public")
        self.assertEqual(entry["release_tag"], "v1.0.0")
        self.assertEqual(
            entry["release_url"],
            "https://github.com/sense360store/esphome-public/releases/tag/v1.0.0",
        )
        self.assertEqual(entry["version"], "1.0.0")
        self.assertEqual(entry["channel"], "stable")
        self.assertEqual(entry["config_string"], "Ceiling-POE-VentIQ-RoomIQ")
        self.assertEqual(
            entry["asset_name"],
            "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
        )
        self.assertEqual(entry["expected_sha256"], SYNTHETIC_SHA)
        self.assertEqual(entry["min_size_bytes"], 102400)
        self.assertEqual(
            entry["required_assets"],
            [
                "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin",
                "checksums-sha256.txt",
                "checksums-md5.txt",
                "manifest.json",
            ],
        )
        self.assertEqual(
            entry["required_release_body_sections"],
            ["Changelog", "Known Issues", "Features", "Hardware Requirements"],
        )
        self.assertEqual(entry["block_tokens"], ["FanTRIAC", "LED"])

    def test_release_url_prefers_html_url_when_given(self):
        entry = self._build(release_url="https://example/r/v1.0.0")
        self.assertEqual(entry["release_url"], "https://example/r/v1.0.0")

    def test_required_assets_only_includes_present_standard_assets(self):
        asset = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
        entry = self._build(
            asset_names=[asset, "checksums-sha256.txt"],
            checksum_text=_checksum_text(asset),
        )
        self.assertEqual(entry["required_assets"], [asset, "checksums-sha256.txt"])

    def test_led_preview_entry_block_tokens(self):
        asset = "Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin"
        entry = self._build(
            config_string="Ceiling-POE-VentIQ-RoomIQ-LED",
            channel="preview",
            release_tag="v1.0.0-led-preview",
            asset_names=_all_assets(asset),
            checksum_text=_checksum_text(asset),
        )
        self.assertEqual(entry["block_tokens"], ["FanTRIAC"])

    def test_policy_override_block_tokens(self):
        policy = mod.normalize_policy(
            {"overrides": {"Ceiling-POE-VentIQ-RoomIQ": {"block_tokens": ["LED"]}}}
        )
        entry = self._build(policy=policy)
        self.assertEqual(entry["block_tokens"], ["LED"])

    def test_policy_overrides_min_size_and_sections(self):
        policy = mod.normalize_policy(
            {
                "min_size_bytes": 200000,
                "required_release_body_sections": ["Changelog"],
            }
        )
        entry = self._build(policy=policy)
        self.assertEqual(entry["min_size_bytes"], 200000)
        self.assertEqual(entry["required_release_body_sections"], ["Changelog"])

    def test_preserves_unknown_existing_fields(self):
        existing = {"config_string": "Ceiling-POE-VentIQ-RoomIQ", "webflash_import_eligibility": {"eligible": True}}
        entry = self._build(existing=existing)
        self.assertIn("webflash_import_eligibility", entry)
        self.assertEqual(entry["webflash_import_eligibility"], {"eligible": True})

    def test_fail_missing_bin_lists_available_bins(self):
        with self.assertRaises(SourceAuthoringError) as ctx:
            self._build(
                asset_names=["some-other.bin", "checksums-sha256.txt"],
                checksum_text=_checksum_text("some-other.bin"),
            )
        message = str(ctx.exception)
        self.assertIn("Available .bin assets", message)
        self.assertIn("some-other.bin", message)

    def test_fail_missing_checksums_asset(self):
        asset = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
        with self.assertRaises(SourceAuthoringError) as ctx:
            self._build(asset_names=[asset], checksum_text="")
        self.assertIn("checksums-sha256.txt", str(ctx.exception))

    def test_fail_missing_sha_line(self):
        asset = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
        with self.assertRaises(SourceAuthoringError) as ctx:
            self._build(
                asset_names=_all_assets(asset),
                checksum_text="# no entry for our asset\n",
            )
        self.assertIn("no SHA256 entry", str(ctx.exception))

    def test_fail_malformed_sha_line(self):
        asset = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
        with self.assertRaises(SourceAuthoringError) as ctx:
            self._build(
                asset_names=_all_assets(asset),
                checksum_text=f"nothex  {asset}\n",
            )
        self.assertIn("64-character hex", str(ctx.exception))


# ---------------------------------------------------------------------------
# upsert: replace-same-key, add-new-key, sorted output
# ---------------------------------------------------------------------------


class UpsertTests(unittest.TestCase):
    @staticmethod
    def _e(config: str, channel: str = "preview", repo: str = "sense360store/esphome-public", marker: str = "old") -> Dict[str, Any]:
        return {
            "source_repo": repo,
            "config_string": config,
            "channel": channel,
            "marker": marker,
        }

    def test_replace_same_key(self):
        sources = [self._e("Ceiling-POE-RoomIQ"), self._e("Ceiling-POE-AirIQ-RoomIQ")]
        new = self._e("Ceiling-POE-RoomIQ", marker="new")
        result = mod.upsert_source(sources, new)
        self.assertEqual(len(result), 2)
        by_cfg = {e["config_string"]: e for e in result}
        self.assertEqual(by_cfg["Ceiling-POE-RoomIQ"]["marker"], "new")
        self.assertEqual(by_cfg["Ceiling-POE-AirIQ-RoomIQ"]["marker"], "old")

    def test_same_config_different_channel_is_a_distinct_key(self):
        sources = [self._e("Ceiling-POE-RoomIQ", channel="stable")]
        new = self._e("Ceiling-POE-RoomIQ", channel="preview", marker="new")
        result = mod.upsert_source(sources, new)
        self.assertEqual(len(result), 2)

    def test_add_new_key(self):
        sources = [self._e("Ceiling-POE-RoomIQ")]
        new = self._e("Ceiling-POE-VentIQ-RoomIQ", marker="new")
        result = mod.upsert_source(sources, new)
        self.assertEqual(len(result), 2)

    def test_output_is_sorted(self):
        sources = [
            self._e("Ceiling-POE-VentIQ-RoomIQ", channel="stable"),
            self._e("Ceiling-POE-RoomIQ"),
        ]
        new = self._e("Ceiling-POE-AirIQ-RoomIQ", marker="new")
        result = mod.upsert_source(sources, new)
        keys = [mod.source_key(e) for e in result]
        self.assertEqual(keys, sorted(keys))


# ---------------------------------------------------------------------------
# sources doc I/O — schema guard + serialization shape
# ---------------------------------------------------------------------------


class SourcesDocTests(unittest.TestCase):
    def test_schema_version_must_be_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            path.write_text(json.dumps({"schema_version": 2, "sources": []}), encoding="utf-8")
            with self.assertRaises(SourceAuthoringError) as ctx:
                mod.load_sources_doc(path)
            self.assertIn("schema_version", str(ctx.exception))

    def test_absent_file_starts_fresh_doc(self):
        with tempfile.TemporaryDirectory() as tmp:
            doc = mod.load_sources_doc(Path(tmp) / "nope.json")
            self.assertEqual(doc, {"schema_version": 1, "sources": []})

    def test_invalid_json_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sources.json"
            path.write_text("{ not json", encoding="utf-8")
            with self.assertRaises(SourceAuthoringError):
                mod.load_sources_doc(path)

    def test_serialize_is_four_space_indent_with_trailing_newline(self):
        doc = {"schema_version": 1, "sources": [{"source_repo": "x", "config_string": "y", "channel": "stable"}]}
        text = mod.serialize_sources_doc(doc)
        self.assertTrue(text.endswith("\n"))
        self.assertIn('\n    "schema_version": 1', text)
        # round-trips
        self.assertEqual(json.loads(text)["schema_version"], 1)

    def test_load_policy_absent_returns_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            policy = mod.load_policy(Path(tmp) / "absent.json")
            self.assertEqual(policy["base_block_tokens"], ["FanTRIAC", "LED"])
            self.assertEqual(policy["min_size_bytes"], 102400)


# ---------------------------------------------------------------------------
# Offline upsert smoke check against the REAL firmware/sources.json
# ---------------------------------------------------------------------------


class RealSourcesSmokeTests(unittest.TestCase):
    def test_upsert_into_real_sources_leaves_disk_untouched(self):
        before = REAL_SOURCES.read_bytes()
        doc = json.loads(before.decode("utf-8"))
        self.assertEqual(doc["schema_version"], 1)

        asset = "Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin"
        existing = mod.find_existing(
            doc["sources"], ("sense360store/esphome-public", "Ceiling-POE-VentIQ-RoomIQ", "stable")
        )
        self.assertIsNotNone(existing, "expected Release-One entry to be present")

        entry = mod.build_entry(
            source_repo="sense360store/esphome-public",
            release_tag="v1.0.0",
            config_string="Ceiling-POE-VentIQ-RoomIQ",
            version="1.0.0",
            channel="stable",
            asset_names=_all_assets(asset),
            checksum_text=_checksum_text(asset),
            existing=existing,
        )

        # block_tokens still reproduce the committed Release-One deny-list.
        self.assertEqual(entry["block_tokens"], ["FanTRIAC", "LED"])

        # The generated entry's shape matches an existing committed entry's keys
        # (the preview entries carry exactly the canonical 12 keys).
        existing_shapes = [set(e.keys()) for e in doc["sources"]]
        self.assertIn(set(entry.keys()), existing_shapes)

        # In-memory upsert produces a valid doc with schema_version preserved.
        new_sources = mod.upsert_source(doc["sources"], entry)
        new_doc = dict(doc)
        new_doc["sources"] = new_sources
        serialized = mod.serialize_sources_doc(new_doc)
        reparsed = json.loads(serialized)
        self.assertEqual(reparsed["schema_version"], 1)
        # Same number of entries (RoomIQ stable already existed -> replaced).
        self.assertEqual(len(reparsed["sources"]), len(doc["sources"]))

        # The real file on disk must be byte-for-byte unchanged.
        self.assertEqual(REAL_SOURCES.read_bytes(), before)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
