# SECURITY-AUDIT-2026-06 — WebFlash

- **Engagement:** SEC-AUDIT-2026-06 — full defensive security audit from an attacker's perspective.
- **Target:** `sense360store/WebFlash` (PUBLIC). Working tree, full git history (218 commits, all local branches; remote refs fetched; 0 tags), and the live GitHub Pages deployment `https://sense360store.github.io/WebFlash/`.
- **Date:** 2026-06-10. **Method:** manual source review, full-history secret scan, firmware `strings` extraction, live-header inspection, client DOM-sink enumeration. No destructive testing; no hardware flashed.
- **Status:** review branch `security/audit-2026-06`. **No fixes in this PR.**
- **Cross-repo note:** W-H1 originates upstream in `sense360store/esphome-public` (which bakes the secrets at build time); it is reported here because WebFlash is the signing/manifest authority that **distributes** the resulting binaries. See that repo's `docs/security/SECURITY-AUDIT-2026-06.md` (H1).

## Finding counts by severity

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 1 |
| Medium   | 3 |
| Low      | 4 |
| Info     | 4 |

The wizard's **client trust model is well-built**: real Ed25519 verification at the install gate, hardcoded to `production` mode so a URL-selectable release mode cannot relax key acceptance; disciplined HTML escaping with no markdown-to-HTML renderer, no `eval`, and a strict URL allowlist; the production signing key's private half lives only in a CI secret. The material risks are (1) the **shared, predictable credentials baked into the firmware WebFlash serves**, and (2) the fact that the repo's **security headers are not actually enforced on the live GitHub Pages host**, plus a CDN supply-chain exposure and a documented manifest-mapping signature gap.

---

## HIGH

### W-H1 — Shipped stable firmware embeds fixed, shared, predictable credentials
- **Evidence:** `strings` over the served stable binaries `firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.4-stable.bin`, `…-RoomIQ-v1.0.5-stable.bin`, `…-AirIQ-RoomIQ-v1.0.6-stable.bin` each contain the identical run: setup-AP SSID `Sense360_Setup` + AP password `sense360setup`, fallback `sense360fallback`, OTA password `sense360-ota-default`, web/admin password `sense360admin`. (The API encryption key is the upstream all-`a` placeholder, stored as decoded 32-byte material rather than printable text.) Source of the values: upstream `.github/workflows/firmware-build-release.yml:245-252`. These strings are **not** labelled "test" and read as production-grade.
- **Exploitation:** every device flashed with a stable build shares these. An attacker in RF range during provisioning joins `Sense360_Setup` with `sense360setup`; a network-reachable device accepts OTA firmware replacement with `sense360-ota-default` and web-admin login with `admin` / `sense360admin`; the public API key makes the ESPHome native API (tcp/6053) effectively unauthenticated to any LAN peer — full device control including mains relay/TRIAC loads, plus persistent firmware overwrite. WebFlash flashes the prebuilt `.bin` as-is (Improv only sets Wi-Fi), so the customer cannot re-key without recompiling.
- **Remediation (one line):** do not distribute stable builds carrying shared default API/OTA/web/fallback secrets — require per-device secret provisioning upstream and gate the manifest importer to refuse a build whose bytes contain a known default credential string.

---

## MEDIUM

### W-M1 — Security headers (CSP/clickjacking/nosniff/COOP) are not enforced on the live Pages host
- **Evidence:** live `curl -sSI https://sense360store.github.io/WebFlash/` returns only `strict-transport-security` and `access-control-allow-origin: *` — **no** `content-security-policy` header, `x-frame-options`, `x-content-type-options`, `referrer-policy`, `permissions-policy`, `cross-origin-opener-policy`, or `cross-origin-resource-policy`. [`_headers:1-15`](../../_headers) itself documents that GitHub Pages ignores the file (it is Netlify/Cloudflare format). The only enforced policy is the `<meta http-equiv="Content-Security-Policy">` in [`index.html`](../../index.html), and a meta tag **cannot** express `frame-ancestors`, `X-Frame-Options`, COOP/CORP, or `X-Content-Type-Options`.
- **Exploitation:** the installer is framable (no `frame-ancestors`/XFO on the wire), enabling clickjacking/social-engineering around the connect/flash gesture; responses lack `nosniff`. The meta-CSP still blocks inline-script/eval injection (it has no `unsafe-inline`/`unsafe-eval`), so this is primarily a framing/transport-hardening gap, not script execution.
- **Remediation (one line):** front the Pages origin with a CDN that emits the `_headers` set (Cloudflare/Netlify), since GitHub Pages cannot send `frame-ancestors`/XFO/nosniff/COOP from a meta tag.

### W-M2 — esp-web-tools transitive chunks load from unpkg outside SRI coverage
- **Evidence:** [`index.html:63`](../../index.html) pins `https://unpkg.com/esp-web-tools@10.2.1/…/install-button.js?module` with `integrity=sha384-…` + `crossorigin` (good), but that entry module dynamically imports its own chunks and transitive deps (`lit`, `improv-wifi-serial-sdk`) at runtime; SRI cannot cover dynamic imports. The only control on those chunks is the CSP `script-src 'self' https://unpkg.com` (the in-file comment, lines 50-62, already notes this).
- **Exploitation:** a unpkg/CDN compromise (or a malicious `@10.2.1` chunk) executes with full page privileges in the flashing context — it could alter what gets written to the device or exfiltrate Improv-provisioned Wi-Fi credentials — constrained only by the origin-level CSP, not by hash pinning.
- **Remediation (one line):** vendor the full esp-web-tools dependency graph behind `'self'` (self-host the pinned build) so every executed chunk is same-origin and SRI/CSP-covered.

### W-M3 — Manifest-mapping authenticity gap: signatures cover firmware bytes only, not the manifest mapping
- **Evidence:** [`firmware-signing/README.md`](../../firmware-signing/README.md) → *Threat model → Manifest-mapping authenticity gap*; the Ed25519 signature is computed over firmware bytes (`scripts/gen-manifests.py` `sign_firmware_bytes`), and `verifyFirmwarePart` ([`scripts/state.js:4899-4972`](../../scripts/state.js)) verifies bytes ↔ `signature_ed25519`. Nothing signs the binding of `config_string` / `version` / `channel` / `description` / `release_url` to a given build. (The companion `"signature"` field is a non-cryptographic salted-SHA digest — `SIGNATURE_SALT` in `gen-manifests.py` — not an authenticity signature; only `signature_ed25519` is.)
- **Exploitation:** an attacker who can edit the deployed `manifest.json` (e.g. a Pages-deploy or repo compromise) can, without breaking any signature, remap a `config_string` to a different validly-signed build, downgrade a build, flip its displayed channel/description, or point `release_url` elsewhere — defeating the provenance the UI shows. Forging *new* bytes still requires the CI-only production key, so this is a remap/metadata-integrity gap, not arbitrary-firmware injection.
- **Remediation (one line):** extend the signed message to bind the manifest mapping (sign a canonical `{config_string, version, channel, sha256}` tuple, or sign the manifest), closing the documented gap.

---

## LOW

### W-L1 — Ed25519 signing *private* key is committed to the public repo (intentional `test_only`, gate-contingent)
- **Evidence:** [`firmware-signing/keys/dev-2026-01-private.pem`](../../firmware-signing/keys/dev-2026-01-private.pem) (+`.raw.b64`), first added `e4a26e56`. Confirmed a valid keypair (derived public half matches the committed `dev-2026-01-public` = `UAg82k9y…P5OM=`). Marked `status: "test_only"` in [`firmware-signing/trusted-keys.json`](../../firmware-signing/trusted-keys.json); the install gate hardcodes `installTrustMode = 'production'` ([`scripts/state.js:5114-5124`](../../scripts/state.js)) and `verifyFirmwareSignature` refuses `test_only` keys in production mode ([`scripts/utils/firmware-signature.js`](../../scripts/utils/firmware-signature.js)). The production private key is **never** in the repo or history (only its public key `wmKfWDXhpdjQP92/…F99M=` appears).
- **Exploitation:** anyone can sign firmware this key validates. It is harmless **only** while production-mode enforcement holds — if any deployed code path ever verifies in `development`/`test` mode against live data (e.g. a future refactor wiring `?mode=development` into signature acceptance), an attacker forges an installable build with this committed key.
- **Remediation (one line):** keep the production-mode gate under explicit test (it is today), and consider moving the fixture key out of the shipped tree to a CI-only fixture so a mode regression has nothing to forge with.

### W-L2 — `source_url` / `release_url` reach `href` without a scheme allowlist
- **Evidence:** [`scripts/state.js`](../../scripts/state.js) anchor renders (~`:5713`, `:6105`, `:6112`, `:6314`) place manifest-influenced URLs into `href` via `escapeHtml(url)` only. `escapeHtml` blocks attribute breakout but does not validate the URL scheme.
- **Exploitation:** a `javascript:`-scheme value in a compromised manifest survives into an `href`. Mitigated in practice by `target="_blank" rel="noopener noreferrer"` (no auto-execution; needs a click in a new context) and the no-`unsafe-inline` CSP, so this is the one attacker-influenced value reaching an active attribute without scheme checking.
- **Remediation (one line):** allow only `http(s):` URLs before emitting these hrefs (reject/encode others).

### W-L3 — Client diagnostics / flash-history redaction gaps
- **Evidence:** [`scripts/services/diagnostics.js`](../../scripts/services/diagnostics.js) `scrubSensitiveText` (`:141-144`) scrubs file paths/MAC/Bearer tokens but not serial device paths (`/dev/ttyUSB0`, `/dev/cu.usbserial-*`, `COM3`) or raw IPv4; `KEY_DEFAULT` (`:54`) is anchored to exactly `serial`, so `serialNumber`/`serial_number` would not be redacted (latent — nothing captures it today). [`scripts/utils/flash-history.js:167-174`](../../scripts/utils/flash-history.js) stores `errorMessage` verbatim in `localStorage` (the support-bundle and text-export paths re-scrub/omit it, so exported surfaces are clean).
- **Exploitation:** a copied/downloaded diagnostics bundle could carry a serial port path or an IP embedded in a Web Serial error string; the raw localStorage history holds unredacted error text (local-only, never auto-transmitted).
- **Remediation (one line):** add `/dev/tty*` / `cu.usbserial` / `COM\d+` / raw-IPv4 patterns to `scrubSensitiveText` and broaden the key regex to `serial(number)?`.

### W-L4 — `sync-from-releases.py` downloads release `.bin` assets without SHA verification
- **Evidence:** [`scripts/sync-from-releases.py`](../../scripts/sync-from-releases.py) validates the release-body structure but performs no `hashlib`/checksum verification of the downloaded `.bin` (grep: no `sha256`/`digest`). Invoked only on the `release: published` path in [`.github/workflows/firmware-publish.yml:89-98`](../../.github/workflows/firmware-publish.yml).
- **Exploitation:** low/dormant — this path pulls assets from WebFlash's *own* release (same-repo trust) and the cross-repo importer (`import-firmware-sources.py`) does verify SHA256 against `checksums-sha256.txt` **and** a pinned `expected_sha256` (the well-built primary path, plus the PR-time `validate-source-checksums.py` June-10 guard). The residual is that if the `release: published` lane is used, a tampered release asset is synced unverified.
- **Remediation (one line):** verify each synced `.bin` against the release's `checksums-sha256.txt` in `sync-from-releases.py`, matching the importer.

---

## INFO

- **W-I1 — The manifest committed on `main` is signed with the exposed `test_only` dev key; CI re-signs at deploy.** `git show main:manifest.json` builds carry `signature_key_id: dev-2026-01`; the live Pages manifest (curled) is prod-signed because `firmware-publish.yml` regenerates with `--mode production` (CI secret `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64`) and uploads that artifact without committing it back. Not a vuln (deploy re-signs), but the default-branch artifact is not itself prod-signed and would be refused if loaded raw.
- **W-I2 — Owner personal email in history.** `wifispray@gmail.com` authored 3 commits (matches the session owner). Self-disclosure on the owner's own repo, not third-party PII. No other personal names, customer/supplier data, IPs, internal hostnames, or address hints found in tree, history, docs, release notes, or `.meta.json` sidecars.
- **W-I3 — Minor client hardening.** `sw.js` `message` handler (`:359`) accepts `CLEAR_CACHE`/`SKIP_WAITING` with no `event.origin` check (same-origin-only in practice, non-sensitive actions). The per-build `firmware-*.json` files fall through to stale-while-revalidate (only root `manifest.json` is network-first); runtime resolves via the root manifest, bounding impact. No `eval`/`new Function`/`document.write`/cross-origin `postMessage` listener exists; URL params are allowlisted; `?sku=` reaches the DOM only as a text node.
- **W-I4 — npm audit + verified-good.** `npm audit` reports 5 vulns (2 high `minimatch`/`picomatch`, 3 moderate) but **all** are in the Jest devDependency tree — the site ships **no** runtime/production npm dependencies, so none reach the deployed asset; CI/dev-time only. Verified-good: real Ed25519 install verification hardcoded to production mode; strict CSP with no `unsafe-inline`/`unsafe-eval`; consistent `escapeHtml`; SHA-pinned workflow actions; least-privilege workflow tokens; `expected_sha256` pinning + PR-time checksum guard on the cross-repo importer.

---

## Item 7 — Manual repo-settings checklist for the owner (cannot be read from the tree)

> Verify each of the following in GitHub repo/org settings for `sense360store/WebFlash`. These govern whether the trust model and deploy gate above are actually enforced.

1. **Branch protection on `main`:** require PRs (no direct push — the repo's own policy says never push to `main`), require the `CI: PR Tests` checks to pass, require ≥1 review, dismiss stale approvals, require up-to-date branches.
2. **Required status checks** include the `test` + `source-checksum-guard` jobs from `ci.yml`; confirm they are *required*, not just present.
3. **Force-push / deletion rules:** block force-push and deletion of `main` and of `security/*` review branches; enforce for admins.
4. **GitHub Pages source + environment protection:** confirm Pages deploys only from the intended branch via the `github-pages` environment; add required reviewers / branch restrictions to that environment so a deploy cannot be triggered from an arbitrary ref. The deploy job holds `pages: write` + `id-token: write` — confirm those are scoped to the deploy job only (they are, in `firmware-publish.yml`).
5. **Actions permissions — default token:** set the default `GITHUB_TOKEN` to read-only org/repo-wide (jobs opt up where needed).
6. **Actions permissions — fork PR policy:** require approval to run workflows on outside-contributor PRs; confirm fork PRs cannot access secrets (the signing key, Pages token).
7. **Signing-secret hygiene:** confirm `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` / `WEBFLASH_FIRMWARE_KEY_ID` exist only as repo/environment secrets, are restricted to the publish environment, and are rotated; confirm the active production public key in `trusted-keys.json` matches the held private key and that `dev-2026-01` is never promoted to `active`.
8. **Allowed actions policy:** restrict to GitHub + verified/pinned-SHA actions (matches the tree's SHA pinning).
9. **Dependabot:** enable alerts + security updates (dev-dependency advisories from `npm audit`) and Actions version-update PRs to bump SHA pins for CVEs.
10. **Secret scanning + push protection:** enable both org-wide (note the only committed key is the intentional `test_only` fixture — push protection prevents an accidental *real* key commit).
11. **Tag protection / release immutability:** if WebFlash cuts releases, protect tags and enable immutable releases so a published asset/manifest cannot be silently overwritten.
12. **CSP/header delivery decision:** decide and document whether to front Pages with a header-capable CDN (closes W-M1) or to accept that `frame-ancestors`/XFO/nosniff cannot be served on Pages.
