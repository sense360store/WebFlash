#!/usr/bin/env python3
"""Post-deploy production smoke test for the WebFlash GitHub Pages site.

Run after ``actions/deploy-pages`` finishes. Verifies that the live origin
serves a manifest that meets the production-acceptance bar:

  * ``manifest.json`` is reachable and parses as JSON.
  * ``manifest.source_commit`` matches the deploying workflow commit.
  * At least one stable, non-deprecated production build exists.
  * No stable, non-deprecated build is signed by the development key
    (``dev-2026-01``).
  * No stable, non-deprecated build has placeholder file size or
    placeholder file content (the committed 18-byte ``Binary placeholder``
    fixture).
  * The required release-one config (``Ceiling-POE-VentIQ-FanTRIAC-RoomIQ``)
    exists as a stable, non-deprecated build.
  * Rescue firmware (``Rescue`` config / ``rescue`` channel) exists.
  * The production signing key (``sense360-prod-2026-02``) is the signer
    for at least one stable, non-deprecated build.
  * The root page serves the current installer title.

The script does NOT flash hardware and does NOT mutate the manifest. It
only performs read-only HTTP requests against the deployed origin.

Pages CDN propagation can lag the workflow run, so the manifest fetch
retries with a fixed delay until ``source_commit`` matches the expected
commit (or attempts are exhausted). All other checks run once on the
matched manifest.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_REQUIRED_CONFIG = "Ceiling-POE-VentIQ-FanTRIAC-RoomIQ"
DEFAULT_PRODUCTION_KEY = "sense360-prod-2026-02"
DEFAULT_BLOCKED_KEY = "dev-2026-01"
DEFAULT_INSTALLER_TITLE = "Sense360 Firmware Installer"

# Mirrors PLACEHOLDER_FIRMWARE_SIZE_BYTES in scripts/gen-manifests.py: any
# stable build at or below this size is treated as a placeholder fixture.
DEFAULT_PLACEHOLDER_SIZE_BYTES = 64

# The committed 18-byte stub binary's contents. Mirrors the leading entry
# of KNOWN_PLACEHOLDER_PAYLOADS in scripts/gen-manifests.py.
PLACEHOLDER_PAYLOAD = b"Binary placeholder"

DEFAULT_HTTP_TIMEOUT_SECONDS = 30.0


@dataclass
class SmokeTestResult:
    """Aggregates pass/fail messages for the run."""

    passes: List[str] = field(default_factory=list)
    failures: List[str] = field(default_factory=list)

    def ok(self, message: str) -> None:
        self.passes.append(message)

    def fail(self, message: str) -> None:
        self.failures.append(message)

    @property
    def succeeded(self) -> bool:
        return not self.failures


def _build_url(base_url: str, suffix: str) -> str:
    if not base_url.endswith("/"):
        base_url = base_url + "/"
    if suffix.startswith("/"):
        suffix = suffix[1:]
    return base_url + suffix


def _http_get(
    url: str, *, timeout: float = DEFAULT_HTTP_TIMEOUT_SECONDS, headers: Optional[Dict[str, str]] = None
) -> Tuple[int, bytes, Dict[str, str]]:
    """Fetch ``url`` with stdlib urllib. Returns ``(status, body, headers)``.

    Network / HTTP errors propagate so callers can decide whether to retry.
    """

    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - intentional HTTPS GET
        body = response.read()
        # urllib's Headers behaves like a mapping; normalise to plain dict.
        return response.status, body, {k.lower(): v for k, v in response.headers.items()}


def fetch_manifest_with_retry(
    base_url: str,
    *,
    expected_commit: str,
    max_attempts: int,
    retry_delay_seconds: float,
    log,
) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    """Fetch ``manifest.json`` and wait until ``source_commit`` matches.

    Returns ``(manifest, attempt_log)``. ``manifest`` is ``None`` if the
    fetch never succeeded or the expected commit never appeared.
    """

    manifest_url = _build_url(base_url, "manifest.json")
    attempts: List[str] = []
    last_payload: Optional[Dict[str, Any]] = None

    for attempt in range(1, max_attempts + 1):
        try:
            status, body, _ = _http_get(manifest_url)
        except urllib.error.HTTPError as exc:
            attempts.append(f"attempt {attempt}: HTTP {exc.code} from {manifest_url}")
            log(f"  attempt {attempt}/{max_attempts}: HTTP {exc.code}")
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            attempts.append(f"attempt {attempt}: network error: {exc}")
            log(f"  attempt {attempt}/{max_attempts}: network error: {exc}")
        else:
            if status != 200:
                attempts.append(f"attempt {attempt}: HTTP {status} from {manifest_url}")
                log(f"  attempt {attempt}/{max_attempts}: HTTP {status}")
            else:
                try:
                    payload = json.loads(body.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    attempts.append(f"attempt {attempt}: invalid JSON: {exc}")
                    log(f"  attempt {attempt}/{max_attempts}: invalid JSON ({exc})")
                else:
                    last_payload = payload
                    served_commit = payload.get("source_commit")
                    if served_commit == expected_commit:
                        attempts.append(
                            f"attempt {attempt}: source_commit matches ({served_commit})"
                        )
                        log(
                            f"  attempt {attempt}/{max_attempts}: source_commit matches ({served_commit})"
                        )
                        return payload, attempts
                    attempts.append(
                        f"attempt {attempt}: stale source_commit ({served_commit!r} != {expected_commit!r})"
                    )
                    log(
                        f"  attempt {attempt}/{max_attempts}: stale source_commit "
                        f"({served_commit!r} != {expected_commit!r})"
                    )

        if attempt < max_attempts:
            time.sleep(retry_delay_seconds)

    return last_payload, attempts


def check_root_page_title(
    base_url: str, *, expected_title: str, result: SmokeTestResult
) -> None:
    url = _build_url(base_url, "")
    try:
        status, body, _ = _http_get(url)
    except urllib.error.HTTPError as exc:
        result.fail(f"Root page {url} returned HTTP {exc.code}")
        return
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        result.fail(f"Root page {url} unreachable: {exc}")
        return
    if status != 200:
        result.fail(f"Root page {url} returned HTTP {status}")
        return
    try:
        text = body.decode("utf-8", errors="replace")
    except Exception as exc:  # pragma: no cover - decode with errors='replace' shouldn't raise
        result.fail(f"Root page {url} body decode failed: {exc}")
        return
    needle = f"<title>{expected_title}</title>"
    if needle in text:
        result.ok(f"Root page serves installer title {expected_title!r}")
        return
    result.fail(
        f"Root page {url} does not contain expected title {expected_title!r} "
        f"(looked for {needle!r})"
    )


def _is_stable_application_build(build: Dict[str, Any]) -> bool:
    """Return True for stable, non-deprecated, application-type builds.

    Rescue firmware lives on its own channel and is checked separately.
    """

    if build.get("channel") != "stable":
        return False
    if build.get("deprecated"):
        return False
    artifact_type = build.get("artifact_type")
    # Treat anything explicitly marked as a test fixture as out-of-scope for
    # production checks. Application is the canonical type for stable builds.
    if artifact_type == "test_fixture":
        return False
    return True


def _build_label(build: Dict[str, Any]) -> str:
    config_string = build.get("config_string") or "?"
    version = build.get("version") or "?"
    channel = build.get("channel") or "?"
    return f"{config_string}@{version}-{channel}"


def _bin_path_from_build(build: Dict[str, Any]) -> Optional[str]:
    parts = build.get("parts")
    if not isinstance(parts, list) or not parts:
        return None
    first = parts[0]
    if not isinstance(first, dict):
        return None
    path = first.get("path")
    if not isinstance(path, str) or not path:
        return None
    return path


def check_at_least_one_stable_build(
    builds: List[Dict[str, Any]], *, result: SmokeTestResult
) -> None:
    stable_builds = [b for b in builds if _is_stable_application_build(b)]
    if stable_builds:
        result.ok(f"Found {len(stable_builds)} stable, non-deprecated production build(s)")
        return
    result.fail("Manifest contains no stable, non-deprecated production builds")


def check_no_stable_uses_blocked_key(
    builds: List[Dict[str, Any]], *, blocked_key: str, result: SmokeTestResult
) -> None:
    offenders: List[str] = []
    for build in builds:
        if not _is_stable_application_build(build):
            continue
        if build.get("signature_key_id") == blocked_key:
            offenders.append(_build_label(build))
    if offenders:
        result.fail(
            f"{len(offenders)} stable build(s) signed by blocked key {blocked_key!r}: "
            + ", ".join(offenders)
        )
        return
    result.ok(f"No stable, non-deprecated build is signed by blocked key {blocked_key!r}")


def check_production_key_in_use(
    builds: List[Dict[str, Any]], *, production_key: str, result: SmokeTestResult
) -> None:
    matches = [
        _build_label(b)
        for b in builds
        if _is_stable_application_build(b) and b.get("signature_key_id") == production_key
    ]
    if matches:
        result.ok(
            f"Production key {production_key!r} signs {len(matches)} stable build(s)"
        )
        return
    result.fail(
        f"No stable, non-deprecated build is signed by production key {production_key!r}"
    )


def check_no_stable_placeholder_size(
    builds: List[Dict[str, Any]],
    *,
    placeholder_size_bytes: int,
    result: SmokeTestResult,
) -> None:
    offenders: List[str] = []
    for build in builds:
        if not _is_stable_application_build(build):
            continue
        file_size = build.get("file_size")
        if not isinstance(file_size, int) or file_size <= placeholder_size_bytes:
            offenders.append(f"{_build_label(build)} (file_size={file_size!r})")
    if offenders:
        result.fail(
            f"{len(offenders)} stable build(s) at placeholder file size "
            f"(<= {placeholder_size_bytes} bytes): "
            + ", ".join(offenders)
        )
        return
    result.ok(
        f"No stable, non-deprecated build has placeholder file size "
        f"(<= {placeholder_size_bytes} bytes)"
    )


def check_no_stable_placeholder_content(
    builds: List[Dict[str, Any]], *, base_url: str, result: SmokeTestResult
) -> None:
    """Range-fetch the leading bytes of each stable build and reject the
    committed ``Binary placeholder`` payload.

    Defends against a deploy where the manifest looks fine but the served
    ``.bin`` is still a fixture stub.
    """

    sniff_size = max(len(PLACEHOLDER_PAYLOAD), 64)
    offenders: List[str] = []
    fetch_failures: List[str] = []
    checked: List[str] = []
    for build in builds:
        if not _is_stable_application_build(build):
            continue
        bin_relative = _bin_path_from_build(build)
        if bin_relative is None:
            offenders.append(f"{_build_label(build)} (no parts[0].path)")
            continue
        bin_url = _build_url(base_url, bin_relative)
        headers = {"Range": f"bytes=0-{sniff_size - 1}"}
        try:
            status, body, _ = _http_get(bin_url, headers=headers)
        except urllib.error.HTTPError as exc:
            fetch_failures.append(f"{_build_label(build)}: HTTP {exc.code} from {bin_url}")
            continue
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            fetch_failures.append(f"{_build_label(build)}: network error from {bin_url}: {exc}")
            continue
        # 200 (no Range support) and 206 (partial content) are both valid;
        # in either case we only inspect the leading bytes.
        if status not in (200, 206):
            fetch_failures.append(
                f"{_build_label(build)}: HTTP {status} from {bin_url}"
            )
            continue
        head = body[:sniff_size]
        if head.startswith(PLACEHOLDER_PAYLOAD):
            offenders.append(f"{_build_label(build)} ({bin_relative})")
        else:
            checked.append(_build_label(build))
    if offenders:
        result.fail(
            f"{len(offenders)} stable build(s) serve placeholder content: "
            + ", ".join(offenders)
        )
    if fetch_failures:
        # A failure to read the leading bytes is a smoke-test failure: we
        # cannot prove the served bytes are not a placeholder.
        result.fail(
            f"Could not verify content of {len(fetch_failures)} stable build(s): "
            + "; ".join(fetch_failures)
        )
    if not offenders and not fetch_failures:
        result.ok(
            f"Verified leading bytes of {len(checked)} stable build(s) are not placeholders"
        )


def check_required_release_one_config(
    builds: List[Dict[str, Any]], *, required_config: str, result: SmokeTestResult
) -> None:
    matches = [
        _build_label(b)
        for b in builds
        if _is_stable_application_build(b) and b.get("config_string") == required_config
    ]
    if matches:
        result.ok(
            f"Required release-one config {required_config!r} present "
            f"({len(matches)} build(s))"
        )
        return
    result.fail(
        f"Required release-one config {required_config!r} missing from manifest "
        "(must exist as a stable, non-deprecated build)"
    )


def check_rescue_firmware(
    builds: List[Dict[str, Any]], *, result: SmokeTestResult
) -> None:
    matches = [
        _build_label(b)
        for b in builds
        if not b.get("deprecated")
        and (b.get("channel") == "rescue" or b.get("config_string") == "Rescue")
    ]
    if matches:
        result.ok(f"Rescue firmware present ({len(matches)} build(s))")
        return
    result.fail("Rescue firmware missing from manifest (no rescue-channel build found)")


def run_smoke_test(args: argparse.Namespace, *, log) -> SmokeTestResult:
    result = SmokeTestResult()

    log(f"Smoke testing deployed origin: {args.base_url}")
    log(f"Expected source_commit: {args.expected_commit}")
    log(
        f"Fetching manifest.json (max {args.max_attempts} attempts, "
        f"{args.retry_delay_seconds:g}s between retries)..."
    )

    manifest, attempts = fetch_manifest_with_retry(
        args.base_url,
        expected_commit=args.expected_commit,
        max_attempts=args.max_attempts,
        retry_delay_seconds=args.retry_delay_seconds,
        log=log,
    )

    if manifest is None:
        result.fail(
            "manifest.json never returned a parseable payload after "
            f"{args.max_attempts} attempt(s); last failures: "
            + (attempts[-1] if attempts else "<none>")
        )
        return result

    served_commit = manifest.get("source_commit")
    if served_commit == args.expected_commit:
        result.ok(
            f"manifest.json reachable and source_commit matches workflow commit "
            f"({served_commit})"
        )
    else:
        result.fail(
            f"manifest.json source_commit mismatch: served {served_commit!r}, "
            f"expected {args.expected_commit!r} (after {args.max_attempts} attempts)"
        )
        # Continue running the rest of the checks against what we did get,
        # but the run is already failing.

    builds = manifest.get("builds")
    if not isinstance(builds, list):
        result.fail("manifest.json has no top-level 'builds' array")
        return result

    check_at_least_one_stable_build(builds, result=result)
    check_no_stable_uses_blocked_key(
        builds, blocked_key=args.blocked_key, result=result
    )
    check_production_key_in_use(
        builds, production_key=args.production_key, result=result
    )
    check_no_stable_placeholder_size(
        builds,
        placeholder_size_bytes=args.placeholder_size_bytes,
        result=result,
    )
    check_no_stable_placeholder_content(
        builds, base_url=args.base_url, result=result
    )
    check_required_release_one_config(
        builds, required_config=args.required_config, result=result
    )
    check_rescue_firmware(builds, result=result)
    check_root_page_title(
        args.base_url, expected_title=args.installer_title, result=result
    )

    return result


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Verify that the live WebFlash GitHub Pages deployment serves a "
            "production-acceptable manifest. Fails non-zero on any finding."
        )
    )
    parser.add_argument(
        "--base-url",
        required=True,
        help="Root URL of the deployed site (e.g. https://sense360store.github.io/WebFlash/).",
    )
    parser.add_argument(
        "--expected-commit",
        required=True,
        help="Workflow commit SHA. manifest.json's source_commit must match.",
    )
    parser.add_argument(
        "--required-config",
        default=DEFAULT_REQUIRED_CONFIG,
        help=f"Required release-one config_string (default: {DEFAULT_REQUIRED_CONFIG}).",
    )
    parser.add_argument(
        "--production-key",
        default=DEFAULT_PRODUCTION_KEY,
        help=f"Production signing key id (default: {DEFAULT_PRODUCTION_KEY}).",
    )
    parser.add_argument(
        "--blocked-key",
        default=DEFAULT_BLOCKED_KEY,
        help=f"Signing key id that must NOT sign stable builds (default: {DEFAULT_BLOCKED_KEY}).",
    )
    parser.add_argument(
        "--installer-title",
        default=DEFAULT_INSTALLER_TITLE,
        help=f"Expected <title> on the root page (default: {DEFAULT_INSTALLER_TITLE!r}).",
    )
    parser.add_argument(
        "--placeholder-size-bytes",
        type=int,
        default=DEFAULT_PLACEHOLDER_SIZE_BYTES,
        help=(
            "file_size threshold (bytes) at or below which a stable build is "
            f"considered a placeholder (default: {DEFAULT_PLACEHOLDER_SIZE_BYTES})."
        ),
    )
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=30,
        help="Manifest-fetch retries while waiting for Pages CDN propagation (default: 30).",
    )
    parser.add_argument(
        "--retry-delay-seconds",
        type=float,
        default=10.0,
        help="Seconds between manifest-fetch retries (default: 10.0).",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    def log(message: str) -> None:
        print(message, flush=True)

    result = run_smoke_test(args, log=log)

    print("")
    print("== Smoke test results ==")
    for ok in result.passes:
        print(f"  OK   {ok}")
    for failure in result.failures:
        print(f"  FAIL {failure}", file=sys.stderr)

    if not result.succeeded:
        print("")
        print(
            f"Smoke test FAILED ({len(result.failures)} finding(s), "
            f"{len(result.passes)} passing).",
            file=sys.stderr,
        )
        return 1

    print("")
    print(f"Smoke test PASSED ({len(result.passes)} checks).")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    sys.exit(main())
