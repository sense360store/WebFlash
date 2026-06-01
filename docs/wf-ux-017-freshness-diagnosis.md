# WF-UX-017 — Manifest freshness: live "unknown" diagnosis + Simple-install non-blocking fix

This note records the diagnosis of why the live GitHub Pages Simple install kept
showing a freshness problem before install, and the two-part fix WF-UX-017 ships:

1. make "freshness unknown" **non-blocking** in Simple install (it is *not* the
   same as "stale"), and
2. make the live freshness check **diagnosable** with structured reason codes so
   the actual cause is observable instead of collapsing to an opaque `unknown`.

The selected firmware on the live Simple path is the stable Release-One build
(`Ceiling-POE-VentIQ-RoomIQ`, v1.0.0) — present on disk, signed,
provenance-verified, and installable. "Freshness unknown" only ever meant
"WebFlash could not *recheck* the published firmware list", never "the selected
build is bad". WF-UX-014/016 made the *copy* calm; WF-UX-017 makes the *gate*
match the copy and exposes the live failure cause.

---

## Part 1 — Why the Simple install still blocked (the real bug)

`scripts/services/manifest-freshness.js` is fine as a verdict producer. The
block came from `scripts/state.js` counting the freshness signal **twice**:

- **As a dedicated gate** — `evaluateFreshnessGate()` returns
  `manifestUnknownBlocking` for an unacknowledged `unknown` verdict.
- **As a blocking preflight warn** — `getManifestFreshnessCheck()` returns the
  `manifest-freshness` row as `state: 'warn', blocking: true` for `unknown`.
  On the live site that row is part of `window.latestPreflightChecks`, so
  `evaluatePreflightPolicy(...)` saw a warn and set `canInstall = false`, which
  the install gate AND-ed into `readyToFlash`.

So even after WF-UX-016 routed the *reason* to the calm `freshness-unknown` hero
copy, `readyToFlash` was still `false` and the Install button stayed disabled.
The customer saw the calm "Could not recheck for updates" copy **and** a blocked
Install button — which still reads as an error.

### The fix (state.js)

- `evaluateFreshnessGate()` is now the **single freshness authority**.
  `unknown` is **non-blocking in Simple install** (`!isSimpleInstallMode()`),
  while Advanced install keeps the acknowledgement gate. **Stale stays a hard
  block in both modes.** SW-update-waiting stays a hard block.
- `evaluateGatingPreflightPolicy()` computes the install-gating policy over every
  check **except** `manifest-freshness`, so the same signal can never
  double-block. The full checks array still drives the diagnostics panel, the
  preflight verdict, and the readiness reason. The render path
  (`updateFirmwareControls`) and both click-time defense handlers
  (`attachInstallButtonListeners`, `bindSummaryInstallButton`) all read this one
  filtered policy so they cannot disagree.
- The install-readiness broadcast carries a `freshness` axis
  (`{ state, hasRun, acknowledged, reason, hardBlock }`) so the Simple hero can
  render a **small secondary note** that is never the main status, and Setup
  checks can show the diagnosis code.

Net Simple-install behaviour:

| Selected stable build, provenance pass | Safety checkbox | Freshness | Status |
|---|---|---|---|
| ✓ | unchecked | unknown | **Confirm before installing** (+ small note) |
| ✓ | checked | unknown | **Ready to install** (+ small note) |
| ✓ | any | **stale** | **Cannot install yet** — hard block, reload |
| missing fw / unsupported browser / failed provenance | — | — | hard block |

---

## Part 2 — Why the live recheck returned "unknown" (diagnosis by inspection)

Each inspection point the ticket called out, and what we found:

### `scripts/services/manifest-freshness.js`
Logic is correct. Before WF-UX-017 every failure (network throw, non-JSON body,
missing field) collapsed into a single opaque `unknown` with a free-text `error`
string — not enough to tell *which* failure happened on the live site. **Fix:**
attach a structured `reason` code to every outcome (see Part 3).

### Manifest fetch URL resolution
`MANIFEST_URL = 'manifest.json'` (relative). On GitHub Pages the site is served
from a project subpath (`https://<org>.github.io/WebFlash/`), and a relative
`manifest.json` resolves against the document base to
`…/WebFlash/manifest.json` — **correct**. Both the startup load (`state.js`
`loadManifestData`) and the freshness recheck use the same relative URL, so they
target the same file. No base-URL bug.

### `cache: 'no-store'` behaviour
The recheck uses `fetch('manifest.json', { cache: 'no-store' })`. This bypasses
the **HTTP cache**, which is correct, but a prior `sw.js` comment claimed it
"bypasses the SW entirely and goes straight to the network." **That is wrong** —
`cache: 'no-store'` does not bypass the service worker; the request still reaches
the SW `fetch` handler. The comment has been corrected (the fetch *strategy* is
unchanged). In practice the SW handles `manifest.json` **network-first**, so a
controlled page still gets a fresh copy (falling back to the cached copy only on
a network error) — either way a real manifest with `generated_at`, i.e.
`current`/`stale`, never `unknown`.

### `generated_at` parsing
`manifest.json` ships `generated_at` (e.g. `2026-05-15T13:35:02.602401+00:00`),
an ISO-8601 timestamp with offset. `Date.parse` handles it. The startup metadata
capture (`buildManifestContext` → `captureManifestMetadata`) stores it as
`loadedGeneratedAt`. No parsing bug for the real manifest. A missing/garbled
field is now reported as `missing-generated-at` / `invalid-generated-at` instead
of a bare `unknown`.

### Timezone / date comparison
Comparison is on epoch milliseconds (`Date.parse`), which is timezone-agnostic.
`liveMs > loadedMs ⇒ stale`, otherwise `current`. No TZ bug.

### Pages path / base-URL behaviour
Covered above — relative URL resolves correctly under the project subpath. The
`_headers` file (CORS/CSP/cache rules) is **Netlify/Cloudflare-Pages syntax and
is ignored by GitHub Pages**, so the `Cache-Control` it declares for
`manifest.json` is *not* applied on Pages; Pages serves with its own CDN
caching. This affects *staleness windows*, not the `unknown` outcome
(`cache: 'no-store'` handles the browser side; a CDN copy still has
`generated_at`).

### Service-worker interaction / "is the no-store fetch hitting the correct
`manifest.json`?"
Yes — same-origin, same relative path, intercepted by the SW network-first
handler. The realistic way the recheck yields `unknown` on Pages is when the
response is **not a usable manifest**:
- a non-2xx (404/403/5xx) from the CDN ⇒ now `http-error`;
- a **2xx whose body is not JSON** — a GitHub Pages 404 **HTML** page or an
  `index.html` fallback served in place of `manifest.json` (e.g. a transient
  Pages mis-route, or a path/case mismatch) — `response.ok` is `true` but
  `response.json()` throws. Previously this collapsed into the generic catch
  block as `unknown`/"network error"; it is now **`parse-failed`**, which is the
  single most useful signal for triaging a live `unknown`.

---

## Part 3 — Reason codes (the diagnosis deliverable)

`checkManifestFreshness()` now returns a `reason` alongside `verdict`
(`FRESHNESS_REASON` is exported for reuse). The legacy free-text `error` field is
preserved for backward compatibility.

| `reason` | `verdict` | Meaning |
|---|---|---|
| `fetch-failed` | unknown | No fetch impl, or the request threw (offline, DNS, CSP `connect-src`, abort). |
| `http-error` | unknown | Resolved but `response.ok` was false (404/403/5xx). |
| `parse-failed` | unknown | 2xx body that is not JSON — **HTML 404 / SPA fallback served for manifest.json**. |
| `missing-loaded-generated-at` | unknown | **Loaded** copy lacks `generated_at` while the live copy has it — loaded metadata not captured/preserved (WF-FRESHNESS-ROOT-MANIFEST-001). |
| `missing-fetched-generated-at` | unknown | **Live** copy lacks `generated_at` while the loaded copy has it — wrong fetch target (e.g. `firmware/sources.json`, rescue manifest). |
| `missing-both-generated-at` | unknown | Neither copy has a `generated_at` string. |
| `invalid-generated-at` | unknown | `generated_at` present but not a parseable timestamp. |
| `compare-failed` | unknown | Defensive — the timestamp comparison itself threw. |
| `same-or-newer` | current | Loaded build is the latest published. |
| `stale` | stale | A newer manifest is published (hard block). |

### Where the code is surfaced
- **Setup checks** — the `manifest-freshness` preflight row carries
  `data-freshness-reason="<code>"` and a visible
  `[data-freshness-reason-code]` line ("Diagnostic code: …") so support can read
  the cause without a debugger, in both Simple and Advanced install.
- **Install-readiness broadcast** — `readiness.freshness.reason`, consumed by the
  Simple hero and available to any diagnostics consumer.

### How to read the live cause
Open **Setup checks** on the live Simple install (or Advanced install) when the
freshness state is unknown, and read the diagnostic code:
- `parse-failed` ⇒ the recheck is getting HTML, not the manifest (Pages route /
  case / CDN issue). Verify `…/WebFlash/manifest.json` returns JSON directly.
- `http-error` ⇒ the manifest URL is returning non-2xx (check the deployed path).
- `fetch-failed` ⇒ network / CSP `connect-src` (manifest is same-origin, so this
  should be rare on Pages).
- `missing-loaded-generated-at` ⇒ the loaded metadata was not captured/preserved
  (WF-FRESHNESS-ROOT-MANIFEST-001 fix: `loadManifestData()` now calls
  `captureManifestMetadata()` on every successful load and clears it on a failed
  load). HAR capture confirmed the live `/WebFlash/manifest.json` is valid JSON
  with a top-level `generated_at`, so this is a loaded-side bug, **not** a bad
  published manifest.
- `missing-fetched-generated-at` ⇒ the recheck reached JSON that is not the root
  manifest (wrong target). Verify `…/WebFlash/manifest.json` is what's fetched.
- `missing-both-generated-at` / `invalid-generated-at` ⇒ a manifest-pipeline
  metadata regression (should be caught by the manifest-health guard before
  deploy).

---

## What WF-UX-017 does **not** change

No firmware binary, `manifest.json`, `firmware-*.json`, `firmware/sources.json`,
`REQUIRED_CONFIGS`, `scripts/data/kits.json`, release-channel policy, provenance
verification, stable/preview channel rules, or the TRIAC warning policy. The
service-worker **fetch strategy** is unchanged (only a misleading comment was
corrected and `CACHE_NAME` bumped to re-prime the changed app shell). Advanced
install keeps the full freshness diagnostics and the acknowledgement gate. Stale
and SW-update-waiting remain hard blocks in both modes.
