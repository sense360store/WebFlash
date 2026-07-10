# WF-H1-REIMPORT-CLEAN-001 — WebFlash tracking file (REBUILD-CLEAN-CREDENTIALS-001 programme)

**Programme:** `REBUILD-CLEAN-CREDENTIALS-001` (upstream
[`sense360store/esphome-public`](https://github.com/sense360store/esphome-public)) +
`WF-H1-REIMPORT-CLEAN-001` (this repo). This file is the WebFlash copy of the
programme tracking file, created at step W1 from the upstream **plan of
record** (`docs/rebuild-clean-credentials-001.md` on esphome-public `main`,
landed by esphome-public PR
[#797](https://github.com/sense360store/esphome-public/pull/797), fetched
2026-07-06). Where this file and the upstream plan of record disagree, the
upstream plan of record wins for release mechanics; this file wins for
WebFlash execution state.

**Audit basis:** `docs/security/SECURITY-AUDIT-2026-06.md` finding H1 (shared
default control credentials compiled into every released binary) plus the
forward half of H2 (burned fallback-AP literals). The upstream pipeline fix
is `SEC-ESP-BUILD-GATES-001` (esphome-public PR #779, merged 2026-06-10);
this programme is the field-distribution half: every binary WebFlash served
at programme start was built before that fix.

Every PR in this programme is **HOLD FOR OWNER** — nothing merges on green
alone. The agent never dispatches a release workflow, pushes a tag, creates
a release, or modifies a workflow file; release execution is owner-only.

---

## Plan of record (summary; authoritative copy lives upstream)

### Recon result (2026-07-06, upstream R1)

All nine WebFlash sources served at programme start predate the upstream
credential gate (merged 2026-06-10 18:57 UTC):

| # | config_string | release_tag | channel | Disposition |
|---|---|---|---|---|
| 1 | `Ceiling-POE-VentIQ-RoomIQ` | `v1.0.4` | stable | Rebuild as **v1.0.7** (Group A) |
| 2 | `Ceiling-POE-RoomIQ` | `v1.0.5` | stable | Rebuild as **v1.0.8** (Group A) |
| 3 | `Ceiling-POE-AirIQ-RoomIQ` | `v1.0.6` | stable | Rebuild as **v1.0.9** (Group A) |
| 4 | `Ceiling-POE-VentIQ-RoomIQ-LED` | `v1.0.0-led-preview` | preview | Rebuild as **v1.0.1-led-preview** (Group A) |
| 5 | `Ceiling-POE-VentIQ-FanPWM-RoomIQ` | `v1.0.0-preview` | preview | **De-list** (Group B, W1) |
| 6 | `Ceiling-POE-VentIQ-FanDAC-RoomIQ` | `v1.0.0-preview` | preview | **De-list** (Group B, W1) |
| 7 | `Ceiling-POE-AirIQ-FanRelay-RoomIQ` | `v1.0.0-preview` | preview | **De-list** (Group B, W1) |
| 8 | `Ceiling-POE-AirIQ-FanPWM-RoomIQ` | `v1.0.0-preview` | preview | **De-list** (Group B, W1) |
| 9 | `Ceiling-POE-AirIQ-FanDAC-RoomIQ` | `v1.0.0-preview` | preview | **De-list** (Group B, W1) |

The in-tree Rescue build is confirmed clean per the deny list (upstream R1
recon, R-D5): scanner PASS, checksum matched the served
`firmware/rescue/manifest.json`. No rebuild.

### Group B rationale (W1)

The five fan previews cannot be rebuilt on the sanctioned upstream pipeline:
the fan-token guardrail keeps fan rows out of upstream
`config/webflash-builds.json`, Release 3 builds only what that file
declares, and the release workflows' choice lists contain no fan config.
Per R-D1 each de-listed preview gets a de-list reason in the WebFlash
sources data and one line in the advisory's affected section (the advisory
update is resolved at W3 with the rest of the DRAFT markers). They are
Advanced-install-only, acknowledgement-gated previews — never stable,
recommended, default, or buyable — so de-listing has no customer-baseline
impact.

### Decisions of record

| ID | Decision | Resolution |
|---|---|---|
| R-D1 | Fan preview users | De-list the five previews; one line each in the advisory's affected section; de-list reason recorded in WebFlash sources data. **Adopted.** |
| R-D2 | Version numbers | Patch increment per product: `1.0.7` / `1.0.8` / `1.0.9` stable, `1.0.1` LED preview (tags verified free upstream). **Ratified by merging upstream R1 (#797).** |
| R-D3 | Old release assets | Left in place upstream, release notes annotated (owner runbook step 9), never deleted. Exposure control is WebFlash no longer serving them. **Adopted.** |
| R-D4 | Bench acceptance | Owner flashes one rebuilt stable; four-point checklist (boot + sensors, unique AP fallback password, unique API key present, OTA succeeds); attestation is owner-authored only and pasted on the W2 PR. **Adopted; never agent-authored.** |
| R-D5 | Rescue build | Confirmed clean per the deny list (upstream R1 recon); no rebuild. **Confirmed.** |

---

## Execution log

Steps run one per session, lowest-numbered non-EXECUTED step for the
current repo next. Upstream (esphome-public) steps are tracked in that
repo's copy of this file.

| Step | Repo | Description | Status | PR |
|---|---|---|---|---|
| R1 | esphome-public | Recon + plan of record | **EXECUTED** | [esphome-public #797](https://github.com/sense360store/esphome-public/pull/797) |
| Dispatch | esphome-public | Owner runs the dispatch runbook (4 rebuilds); credential gates must pass | OWNER ACTION — pending | — |
| Bench | hardware | Owner bench-flashes one rebuilt stable; R-D4 checklist; owner-authored attestation | OWNER ACTION — pending | — |
| W1 | WebFlash | De-list the five fan previews (R-D1) | **EXECUTED** | [#582](https://github.com/sense360store/WebFlash/pull/582) |
| W2 | WebFlash | Clean re-import of the four rebuilt releases; backstop assertions; merge gated on owner attestation (R-D4) | **EXECUTED** (assets imported and live; see the W3 change record and the R-D4 caveat below) | importer PRs [#584](https://github.com/sense360store/WebFlash/pull/584), [#585](https://github.com/sense360store/WebFlash/pull/585), [#586](https://github.com/sense360store/WebFlash/pull/586), [#587](https://github.com/sense360store/WebFlash/pull/587) |
| W3 | WebFlash | Scanner verification of every served binary; resolve advisory DRAFT markers; mark programme COMPLETE | **EXECUTED** | this PR |
| PR-WF-A | WebFlash | Correct the false per-device provisioning claims introduced at W2/W3 across the advisory DRAFT, sidecars, manifest, and this record | **EXECUTED** | PR-WF-A (see change record below) |
| Publish | WebFlash | Owner publishes the GitHub Security Advisory + user notice | OWNER ACTION — pending | — |
| Annotate | esphome-public | Owner annotates superseded release notes with the advisory link (R-D3) | OWNER ACTION — pending | — |

### W1 change record

Executed 2026-07-06 on branch `claude/rebuild-clean-credentials-001-9utxyo`.

- `firmware/sources.json`: removed the five fan preview source entries
  (9 → 4 sources); added the `delisted_sources` register carrying the
  per-config de-list reason required by R-D1. The four Group A sources
  (three stables + LED preview) are untouched and remain served until W2
  replaces them with the rebuilt versions.
- `firmware/configurations/`: deleted the five fan preview `.bin` +
  `.meta.json` pairs.
- Regenerated `manifest.json` (10 → 5 builds including Rescue) and
  `firmware-0..4.json`; pruned `firmware-5..9.json`
  (`scripts/gen-manifests.py`).
- `scripts/data/kits.json`: retired the five fan preview kit cards
  (S360-KIT-BATH-P-PWM, S360-KIT-BATH-P-DAC, S360-KIT-KITCHEN-P-REL,
  S360-KIT-KITCHEN-P-PWM, S360-KIT-KITCHEN-P-DAC), preserving the
  kit → manifest-build invariant. The stable Bathroom and Bedroom kits are
  untouched.
- `__tests__/fixtures/expected-surface.json`: moved the five fan preview
  builds from `builds` to the `retired` register with the R-D1 de-list
  reason; the retired artifacts may never reappear on disk.
- Rebaselined the surface-pinning guards to the four-build / two-kit
  state (no gate, channel policy, or install-acknowledgement logic
  changed).

No stable source entry, no workflow file, no release-channel or
install-gate logic, and no upstream release data were touched.

### W3 change record

Executed 2026-07-08 on branch `claude/rebuild-clean-credentials-w3-z5ruri`.

**Scanner verification (every binary now under `firmware/`).** Ran
`scripts/check-firmware-default-credentials.py` (the same denylist the import
gate enforces, 12 credential needles) against every `.bin` served by the
installer. All five PASS — no default or placeholder credential material:

| Asset | Result |
|---|---|
| `Sense360-Ceiling-POE-VentIQ-RoomIQ-v1.0.7-stable.bin` | PASS |
| `Sense360-Ceiling-POE-RoomIQ-v1.0.8-stable.bin` | PASS |
| `Sense360-Ceiling-POE-AirIQ-RoomIQ-v1.0.9-stable.bin` | PASS |
| `Sense360-Ceiling-POE-VentIQ-RoomIQ-LED-v1.0.1-preview.bin` | PASS |
| `Sense360-Rescue-v1.0.0-rescue.bin` | PASS |

The four rebuilt Group A releases (W2 deliverable) are imported and live on
the installer; W3 confirms they scan clean. The in-tree Rescue build stays
clean (R-D5). No credential-dirty binary remains on the installer.

**Advisory DRAFT markers resolved.** Both
`[TO RESOLVE BEFORE PUBLICATION]` editor notes in
`docs/security/advisory-default-credentials-DRAFT.md` were resolved and the
file keeps its DRAFT marking:

- Affected-versions table restated as affected-and-earlier / fixed-and-later
  per configuration using the shipped fixed versions: `Ceiling-POE-VentIQ-RoomIQ`
  fixed at v1.0.7, `Ceiling-POE-RoomIQ` at v1.0.8, `Ceiling-POE-AirIQ-RoomIQ`
  at v1.0.9, and the VentIQ LED preview at v1.0.1-led-preview. The five
  de-listed v1.0.0-preview fan configurations each get one line in the
  affected section noting removal with no fixed version to reflash to (R-D1).
- The reflash-flow note was resolved with a claim of a confirmed per-device
  provisioning flow (each fixed device establishing its own unique API
  encryption key, OTA password, web password, and fallback hotspot
  password). **That claim was false and was corrected by PR-WF-A (see the
  correction change record below).** What W3 actually confirmed is only that
  the four fixed builds scan clean against the credential denylist — the
  shared defaults are gone. The rebuilt binaries ship unprovisioned:
  SEC-ESP-PROVISIONING-001 (per-device credential provisioning) is a planned
  upstream follow-up that is not implemented, the native API is unencrypted,
  OTA and the web interface are unauthenticated, and the fallback AP is
  open. Users requiring authentication must self-build with unique secrets.

**Test-surface reconciliation.** The W2 asset re-import landed the rebuilt
binaries, `manifest.json`, the `firmware-*.json` set, the sidecars, and the
vendored product-catalog fixture, but it did not rebaseline the
surface-pinning test fixtures off the old pre-rebuild versions, and it
regressed one invariant in the vendored catalog. W3 completed that
bookkeeping so the full suite is green against the shipped reality:

- `__tests__/fixtures/expected-surface.json` (WF-SURFACE-SSOT-001): bumped the
  four `builds` versions to the shipped values (v1.0.7 / v1.0.8 / v1.0.9
  stable and v1.0.1 preview). Every count / filename / version guard derives
  from this single source of truth. Version supersession within the same
  config and channel is represented by `builds` carrying the current version
  and the superseded `.bin` no longer existing on disk; it is not recorded in
  the `retired` register, which pins config-and-channel combinations that are
  gone, not older versions of a still-served config.
- `__tests__/fixtures/esphome-product-catalog.json`: restored the
  `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ` entry `status` from `preview` back to
  `blocked`. The import commit flipped it; the entry's own `blocker` (HW-005),
  `webflash_build_matrix: false`, and `notes` all say blocked, and the
  FanTRIAC-blocked invariant requires it. This restores a gate, it does not
  weaken one.
- `__tests__/promote-to-stable.test.js`: retargeted the in-memory
  source-removal fixture from the retired `...-LED-v1.0.0-preview.bin` asset
  name to the shipped `...-LED-v1.0.1-preview.bin` name (test-only; nothing is
  written back to `firmware/sources.json`).

No firmware bytes, no source entry, no `manifest.json`, no `firmware-*.json`,
no `REQUIRED_CONFIGS`, no kit, and no release-channel or install-gate logic
were touched by W3; the reconciliation above is limited to test fixtures /
expected-surface pins and the advisory DRAFT.

### PR-WF-A change record (correction of false provisioning claims)

Executed 2026-07-10 on branch
`claude/webflash-provisioning-metadata-xtryr0`. Docs-and-metadata only: no
firmware bytes, no `.bin` path, no hash, no signature, no source entry, no
`REQUIRED_CONFIGS`, no kit, and no release-channel or install-gate logic
changed.

The W2 import and the W3 advisory resolution recorded a false claim: that
the rebuilt builds are provisioned with unique per-device credentials
(unique API encryption key, OTA password, web password, and fallback
hotspot password) and that reflashing re-keys the device. The accurate
state, now stated everywhere the false claim appeared:

- The shared default credentials were removed from the rebuilt builds (this
  part was and remains true; every served binary scans clean against the
  denylist).
- The current prebuilt firmware ships **unprovisioned** — no credentials
  are configured at all.
- The native API is unencrypted; OTA and the web interface are
  unauthenticated; the fallback AP is open.
- Users requiring authentication must currently self-build with unique
  secrets.
- SEC-ESP-PROVISIONING-001 (per-device credential provisioning) is a
  planned upstream follow-up and is **not implemented** in any served
  build.

Files corrected: the four `firmware/configurations/*.meta.json` sidecar
changelogs, the four matching `manifest.json` changelog arrays (changelog
text only; binary paths, sizes, SHA-256/MD5 hashes, Ed25519 signatures,
build dates, and source commits are untouched),
`docs/security/advisory-default-credentials-DRAFT.md` (reflash-flow claim
replaced, a "Residual security posture after reflashing" section added,
post-reflash verify steps rewritten, publication-gate editor note
corrected), and this tracking record (W3 change record annotated, this
change record added).

**Residual owner items surfaced by this correction:**

- The upstream release bodies for `v1.0.7`, `v1.0.8`, `v1.0.9`, and
  `v1.0.1-led-preview` on `sense360store/esphome-public` carry the same
  false changelog line ("device credentials are now provisioned uniquely
  per device"); the importer regenerates sidecar changelogs from those
  bodies, so a future re-import would reintroduce the false text until the
  owner corrects the upstream release notes.
- The R-D4 bench checklist ("unique AP fallback password, unique API key
  present") cannot pass against unprovisioned builds; the owner needs to
  revise the checklist to the actual posture (defaults absent; surfaces
  unauthenticated) before the pending bench attestation.
- Whether to publish the GHSA with the residual unauthenticated posture
  stated, or hold publication until SEC-ESP-PROVISIONING-001 ships, is an
  owner decision.

---

## Programme status: COMPLETE (WebFlash execution)

All WebFlash execution steps are executed: **W1** (de-list the five fan
previews), **W2** (clean re-import of the four rebuilt releases; live on the
installer), and **W3** (scanner verification of every served binary; advisory
DRAFT markers resolved, with the provisioning claim later corrected by
**PR-WF-A**). Every binary the installer serves scans clean against the
credential denylist. The served builds are unprovisioned: removing the
shared defaults closed the shared-credential exposure, but the native API,
OTA, web interface, and fallback AP remain unauthenticated until
SEC-ESP-PROVISIONING-001 ships upstream.

The remaining programme steps are owner-only actions, tracked pending in the
execution log and outside WebFlash's automated execution: the R-D4 bench
attestation (owner-authored only), the GitHub Security Advisory publication,
and the upstream superseded-release-note annotation (R-D3). "COMPLETE" here
means the WebFlash agent-side execution is finished, not that those owner
actions have been performed.
