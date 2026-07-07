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
| W2 | WebFlash | Clean re-import of the four rebuilt releases; backstop assertions; merge gated on owner attestation (R-D4) | pending | — |
| W3 | WebFlash | Scanner verification of every served binary; resolve advisory DRAFT markers; mark programme COMPLETE | pending | — |
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
