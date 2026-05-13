"""Drift guards for ``scripts/smoke-test-deployment.py``.

The post-deploy smoke test runs in CI with only ``--base-url`` and
``--expected-commit`` (see ``.github/workflows/firmware-publish.yml``), so
its built-in ``DEFAULT_REQUIRED_CONFIG`` is what actually gates the live
deploy. If it drifts away from the current Release-One ``config_string``,
the smoke test will fail every deploy (or worse, validate the wrong
config). These tests fail closed before that can happen.

Stdlib only — matches the rest of ``__tests__/python/``.
"""

from __future__ import annotations

import importlib.util
import re
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SMOKE_TEST_PATH = REPO_ROOT / "scripts" / "smoke-test-deployment.py"
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "firmware-publish.yml"


def _load_smoke_test_module():
    """Import ``scripts/smoke-test-deployment.py`` as ``smoke_test_deployment``.

    The filename uses hyphens so a plain ``import`` won't work; load it via
    ``importlib.util`` instead (same pattern as
    ``test_import_firmware_sources.py``).
    """

    spec = importlib.util.spec_from_file_location(
        "smoke_test_deployment", SMOKE_TEST_PATH
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load {SMOKE_TEST_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["smoke_test_deployment"] = module
    spec.loader.exec_module(module)
    return module


def _extract_workflow_required_configs(workflow_text: str) -> list[str]:
    """Pull the bash ``REQUIRED_CONFIGS=( … )`` array out of the publish workflow.

    The workflow embeds the allowlist as a heredoc-style bash array; rather
    than parsing the YAML *and* the bash, we lift the array body with a
    targeted regex and split on quoted entries. Keeps the test stdlib-only.
    """

    match = re.search(
        r"REQUIRED_CONFIGS=\(\s*(?P<body>.*?)\s*\)",
        workflow_text,
        re.DOTALL,
    )
    if match is None:
        raise AssertionError(
            "REQUIRED_CONFIGS=( ... ) bash array not found in "
            f"{WORKFLOW_PATH}; workflow may have changed shape."
        )
    return re.findall(r'"([^"]+)"', match.group("body"))


class SmokeTestDefaultsTest(unittest.TestCase):
    """Pins the smoke-test default to the current Release-One config."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.module = _load_smoke_test_module()
        cls.smoke_test_source = SMOKE_TEST_PATH.read_text(encoding="utf-8")
        cls.workflow_source = WORKFLOW_PATH.read_text(encoding="utf-8")

    def test_default_required_config_is_current_release_one(self) -> None:
        """The default points at the current Release-One config_string."""

        self.assertEqual(
            self.module.DEFAULT_REQUIRED_CONFIG,
            "Ceiling-POE-VentIQ-RoomIQ",
            (
                "DEFAULT_REQUIRED_CONFIG in scripts/smoke-test-deployment.py "
                "must match the current Release-One config_string. "
                "Update it together with REQUIRED_CONFIGS in "
                ".github/workflows/firmware-publish.yml and re-run the "
                "post-deploy smoke test."
            ),
        )

    def test_smoke_test_script_has_no_fantriac_reference(self) -> None:
        """FanTRIAC is blocked from Release-One; nothing in the smoke test
        should imply otherwise (code, docstrings, comments, help text)."""

        self.assertNotIn(
            "FanTRIAC",
            self.smoke_test_source,
            (
                "scripts/smoke-test-deployment.py must not reference "
                "FanTRIAC. FanTRIAC is blocked from Release-One via "
                "firmware/sources.json `block_tokens`; the smoke test "
                "default must reflect the current Release-One config "
                "(Ceiling-POE-VentIQ-RoomIQ), not the legacy FanTRIAC "
                "target."
            ),
        )

    def test_default_required_config_matches_workflow_allowlist(self) -> None:
        """The smoke-test default must be one of the configs the publish
        workflow guarantees is in ``manifest.json``."""

        configs = _extract_workflow_required_configs(self.workflow_source)
        self.assertIn(
            self.module.DEFAULT_REQUIRED_CONFIG,
            configs,
            (
                "DEFAULT_REQUIRED_CONFIG "
                f"({self.module.DEFAULT_REQUIRED_CONFIG!r}) is not in the "
                "workflow REQUIRED_CONFIGS allowlist "
                f"({configs!r}). The smoke test will fail every deploy "
                "until one side is updated."
            ),
        )


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    unittest.main()
