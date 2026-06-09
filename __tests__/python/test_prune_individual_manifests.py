"""Unit tests for the stale per-build manifest pruning in ``gen-manifests.py``.

The generator writes one ``firmware-<index>.json`` per manifest build. When a
release shrinks the build set, the higher-numbered files it no longer writes
must be removed; otherwise a smaller release leaves orphaned ``firmware-N.json``
files behind (e.g. dropping 15 -> 14 builds left ``firmware-14.json`` on disk,
failing the manifest-health and github-pages-surface guards).

These tests exercise ``prune_stale_individual_manifests`` and the wired-up
``write_individual_manifests`` directly against a temp directory. They do not
touch the signing path, so they run hermetically with the standard library only
(no signing key, no ``cryptography``, no network).
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    # Register before exec so dataclass decorators can resolve the module.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


gen_manifests = _load_module("gen_manifests", SCRIPTS_DIR / "gen-manifests.py")

prune_stale_individual_manifests = gen_manifests.prune_stale_individual_manifests
write_individual_manifests = gen_manifests.write_individual_manifests

PREFIX = "firmware-"


def _seed(base_dir: Path, count: int) -> None:
    """Create ``firmware-0.json`` … ``firmware-(count-1).json``."""
    for index in range(count):
        (base_dir / f"{PREFIX}{index}.json").write_text("{}\n", encoding="utf-8")


def _numbered_indices(base_dir: Path) -> list:
    """Sorted integer indices of the firmware-<int>.json files on disk."""
    indices = []
    for path in base_dir.glob(f"{PREFIX}*.json"):
        stem = path.name[len(PREFIX) : -len(".json")]
        if stem.isdigit():
            indices.append(int(stem))
    return sorted(indices)


def _fake_artifact(index: int):
    """Minimal stand-in for FirmwareArtifact used by write_individual_manifests."""
    return SimpleNamespace(
        relative_path=f"firmware/configurations/build-{index}.bin",
        chip_family="ESP32-S3",
        md5="0" * 32,
        sha256="0" * 64,
        signature="sig",
        signature_ed25519="",  # falsy -> the signed-part branch is skipped
        signature_key_id="",
        file_size=123456,
        source_commit="deadbeef",
        source_url=None,
        metadata=SimpleNamespace(version="1.0.0", improv=True, deprecated=False),
    )


class PruneStaleIndividualManifestsTests(unittest.TestCase):
    def test_prunes_single_orphan_on_count_decrease(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _seed(base, 15)  # firmware-0 … firmware-14
            pruned = prune_stale_individual_manifests(base, PREFIX, 14)
            self.assertEqual([p.name for p in pruned], ["firmware-14.json"])
            self.assertEqual(_numbered_indices(base), list(range(14)))

    def test_prunes_all_orphans_above_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _seed(base, 15)  # firmware-0 … firmware-14
            pruned = prune_stale_individual_manifests(base, PREFIX, 10)
            self.assertEqual(
                sorted(p.name for p in pruned),
                sorted(f"firmware-{i}.json" for i in range(10, 15)),
            )
            self.assertEqual(_numbered_indices(base), list(range(10)))

    def test_no_op_when_nothing_to_prune(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _seed(base, 14)  # firmware-0 … firmware-13, build_count 14
            pruned = prune_stale_individual_manifests(base, PREFIX, 14)
            self.assertEqual(pruned, [])
            self.assertEqual(_numbered_indices(base), list(range(14)))

    def test_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _seed(base, 15)
            first = prune_stale_individual_manifests(base, PREFIX, 14)
            self.assertEqual([p.name for p in first], ["firmware-14.json"])
            # Second pass has nothing left to do.
            second = prune_stale_individual_manifests(base, PREFIX, 14)
            self.assertEqual(second, [])
            self.assertEqual(_numbered_indices(base), list(range(14)))

    def test_dry_run_reports_without_deleting(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _seed(base, 15)
            pruned = prune_stale_individual_manifests(
                base, PREFIX, 14, dry_run=True
            )
            self.assertEqual([p.name for p in pruned], ["firmware-14.json"])
            # Dry run must not touch the disk.
            self.assertTrue((base / "firmware-14.json").exists())
            self.assertEqual(_numbered_indices(base), list(range(15)))

    def test_missing_base_dir_is_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "does-not-exist"
            self.assertEqual(
                prune_stale_individual_manifests(missing, PREFIX, 14), []
            )

    def test_zero_builds_prunes_every_numbered_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _seed(base, 3)
            prune_stale_individual_manifests(base, PREFIX, 0)
            self.assertEqual(_numbered_indices(base), [])

    def test_leaves_non_numbered_prefixed_files_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _seed(base, 15)  # includes firmware-14.json (a real orphan)
            # Look-alikes that are NOT pure firmware-<int>.json must survive.
            decoys = ["firmware-14-backup.json", "firmware-abc.json", "manifest.json"]
            for name in decoys:
                (base / name).write_text("{}\n", encoding="utf-8")
            prune_stale_individual_manifests(base, PREFIX, 14)
            self.assertFalse((base / "firmware-14.json").exists())
            for name in decoys:
                self.assertTrue((base / name).exists(), f"{name} was removed")

    def test_write_individual_manifests_leaves_no_orphan_after_shrink(self):
        # End-to-end: a directory that already holds firmware-0 … firmware-14
        # must contain exactly firmware-0 … firmware-13 after a 14-build run.
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            _seed(base, 15)
            artifacts = [_fake_artifact(i) for i in range(14)]
            write_individual_manifests(
                artifacts, Path(PREFIX), base, dry_run=False
            )
            self.assertEqual(_numbered_indices(base), list(range(14)))
            # The regression guard: nothing past the last written index.
            self.assertEqual(max(_numbered_indices(base)), 13)


if __name__ == "__main__":
    unittest.main()
