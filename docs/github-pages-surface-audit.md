# GitHub Pages Surface Audit

WF-CLEANUP-008. Audit-only. No frontend, service-worker, manifest, workflow,
script, test, or source-importer behavior was changed by this PR.

## Current source of truth

Per WF-CLEANUP-001 through WF-CLEANUP-007, the repo's ship-ready state is:

| Item | Value |
| --- | --- |
| Release-One config | `Ceiling-POE-VentIQ-RoomIQ` |
| Release-One asset | `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` (1,087,488 B) |
| Rescue asset | `Sense360-Rescue-v1.0.0-rescue.bin` (524,288 B) |
| `REQUIRED_CONFIGS` (allowlist in `firmware-publish.yml:211-214`) | `Ceiling-POE-VentIQ-RoomIQ`, `Rescue` |
| `firmware/sources.json` `block_tokens` | `["FanTRIAC", "LED"]` |
| Firmware source | `sense360store/esphome-public` release `v1.0.0` |
| Repo `manifest.json` `source_commit` | `31e0928fbf3a87bd10b4cca42e949c86500356cd` |
| Repo `manifest.json` `generated_at` | `2026-05-13T14:22:17.239284+00:00` |
| Repo `sw.js` `CACHE_NAME` | `webflash-v5` |
| Audit branch | `claude/audit-github-pages-hSm5Z` (HEAD `31aa96f`) |

## Audit method

1. Re-read the local generated manifests, firmware directory, service
   worker, deployment workflow, deploy-time smoke test, the wizard's
   manifest-matching and direct-install URL handling, the SW-update
   service, and the manifest-freshness service.
2. Local `grep` sweep for stale config strings (`Ceiling-POE-AirIQ`,
   `Ceiling-POE-VentIQ`, `Ceiling-PWR-AirIQ`, `Ceiling-USB`,
   `Ceiling-USB-AirIQ`, `Ceiling-USB-FanPWM`, `Ceiling-Voice-POE-AirIQ`,
   `Ceiling-Voice-USB`, `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`), the
   `FanTRIAC` and `LED Ring` tokens, and SW cache-name drift.
3. Fetched the live GitHub Pages origin `https://sense360store.github.io/WebFlash/`
   on 2026-05-13 17:36 UTC and compared `manifest.json`, `firmware-*.json`,
   `sw.js`, and the root HTML to the repo's tree at HEAD. HEAD-checked
   firmware binary URLs (current and known-stale) to see what the live
   site still serves and what 404s. Tests intentionally retain legacy
   config_string fixtures (`Ceiling-POE-AirIQ`, `Ceiling-USB`, etc.) so
   `__tests__/` hits were filtered out of the "stale" classification —
   they are recorded under `legacy/reference`.
4. Walked the wizard's stale-share-link behavior in
   `scripts/compat-config.js`, `scripts/utils/url-config.js`, and
   `scripts/state.js` to confirm that an old share URL fails gracefully
   instead of silently succeeding at flash time.
5. Ran the available validation commands. `npm test` could not execute
   locally (no `node_modules` in this environment); the CI workflow runs
   `npm ci --no-audit --no-fund && npm test -- --ci`, see
   `firmware-publish.yml:44-47`. `node scripts/validate-naming-policy.js
   firmware/configurations` **passed**. `python3 scripts/gen-manifests.py
   --summary --dry-run --mode development` failed locally because the
   `cryptography` C extension is not installed in this environment;
   `firmware-publish.yml:91-99` installs it in CI.

## Local static assets

| Asset | State |
| --- | --- |
| `manifest.json` | 2 builds: `Ceiling-POE-VentIQ-RoomIQ` (stable application, dev key `dev-2026-01`, 1,087,488 B) and `Rescue` (rescue channel, 524,288 B). Signed with the in-tree dev key — production CI overrides with `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` per `firmware-publish.yml:101-126`. |
| `firmware-0.json` | Points at `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin`. Matches the corresponding entry in `manifest.json`. |
| `firmware-1.json` | Points at `firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin`. Matches the corresponding entry in `manifest.json`. |
| `firmware/configurations/` | Exactly one `.bin` + one `.meta.json` for `Ceiling-POE-VentIQ-RoomIQ`. No orphan FanTRIAC binary. |
| `firmware/rescue/` | One bin + a per-product `manifest.json`. |
| `firmware/sources.json` | One source (`sense360store/esphome-public` v1.0.0), `block_tokens: ["FanTRIAC", "LED"]`. |
| `sw.js` | `CACHE_NAME = 'webflash-v5'`. Network-first for `*.bin` and `manifest.json`; stale-while-revalidate for the app shell. Precaches `manifest.json`, the rescue bin, the app shell, and every wizard script. Activate handler purges any `webflash-*` cache that isn't the current name. |
| `_headers` | Per its own header comment (`_headers:3-10`) GitHub Pages **ignores** this file. The aggressive `Cache-Control: max-age=31536000` rule on `*.bin` therefore has no effect on the deployed site. The CSP fallback lives in `index.html`'s `<meta http-equiv="Content-Security-Policy">`. |
| `index.html` | Title `Sense360 Firmware Installer`. References CSS via `?v=20260506` cachebuster. Loads ESP Web Tools from `https://unpkg.com/esp-web-tools@10/dist/web/install-button.js`. No `firmware-*.json` is referenced directly from the document — they are constructed at runtime by the wizard. |
| `scripts/services/manifest-freshness.js` | Re-fetches `manifest.json` with `cache: 'no-store'`, compares `generated_at`, and produces a `'current' / 'stale' / 'unknown'` verdict. |
| `scripts/services/sw-update.js` | Tracks waiting SW; exposes `triggerSkipWaitingAndReload()`. The activate handler in `sw.js` only purges caches that already start with `webflash-`. |
| `scripts/layout/freshness-banner.js` | Gates install: SW update available (block) > manifest `'stale'` (block) > SW update dismissed (warn) > manifest `'unknown'` (warn). |
| `scripts/compat-config.js` | Direct-install URL path. On no-manifest-match calls `renderNoMatch()` ("Firmware Not Found" + the requested config_string + channel). Loads `manifest.json` with `cache: 'no-store'`. |
| `scripts/utils/url-config.js` | URL parser. Still accepts legacy aliases (`pwr` → `ac`, `airiqpro`/`airiqprov` → `ventiq`, `bathroomairiq*` → `ventiq`, `fan=triac` → `FanTRIAC` segment, etc.) so old share links resolve to a `configKey`. The resulting key then either matches a build in the live manifest or falls through to the no-match UI. |
| `scripts/state.js` | Wizard-flow path. `groupBuildsByConfig` + `manifestConfigStringLookup` are built from `build.config_string`; no-match falls through to `buildNotAvailableStatusMessage()` which surfaces nearby-config suggestions (`state.js:5934-5953`). |
| `scripts/data/kits.json` | 6 of 7 kit definitions reference stale `firmware_config_string` values (`Ceiling-POE-AirIQ`, `Ceiling-USB-AirIQ`, `Ceiling-PWR-AirIQ`, `Ceiling-USB`, `Ceiling-USB-FanPWM`, `Ceiling-POE-VentIQ`). Today these resolve against the live (stale) manifest; after the next deploy they will not resolve and the `kit-config` loader is documented to reject entries that don't resolve (`README.md:92`). |
| `scripts/smoke-test-deployment.py` | `DEFAULT_REQUIRED_CONFIG = "Ceiling-POE-VentIQ-FanTRIAC-RoomIQ"` (line 42). The CI step in `firmware-publish.yml:289-291` does **not** pass `--required-config`, so the default is what runs. Header docstring lines 15-17 also still cite the FanTRIAC config. |

## Live Pages assets

Live origin: `https://sense360store.github.io/WebFlash/`. Captured
2026-05-13 17:36 UTC. The live site reflects an **older commit than the
repo HEAD**:

| Field | Live | Repo HEAD |
| --- | --- | --- |
| `manifest.json` `source_commit` | `821e33017df5e66f812cf0d570800f73c083de15` | `31e0928fbf3a87bd10b4cca42e949c86500356cd` |
| `manifest.json` `generated_at` | `2026-05-07T10:52:31.767518+00:00` | `2026-05-13T14:22:17.239284+00:00` |
| `manifest.json` `builds[]` count | 16 (across 10 distinct config_strings) | 2 |
| `firmware-*.json` files served | `firmware-0.json` … `firmware-15.json` | `firmware-0.json`, `firmware-1.json` |
| `sw.js` `CACHE_NAME` | `webflash-v5` (matches repo) | `webflash-v5` |
| Root page `<title>` | `Sense360 Firmware Installer` (matches smoke-test expected) | `Sense360 Firmware Installer` |
| Response `Cache-Control` (all assets) | `max-age=600` (GitHub Pages default; `_headers` is ignored) | n/a |

The live `821e3301…` commit predates WF-CLEANUP-002 through WF-CLEANUP-006
(visible on this branch ahead of `origin/main`). The repo's
`Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` (the current
Release-One asset) **404s** on the live site — it has not yet been
deployed.

### Live manifest configuration coverage

10 distinct `config_string` values in live `manifest.json`:

| Config string | In live manifest? | In repo manifest? | In `REQUIRED_CONFIGS`? |
| --- | :---: | :---: | :---: |
| `Ceiling-POE-AirIQ` | ✅ (5 builds, all stable/beta) | ❌ | ❌ |
| `Ceiling-POE-VentIQ` | ✅ (1) | ❌ | ❌ |
| `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` | ✅ (1) | ❌ | ❌ |
| `Ceiling-PWR-AirIQ` | ✅ (3) | ❌ | ❌ |
| `Ceiling-USB` | ✅ (1) | ❌ | ❌ |
| `Ceiling-USB-AirIQ` | ✅ (1) | ❌ | ❌ |
| `Ceiling-USB-FanPWM` | ✅ (1) | ❌ | ❌ |
| `Ceiling-Voice-POE-AirIQ` | ✅ (1) | ❌ | ❌ |
| `Ceiling-Voice-USB` | ✅ (1) | ❌ | ❌ |
| `Ceiling-POE-VentIQ-RoomIQ` | ❌ | ✅ (build 0, stable) | ✅ |
| `Rescue` | ✅ (1, 524,288 B) | ✅ (build 1) | ✅ |

13 of the 16 live builds report `file_size: 18` — the
`Binary placeholder` stub. `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` (934,736 B)
and `Rescue` (524,288 B) are the only live builds with plausibly real
firmware sizes. All 16 builds are signed with `sense360-prod-2026-02`,
the production key.

### Live firmware binary URL checks

| URL | Status | Size (etag) | Notes |
| --- | :---: | --- | --- |
| `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` | **404** | — | Current Release-One; not yet deployed. |
| `firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin` | 200 | 524,288 B | Matches repo hash. |
| `firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` | 200 | 934,736 B | Orphan FanTRIAC binary that WF-CLEANUP-002 removed from the repo. Still served live. |
| `firmware/configurations/Sense360-Ceiling-POE-VentIQ-v1.0.0-stable.bin` | 200 | 18 B (placeholder) | Stale. |
| `firmware/configurations/Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin` | 200 | 18 B (placeholder) | Stale. |
| `firmware/configurations/Sense360-Ceiling-USB-v1.0.0-stable.bin` | 200 | 18 B (placeholder) | Stale. |
| `firmware-16.json` | 404 | — | Confirms the firmware-N namespace is finite — only the indices present in the deployed artifact serve. |
| `docs/webflash-cleanup-audit.md` | 404 | — | Pages does not serve the repo `docs/` tree (no Jekyll site config in repo root). |

### Live `firmware-*.json` per-product manifests

`firmware-0.json` through `firmware-15.json` are all live. Each is the
standard ESP Web Tools per-product manifest for the corresponding build
index in the live `manifest.json`. Spot-checked:

- `firmware-0.json` → `Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin`,
  `file_size: 18`, signature_key_id `sense360-prod-2026-02`.
- `firmware-1.json` → `Sense360-Ceiling-POE-AirIQ-v1.0.0-stable.bin`,
  `file_size: 18`, `deprecated: true`.
- `firmware-15.json` → `Sense360-Rescue-v1.0.0-rescue.bin`,
  `file_size: 524288`.

After the next deploy from this branch the namespace shrinks to
`firmware-0.json` (Release-One) and `firmware-1.json` (Rescue);
`firmware-2.json` through `firmware-15.json` will return 404.

## Service worker and cache behavior

`sw.js:53` — `CACHE_NAME = 'webflash-v5'`. The activate handler at
`sw.js:163-181` deletes every cache name that starts with `webflash-`
and isn't the current name, so previous installs on `webflash-v1`
through `webflash-v4` are purged on the first activation of v5. The
live `sw.js` already serves v5 — that part of the deploy is current.

Fetch strategies (`sw.js:187-258`):

- `*.bin` and `*manifest.json`: **network-first**, with cache fallback
  only when the network fails. Old firmware/manifest is never silently
  served when the network is healthy.
- App shell (HTML/CSS/JS/icons): **stale-while-revalidate**. Page
  renders from cache and the SW refreshes in the background.

Pages-side caching: GitHub Pages serves every asset with
`Cache-Control: max-age=600` (10 minutes) regardless of the `_headers`
directive on `*.bin`. After deploy, browsers and the Fastly edge that
fronts Pages will continue to hand out the old manifest for up to ~10
minutes — but the wizard's network-first SW + the no-store freshness
re-fetch in `manifest-freshness.js` will both correct that within one
page load once the cache TTL elapses.

The deployed cache pinning surface that does survive across deploys is
the **SW precache** (`STATIC_ASSETS` in `sw.js:60-82`): on an old SW
install the precache contains an old `./manifest.json` and the rescue
bin path. The fetch handler is network-first, so an online browser
never serves the precached manifest; only an offline browser would, and
even then `manifest-freshness.js` will mark the result `'unknown'` and
the install gate will block until acknowledged.

## Manifest and firmware chunk exposure

After the WF-CLEANUP-005 manifest regeneration is deployed, the live
namespace will collapse from 16 to 2 ESP Web Tools per-product
manifests. The repo manifests and per-product files are internally
consistent today:

- Every `parts[].path` in `manifest.json` resolves to a file on disk.
- Every `firmware-N.json` corresponds 1:1 to a `manifest.json` build at
  the same index (confirmed by `__tests__/manifest-health.test.js` —
  the guard added by WF-CLEANUP-006).

The live numbered manifests `firmware-2.json` through `firmware-15.json`
are not referenced by repo code (no Read- or Write-side reference; the
wizard constructs blob URLs at runtime via `createOneOffManifest` in
`compat-config.js:452-512` and the analogous path in `state.js`). They
remain reachable today only because the live Pages artifact still ships
them; the next deploy from this branch will replace the artifact and
they will 404.

## Wizard / URL parameter behavior

The audit traced two stale-link entry paths:

**(a) Direct install via query parameters** (`/?core=core&mount=ceiling&power=poe&airiq=airiq`).
`scripts/utils/url-config.js:39-163` parses params and applies legacy
aliases — `pwr → ac`, `airiqpro/airiqprov → ventiq`, `bathroomairiq*`
variants → `ventiq`, `fan=triac` → `FanTRIAC` config segment, etc.
The result is a canonical `configKey`. `scripts/compat-config.js:670-680`
then filters `manifest.builds` for builds whose `config_string` matches
case-insensitively. On no match, `renderNoMatch()` renders a "Firmware
Not Found" message with the requested config_string and channel
(`compat-config.js:323-360`).

**(b) Wizard selection flow.** `state.js:1304-1342` indexes the loaded
manifest by `config_string` and by parsed module availability. If the
user's wizard selection produces a config_string that has no matching
build, `state.js:5920-5954` constructs a `not-available` status message
with `nearbyConfigStrings` suggestions; the install button stays gated.

Both paths fail gracefully. Old `?fan=triac…` or `?airiq=pro&…` style
share links survive URL parsing, encode to a `FanTRIAC` / `VentIQ`
segment, and then hit the "Firmware Not Found" UI when the manifest
lookup misses. No install attempt fires.

The `?model=…&variant=…` legacy lookup branch (`compat-config.js`
historical model/variant lookup) is retained for older share links
but is no longer reachable from current manifest content (no build has
`model`/`variant` fields). It is `legacy/reference` only.

## Smoke test coverage

`scripts/smoke-test-deployment.py` is read-only HTTP and safe to
inspect, but it does not expose a dry-run / local mode — every check
hits the deployed origin via `urllib.request.urlopen` (`smoke-test-deployment.py:84-96`).
The audit did **not** execute it. The CI step that runs it is
`firmware-publish.yml:262-291`; it passes only `--base-url` and
`--expected-commit`, so every other parameter falls back to module
defaults.

Two defaults are stale:

1. **`DEFAULT_REQUIRED_CONFIG = "Ceiling-POE-VentIQ-FanTRIAC-RoomIQ"`**
   (`smoke-test-deployment.py:42`). The header docstring at lines 15-17
   describes the same value. After the WF-CLEANUP-005 manifest is
   deployed, `check_required_release_one_config()` will fail because
   the new manifest's only stable application build is
   `Ceiling-POE-VentIQ-RoomIQ`. The smoke test will block the deploy
   job's success even though the deploy itself succeeded.

2. **Placeholder-content / placeholder-size checks vs. today's live
   state.** `check_no_stable_placeholder_size()` rejects any stable
   build with `file_size <= 64` (`smoke-test-deployment.py:49,275-298`)
   and `check_no_stable_placeholder_content()` rejects any stable build
   that begins with the bytes `Binary placeholder`
   (`smoke-test-deployment.py:53,301-359`). Today's live manifest has
   13 stable builds at `file_size: 18`, so running this script against
   the live origin **right now** would already fail those checks — the
   script post-dates the deployed manifest. It is consistent with the
   intended post-WF-CLEANUP-005 world.

The defaults for `DEFAULT_PRODUCTION_KEY = "sense360-prod-2026-02"` and
`DEFAULT_INSTALLER_TITLE = "Sense360 Firmware Installer"` match both
the repo manifest and the live root page title, so those checks are
current.

## Cache invalidation / deployment risk

The riskiest cache layer is Fastly / Pages CDN with its 10-minute
`max-age`. After the next deploy:

- Browsers that hit the origin during the propagation window will see
  the old `manifest.json` for up to ~10 minutes. The wizard's
  `manifest-freshness.js` re-fetches with `cache: 'no-store'`, which
  bypasses the SW and asks GitHub for the freshest body — but Fastly
  will still serve from its edge cache for the TTL. The smoke test
  handles this with `--max-attempts 30` × `--retry-delay-seconds 10`
  (= 5 minutes), so the workflow's smoke-test step is generally
  tolerant of CDN lag.
- The SW precache will be replaced the next time the new `sw.js` is
  installed (byte-different from the cached SW), triggering
  `updatefound` and the freshness banner; the user is asked to reload
  before flashing, per `freshness-banner.js:99-110`.
- The 13 stale 18-byte `.bin` files and the orphan FanTRIAC `.bin` will
  stop being part of the deployed artifact and will return 404 from
  the live origin after deploy. Their absence cannot regress the
  install path because nothing in the current manifest references
  them.

Risk surfaces that survive a successful deploy:

- `scripts/data/kits.json` references 6 stale `firmware_config_string`
  values. The `kit-config` loader rejects unresolved entries
  (per `README.md:92`), so those kit cards will silently disappear from
  the wizard once the new manifest lands.
- `scripts/smoke-test-deployment.py` default `--required-config` is
  stale (FanTRIAC). On the very next deploy this will turn a successful
  deploy into a failing workflow run.

## Findings summary

| Surface | Status | Evidence | Recommended action |
| --- | --- | --- | --- |
| Repo `manifest.json` (2 builds; Release-One + Rescue) | current | `manifest.json:11-122`, `source_commit 31e0928`, `generated_at 2026-05-13T14:22:17` | none |
| Repo `firmware-0.json` / `firmware-1.json` | current | `firmware-0.json:13`, `firmware-1.json:13` — both `parts[].path` resolve to on-disk binaries | none |
| Repo `firmware/configurations/` (1 bin + 1 meta) | current | 1,087,488 B `.bin`, naming-policy passes | none |
| Repo `firmware/rescue/` (1 bin + per-product manifest) | current | 524,288 B `.bin` | none |
| Repo `firmware/sources.json` (`block_tokens: ["FanTRIAC","LED"]`) | current | `firmware/sources.json:26-29` | none |
| Repo `sw.js` (CACHE_NAME `webflash-v5`, network-first for bins/manifest) | current | `sw.js:53`, `sw.js:187-258` | none |
| Repo `sw.js` precache list (rescue bin, manifests, app shell) | current | `sw.js:60-135` | none |
| Repo wizard stale-link UX (direct-install URL path) | current | `scripts/compat-config.js:323-360`, `:670-695` — graceful "Firmware Not Found" | none |
| Repo wizard stale-link UX (wizard-flow path) | current | `scripts/state.js:5920-5954` — `buildNotAvailableStatusMessage` with `nearbyConfigStrings` | none |
| Repo `scripts/utils/url-config.js` legacy aliases (`pwr`, `airiqpro`, `bathroomairiq*`, `fan=triac`, …) | legacy/reference | `scripts/utils/url-config.js:39-163` — accepts old tokens, encodes to canonical segments; downstream "no match" is graceful | none — kept on purpose so old share links don't 4xx |
| Repo `manifest-freshness.js` (`cache: 'no-store'` re-fetch) | current | `scripts/services/manifest-freshness.js:56-103` | none |
| Repo `freshness-banner.js` (install gating on SW update / stale manifest) | current | `scripts/layout/freshness-banner.js:99-146` | none |
| Repo `_headers` (Cache-Control directives) | legacy/reference | `_headers:3-10` (file admits Pages ignores it) | none — kept for future Netlify/Cloudflare parity |
| Repo `.github/workflows/firmware-publish.yml` `REQUIRED_CONFIGS` (2 entries) | current | `firmware-publish.yml:211-214` | none |
| Live `sw.js` (CACHE_NAME `webflash-v5`, matches repo) | current | live `curl -s …/sw.js`, `last-modified 2026-05-07` | none — already current; will pick up the new precache list on next deploy |
| Live root `<title>` `Sense360 Firmware Installer` | current | live root HTML | none |
| Live `Sense360-Rescue-v1.0.0-rescue.bin` | current | live HEAD `200`, `etag 69fc6f02-80000` (= 524,288 B) | none |
| Live `manifest.json` (16 builds, `source_commit 821e3301`, `generated_at 2026-05-07`) | stale | live `WebFetch` of `manifest.json` | resolves automatically on the next merge-to-main + deploy from this branch; no action needed |
| Live `firmware-2.json` … `firmware-15.json` | stale | live `curl firmware-15.json` returns `Sense360-Rescue` build; the index range belongs to the May-7 deploy | resolves on next deploy (artifact replacement) |
| Live `Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin` (934,736 B, real) | stale | live HEAD `200`, `etag 69fc6f02-e4350` | resolves on next deploy (artifact no longer contains the file) |
| Live `Sense360-Ceiling-POE-VentIQ-v1.0.0-stable.bin`, `Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin`, `Sense360-Ceiling-USB-v1.0.0-stable.bin`, and 10 more 18-byte placeholders | stale | live HEAD `200`, etag `69fc6f02-12` (= 18 bytes) | resolves on next deploy |
| Live `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin` (current Release-One) | stale (missing) | live HEAD `404` | resolves on next deploy |
| `scripts/smoke-test-deployment.py:42` `DEFAULT_REQUIRED_CONFIG = "Ceiling-POE-VentIQ-FanTRIAC-RoomIQ"` | needs-smoke-test-fix | the CI step at `firmware-publish.yml:289-291` doesn't pass `--required-config`, so the default runs in CI; after next deploy the required config check will fail because the new manifest only contains `Ceiling-POE-VentIQ-RoomIQ` | follow-up: either (a) update the constant to `Ceiling-POE-VentIQ-RoomIQ` (and the docstring at lines 15-17), or (b) pass `--required-config "${{ vars.REQUIRED_CONFIG }}"` from the workflow — sequenced as a separate PR |
| `scripts/data/kits.json` references 6 stale `firmware_config_string` values | needs-UX-fix (post-deploy) | `scripts/data/kits.json:35,62,90,116,143,171` | after the next deploy these kits will silently disappear from the wizard (kit-config loader drops unresolved entries). Decide whether to (a) prune the kit definitions, (b) point them at `Ceiling-POE-VentIQ-RoomIQ`, or (c) wait until additional configs are re-imported — sequenced as a separate PR |
| `CLAUDE.md:125` says "Service worker cache name is `webflash-v1`" | stale (doc-drift) | `CLAUDE.md:125` vs `sw.js:53` | record only; pick up in WF-CLEANUP-007 follow-up |
| `CLAUDE.md:105` says `REQUIRED_CONFIGS` "holds 9 entries" and lists the 9 stale configs | stale (doc-drift) | `CLAUDE.md:105` vs `firmware-publish.yml:211-214` (now 2 entries) | record only; pick up in WF-CLEANUP-007 follow-up |
| `CLAUDE.md:76,95,109` use `Ceiling-POE-AirIQ` as the worked example | legacy/reference | example illustrates parsing/encoding; the token is still a valid filename token (just no longer shipped) | none |
| `README.md:92,176` use `Ceiling-POE-AirIQ` as an example config | legacy/reference | same rationale as above | none |
| `README.md:697` claims `CACHE_NAME` is `webflash-v4` | stale (doc-drift) | sw.js is on v5 | record only; pick up in WF-CLEANUP-007 follow-up |
| `DEVELOPER.md:350,358,383,389` walk through `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` as the import example | stale (doc-drift) | the orphan FanTRIAC binary was removed in WF-CLEANUP-002 | record only; pick up in WF-CLEANUP-007 follow-up |
| `DEVELOPER.md:131,165,651` list `FanTRIAC` and `LED` as allowed canonical token forms | legacy/reference | the importer gates with `block_tokens`, but the naming policy still accepts the tokens for filenames; this is intentional so a future un-block can re-publish without renaming | none |
| `FIRMWARE-DISTRIBUTION-REVIEW.md:111,220` reference legacy AirIQPro / FanPWM filenames | legacy/reference | document is a historical distribution review, not a runtime contract | none |
| `scripts/layout/state-summary.js:56` label `"LED Ring"` | legacy/reference | UI summary row label; module key is `led`. The S360-300 canonical name is "Sense360 LED" per `CLAUDE.md:29` but the wizard summary label is independent | none |
| `__tests__/**` references to legacy config_strings | legacy/reference | intentional test fixtures — out of scope for this PR | none |
| Pages CDN `Cache-Control: max-age=600` on every asset (incl. firmware bins) | current (Pages default) | live response headers; `_headers` is ignored on Pages | none — wizard's network-first SW + freshness re-fetch absorb the ≤10 min staleness window |
| Repo `docs/` tree not served by Pages | current (Jekyll not configured) | live HEAD `docs/webflash-cleanup-audit.md` returns `404` | none |

## Recommended follow-up PRs

1. **WF-CLEANUP-009 — Fix the deploy-time smoke test.**
   Update `scripts/smoke-test-deployment.py:42` (`DEFAULT_REQUIRED_CONFIG`)
   and the docstring at lines 15-17 to `Ceiling-POE-VentIQ-RoomIQ`, or
   thread `--required-config` through `firmware-publish.yml:289-291`
   from a workflow var. Without this, the very next successful deploy
   will be followed by a failing smoke-test job that says the
   release-one config is missing — even though the deploy itself is
   correct. **High priority** — would land before the next deploy.

   **Resolved (WF-CLEANUP-009):** `DEFAULT_REQUIRED_CONFIG` is now
   `Ceiling-POE-VentIQ-RoomIQ`, the docstring no longer cites the
   FanTRIAC target, and `__tests__/python/test_smoke_test_deployment.py`
   pins the default against drift (asserts the constant, the absence of
   any `FanTRIAC` reference in the smoke-test script, and that the
   default is one of the workflow's `REQUIRED_CONFIGS` entries).

2. **WF-CLEANUP-010 — Prune or re-point stale kit definitions in
   `scripts/data/kits.json`.** After the next deploy, the 6 kit cards
   that reference legacy configs will silently disappear from the
   wizard (kit-config loader rejects unresolved entries). Decide
   whether to delete those kits, point them at
   `Ceiling-POE-VentIQ-RoomIQ`, or leave them inert until additional
   configs are re-imported. Lower priority than (1) because the
   regression is silent rather than CI-blocking.

3. **WF-CLEANUP-007 (continuation) — Doc-drift fixes.** Pick up the
   doc-drift findings recorded in the table above (`CLAUDE.md:105`
   REQUIRED_CONFIGS enumeration, `CLAUDE.md:125` cache-name,
   `README.md:697` cache-name, `DEVELOPER.md` FanTRIAC import
   walkthrough). No runtime effect — informational.

4. **Trigger a deploy.** Once the cleanup commits on this branch are
   merged into `main`, the `firmware-publish.yml` workflow will rebuild
   the Pages artifact and replace the live `manifest.json`,
   `firmware-*.json`, and `firmware/configurations/` tree. This audit
   identifies no blockers in the repo state for that deploy beyond
   item (1) — the smoke-test job will fail on the FanTRIAC default
   unless that PR lands first or is sequenced together.

## Do-not-change list

Per the WF-CLEANUP-008 brief, this PR did not edit any of:

- `firmware/configurations/*.bin`, `firmware/configurations/*.meta.json`
- `firmware/rescue/*`
- `firmware/sources.json`
- `manifest.json`, `firmware-*.json`
- `scripts/*`, `src/*` (no `src/` exists), `public/*` (no `public/` exists)
- `sw.js`, `index.html`, `_headers`
- `.github/workflows/*`
- `__tests__/*`
- Pre-existing `docs/*.md` files (`webflash-cleanup-audit.md`,
  `webflash-required-configs-cleanup.md`, `firmware-import.md`,
  `ux-roadmap.md`, `pr-comment.md`)

The single change is the addition of this file:

- `docs/github-pages-surface-audit.md` (new)

No frontend, service-worker, deploy-workflow, smoke-test, manifest-
generation, signing, source-importer, config-string-parsing, or
`REQUIRED_CONFIGS` behavior was modified. The current Release-One
import, Rescue firmware, FanTRIAC blocked status, and LED exclusion
status are unchanged.

## WF-CLEANUP-010 update

WF-CLEANUP-010 resolves the kit-catalog risk that this audit recorded as
"needs-UX-fix (post-deploy)". The findings-table row at line 331 and the
recommended-follow-up item 2 at lines 356-363 (`Prune or re-point stale
kit definitions in scripts/data/kits.json`) are addressed: the 6 stale
sample kits in `scripts/data/kits.json` are removed and replaced with a
single Release-One sample (`S360-KIT-CEILING-VENTIQ-ROOMIQ-POE`) that
maps to `Ceiling-POE-VentIQ-RoomIQ`. After this PR merges the
post-deploy regression described in the original audit ("kit cards will
silently disappear from the wizard") cannot happen — only one kit
remains and it resolves against the cleaned manifest.

The brief's other two follow-ups recorded in this audit are unchanged
by WF-CLEANUP-010:

* **WF-CLEANUP-009** (smoke-test default config) — still outstanding;
  not touched here.
* **WF-CLEANUP-007 (continuation) — doc-drift fixes** — still
  outstanding; not touched here.

Scope of WF-CLEANUP-010 — what changed and what did not:

* **Changed:** `scripts/data/kits.json` (6 stale samples → 1
  Release-One sample), `__tests__/kits-json.test.js` (three new guards
  preventing kit-to-manifest drift), `docs/webflash-cleanup-audit.md`,
  `docs/webflash-required-configs-cleanup.md`, and this document.
* **Unchanged:** every `firmware/configurations/*.bin` and
  `*.meta.json`, `firmware/rescue/*`, `firmware/sources.json`,
  `manifest.json`, every `firmware-*.json`, `.github/workflows/*`,
  `scripts/gen-manifests.py`, `scripts/import-firmware-sources.py`,
  `scripts/validate-naming-policy.js`, `scripts/utils/kit-config.js`,
  `sw.js`, `index.html`, and the wizard frontend. No manifest,
  signing, deploy-workflow, smoke-test, importer, service-worker,
  Release-One, Rescue, FanTRIAC blocked, or LED-excluded status
  changes.

## WF-LED-003 update

This audit's snapshot pre-dates WF-LED-002 / WF-LED-003. The
deployed-surface state described in the "Local static assets" /
"Live Pages assets" / "Manifest and firmware chunk exposure" sections
above reflects the 2-build repo manifest (Release-One stable + Rescue)
and the older live deployment, neither of which include the LED
preview.

After WF-LED-002 the **repo** manifest holds 3 builds (Release-One
stable, LED preview, Rescue); the corresponding `firmware-*.json`
namespace is `firmware-0.json` (Release-One) / `firmware-1.json` (LED
preview) / `firmware-2.json` (Rescue). The **`REQUIRED_CONFIGS`
allowlist** in `.github/workflows/firmware-publish.yml` remains exactly
`["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]` — production-only.
`scripts/data/kits.json` remains Release-One-only.

WF-LED-003 records the deliberate UX decision for the LED preview that
WF-LED-002 imported: **Option A — manifest-only preview, no new kit,
no new mode toggle, no wizard / `sw.js` / `index.html` / workflow
change.** The exposure mechanism is the existing release-channel gate
in `scripts/utils/release-channels.js` (preview badge, experimental-
build warning copy, `channel:preview` acknowledgement, `defaultSelectable: false`)
combined with the existing LED module toggle wired into the wizard
(`index.html` step 4, `state.js`'s `MODULE_KEYS` /
`MODULE_SEGMENT_FORMATTERS` / `parseConfigStringState`, and
`module-requirements.js`). No `?mode=preview` is introduced;
`state.js`'s `VALID_RELEASE_MODES` stays `normal` / `recovery` /
`development`.

Implication for the **next deploy** from this branch: once
`firmware-publish.yml` runs on a commit that includes WF-LED-002's
manifest regeneration, the live Pages artifact will replace the older
16-build manifest namespace with the current 3-build manifest. The
deployed-surface findings table above (the Live Pages assets section)
becomes stale as soon as that deploy lands; refresh the live
`manifest.json` / `firmware-*.json` / `Sense360-…-LED-v1.0.0-preview.bin`
HEAD checks against the new artifact at that time. Until the deploy
runs, the live origin continues to serve the older 16-build artifact
captured in this audit; the smoke-test follow-up recorded in
"Recommended follow-up PRs" → WF-CLEANUP-009 (which was resolved by
that PR) remains the only blocker for the deploy.

WF-LED-003 itself changes no deployed-surface behaviour: no
`firmware/configurations/*` change, no `manifest.json` regeneration,
no `firmware-*.json` regeneration, no `sw.js` change, no `index.html`
change, no workflow change, no signing operation. The single repo
changes are doc text updates (this document plus
`docs/led-preview-import-plan.md` / `docs/firmware-import.md` /
`docs/webflash-cleanup-audit.md` / `docs/webflash-required-configs-cleanup.md` /
`CLAUDE.md` / `DEVELOPER.md`) and one new policy-level test describe
block in `__tests__/release-channel-ui.test.js`. Stable Release-One
behaviour, FanTRIAC blocked status, the production-only
`REQUIRED_CONFIGS` allowlist, and the Release-One-only kit catalog
are all unchanged.

## WF-DEPLOY-001 update — root cause of the May-7 stale deploy

The previous sections of this audit recorded the symptom (live
`manifest.json` stuck at `source_commit 821e33017df5e66f812cf0d570800f73c083de15`
from `2026-05-07T10:52:31.767518+00:00`) and assumed the next merge to
`main` would self-correct via the existing `firmware-publish.yml`
deploy chain. WF-DEPLOY-001 found the *reason* every subsequent merge
failed to deploy and unblocks the chain.

### Diagnosis

1. GitHub Pages is configured to use the **Actions source**
   (`actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4` at
   `firmware-publish.yml:235-261`). No `gh-pages` branch exists in the
   repo (verified via `mcp__github__list_branches`), so there is no
   alternate branch-source publication path.
2. The `firmware-publish.yml` workflow **is** triggering on every merge
   to `main` whose file changes match the `on.push.paths` filter
   (`firmware/**`, `manifest.json`, `firmware-*.json`, `index.html`,
   `*.js`, `scripts/**`, `css/**`, `*.png`, `_headers`,
   `.github/workflows/firmware-publish.yml`). The Actions UI shows runs
   against #418 / #415 / #410 / #409 / #405 / #404 / #402 / #400.
3. The `firmware-publish.yml` **badge for branch `main` reads
   `failing`**. The most recent run on `fbe83f7` fails at the `test`
   job → "Run unit tests" step with `Process completed with exit code 1`.
   Because `build` `needs: test`, `build` is skipped, no Pages artifact
   is uploaded, and `deploy` does not run. The live origin therefore
   keeps serving the last successful artifact — the May-7 deploy at
   `source_commit 821e3301…`.
4. Reproduced locally:

   ```
   FAIL __tests__/firmware-provenance.test.js
     ● manifest.json — provenance integration › at least one build is
       marked deprecated to exercise the dropdown skip
       Expected: > 0
       Received:   0

   Test Suites: 1 failed, 55 passed, 56 total
   Tests:       1 failed, 796 passed, 797 total
   ```

   The failing assertion at `__tests__/firmware-provenance.test.js:584-587`
   required at least one `manifest.builds[].deprecated === true` entry —
   a stale historical assumption from the 16-build legacy manifest,
   where shadowed older AirIQ/PWR stable versions carried
   `deprecated: true`. After WF-CLEANUP-005 regenerated the manifest
   down to 2 builds (and WF-LED-002 added the LED preview as build 3),
   none of Release-One stable / LED preview / Rescue are deprecated,
   and the assertion has been blocking every CI run since.

### Resolution

WF-DEPLOY-001 makes four focused changes:

* **`__tests__/firmware-provenance.test.js`** — the stale
  deprecated-build assertion at lines 584-587 is removed outright. The
  wizard's deprecated-build skip behavior is covered by synthetic
  fixtures elsewhere in the same file (the
  `validateFirmwareProvenance` cases driven by `VALID_STABLE_BUILD`);
  it is not a contract the production manifest needs to satisfy. The
  assertion is *not* replaced with a softer structural check —
  weakening it would just add noise without protecting anything.
* **`__tests__/github-pages-surface.test.js`** (new, network-free) —
  pins the deploy contract so a future cleanup or import cannot
  silently break the same shape again: exactly 3 builds in
  `manifest.json`; `source_commit` is not the known-bad May-7 SHA;
  `Ceiling-POE-VentIQ-RoomIQ` is present as `stable` + non-deprecated;
  `Ceiling-POE-VentIQ-RoomIQ-LED` is present as `preview` +
  non-deprecated; `Rescue` is on the `rescue` channel; no FanTRIAC
  segment; no legacy AirIQ / PWR / USB / Voice config_strings; every
  build's `parts[].path` resolves to an on-disk file; the
  `firmware-N.json` namespace is `firmware-0/1/2.json` only (no stale
  higher indices); `REQUIRED_CONFIGS` is exactly
  `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`; LED preview is **not** in
  `REQUIRED_CONFIGS`. Live-origin verification continues to live in
  `scripts/smoke-test-deployment.py` post-deploy.
* **`index.html`** — bumps the static cache-buster query strings on
  `wizard-style.css` and `layout.css` from `?v=20260506` / `?v=20260501`
  to `?v=20260515`. `index.html` is in the workflow's `on.push.paths`
  filter; `__tests__/` and `docs/` are not, so a tests-and-docs-only
  PR would not trigger `firmware-publish.yml` on merge. The bump
  guarantees this PR's merge triggers a deploy, and conveniently
  invalidates any browser/Pages CDN cache for the CSS once the new
  artifact is live. **No markup or runtime wizard behavior changes
  accompany this bump.**
* **This file** — appended this section recording the diagnostic
  outcome, the fix, and the live-origin expectation after merge.

WF-DEPLOY-001 deliberately does **not** touch
`firmware/configurations/*`, `firmware/rescue/*`,
`firmware/sources.json`, `manifest.json`, any `firmware-*.json`,
`scripts/data/kits.json`, `scripts/state.js`,
`scripts/utils/release-channels.js`, any other wizard script, `sw.js`,
`_headers`, `.github/workflows/*`, `scripts/smoke-test-deployment.py`,
or `REQUIRED_CONFIGS`. The repo state is already correct (3 builds,
current source_commit, no FanTRIAC, LED on preview). The only thing
blocking the deploy was the stale test assertion.

### Live-origin expectation after merge

Once this PR merges to `main`, `firmware-publish.yml` should run to
green:

1. `test` job passes (the stale assertion is gone, the other 796 tests
   were already passing locally).
2. `build` job runs `gen-manifests.py` in
   `--mode production` (assumes `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` is
   still configured in Actions secrets, as evidenced by the May-7
   manifest having been signed with `sense360-prod-2026-02`).
   `REQUIRED_CONFIGS` assertion passes (`Ceiling-POE-VentIQ-RoomIQ`
   and `Rescue` are both in the manifest). Pages artifact uploads.
3. `deploy` job runs `actions/deploy-pages@v4`. The live origin's
   `manifest.json` flips to the new commit's `source_commit`.
4. `smoke-test` job runs `scripts/smoke-test-deployment.py`. With the
   production signing secret still set, this passes. If the secret has
   been removed since the May-7 deploy, the smoke test will fail on
   `check_no_stable_uses_blocked_key` / `check_production_key_in_use`
   — that is an Actions environment/secrets issue to fix in repo
   settings, not something WF-DEPLOY-001 papers over by weakening the
   smoke-test signing checks.

Manual verification after the deploy job goes green:

```bash
curl -s https://sense360store.github.io/WebFlash/manifest.json \
  | python3 -c 'import json, sys; m = json.load(sys.stdin); \
    print(m["source_commit"]); \
    print(*sorted({(b["channel"], b["config_string"]) for b in m["builds"]}), sep="\n")'

# Expected — the new merge SHA (not 821e3301...) followed by exactly
# three (channel, config_string) tuples:
#   ('preview', 'Ceiling-POE-VentIQ-RoomIQ-LED')
#   ('rescue',  'Rescue')
#   ('stable',  'Ceiling-POE-VentIQ-RoomIQ')

# Current Release-One bin: 200
curl -sI https://sense360store.github.io/WebFlash/firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.0-stable.bin
# LED preview bin: 200
curl -sI https://sense360store.github.io/WebFlash/firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.0-preview.bin
# Orphan FanTRIAC bin: 404 (was 200 on the May-7 artifact)
curl -sI https://sense360store.github.io/WebFlash/firmware/configurations/Sense360-Ceiling-POE-VentIQ-FanTRIAC-RoomIQ-v1.0.0-stable.bin
```

The live `sw.js` does not need any change. It already serves the
correct cache strategy (`CACHE_NAME = 'webflash-v5'`, network-first
for `*.bin` and `manifest.json`) and the activate handler purges any
previous `webflash-*` caches. The page-side `manifest-freshness.js`
re-fetches `manifest.json` with `cache: 'no-store'` before flashing,
which bypasses both the SW and the Pages CDN cache, so users at the
moment of deploy will see the new manifest within one page load.

### What WF-DEPLOY-001 does not change

* No `firmware/configurations/*` binary, sidecar, or rescue asset.
* No `firmware/sources.json` source entry or `block_tokens`.
* No `manifest.json` regeneration (the on-disk manifest is already
  correct; `gen-manifests.py` will re-emit an equivalent manifest in
  CI with the new merge `source_commit`).
* No `firmware-0.json` / `firmware-1.json` / `firmware-2.json` edits
  (same reason — CI will re-emit them).
* No `REQUIRED_CONFIGS` change — still `["Ceiling-POE-VentIQ-RoomIQ", "Rescue"]`.
* No kit catalog (`scripts/data/kits.json`) change.
* No wizard / `state.js` / `release-channels.js` / module-requirements
  change.
* No `sw.js` change — cache name stays at `webflash-v5`.
* No `_headers` change.
* No `.github/workflows/*` change.
* No `scripts/smoke-test-deployment.py` change.
* Release-One stable behaviour, LED preview channel, FanTRIAC blocked
  status, and the production-only `REQUIRED_CONFIGS` allowlist are all
  unchanged.

## See also

* [`docs/wizard-ux-roadmap.md`](wizard-ux-roadmap.md) — WF-UX-001
  live-wizard UX audit. Its "Live vs in-repo snapshot" section
  consumes the live-vs-repo delta captured here as the basis for the
  PR roadmap (`WF-UX-QUICK-001` through `WF-UX-007` plus
  `WF-HW-TEST-001`). Refresh that section in lockstep with this audit
  whenever a new deploy lands on GitHub Pages.
