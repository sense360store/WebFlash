# SPIKE-W1 — WebFlash / ESP Web Tools erase and ownership-persistence semantics

Programme: `SEC-ESP-PROVISIONING-001` (SOT `roadmap.yaml` → `sec-esp-provisioning-001`, status `planned`).
Spike: SPIKE-W1 as defined in `docs/adr/ADR-SEC-ESP-PROVISIONING-001.md` §10 on
[`sense360store/esphome-public` PR #821](https://github.com/sense360store/esphome-public/pull/821)
(head branch `claude/sec-esp-provisioning-adr-3nf7p6`): "WebFlash / ESP Web Tools
install paths: which erase NVS (full install vs update), and can/should the
installer offer 'reflash preserving ownership'".

This record is a desk and source investigation only. It changes no installer
behaviour, no manifest, no firmware, no binary, no hash, no signature, no
release metadata, no workflow, and no programme state. The ADR stays Proposed;
the SOT programme status stays `planned`.

## 1. Scope and programme ID

SEC-ESP-PROVISIONING-001 intends ownership credentials (API encryption key,
OTA password, fallback AP password), the persistent device UUID, and Wi-Fi
configuration to survive ordinary firmware updates, and to be removed only by
an explicit factory reset or full flash erase (ADR §13). This spike determines
which WebFlash installation paths erase or preserve ESP32 NVS state, from
source and artifact evidence, and states what still needs bench confirmation.

All WebFlash findings are pinned to the repository state at commit `3f35f00`
(current `main` merge head at investigation time). Every conclusion carries one
of the evidence classes defined in section 7.

## 2. Primary sources inspected

| Source | What it establishes |
|---|---|
| `scripts/install.js`, `scripts/app.js`, `scripts/shell.js`, `scripts/state.js`, `scripts/layout/rescue-modal.js`, `scripts/connect.js` | Every WebFlash surface that can start a flash |
| `vendor/esp-web-tools/` (ESP Web Tools **10.2.1**, exact-version vendored `dist/web/` tree, tarball integrity pinned in `index.html`; includes the bundled esptool-js loader) | The actual erase and write behaviour shipped to users. This vendored tree is the primary source for component behaviour; the upstream README was consulted for corroboration only |
| `manifest.json`, `firmware-0.json` … `firmware-4.json`, `firmware/rescue/manifest.json` | Which parts and offsets each install writes, and the erase-prompt flags |
| The five committed `.bin` artifacts under `firmware/configurations/` and `firmware/rescue/`, plus their `.meta.json` sidecars | Image format forensics (application image vs factory image, embedded app descriptor, absence of a partition table) |
| `esphome/esphome` tag `2026.4.5`, `esphome/components/esp32/__init__.py` (the ESPHome version the sidecars pin for every served build) | Where the upstream build system places the NVS partition |
| SOT `CLAUDE-OPERATING-MODEL.md` and `roadmap.yaml` (`sec-esp-provisioning-001` entry) | Programme authority, evidence rules, current programme status |
| `docs/adr/ADR-SEC-ESP-PROVISIONING-001.md` at the PR #821 head | The required preservation semantics this spike evaluates against |
| Espressif esptool documentation (flashing behaviour pages) | Corroboration of region-erase-on-write semantics |

Not inspected: production hub hardware (no bench work in this spike), the live
GitHub Pages deployment's served bytes (the committed manifests' SHA-256 values
match the committed binaries, and the enforced install gate verifies those
hashes in the browser, so committed bytes are taken as served bytes), and any
upstream `packages/` or `products/` internals (out of contract).

## 3. Current WebFlash path inventory

WebFlash has exactly two in-browser flash paths, one manual-download path, and
no direct esptool.js usage outside the vendored ESP Web Tools component. There
are no hidden or query-flag erase paths: the only erase controls are the ESP
Web Tools dialog checkbox and the manifest flags documented below.

### P1 — Wizard install (initial install, reinstall, and update are one path)

- Entry point: Step 2 "Prepare & install firmware" in the single 2.0 view.
- Code: `scripts/install.js` renders `<esp-web-install-button manifest="firmware-<index>.json">`; the engine gate (`evaluateInstallGate` in `scripts/state.js`) only arms or disarms the button. Connect, erase, write, and verify are owned entirely by the upstream component.
- Browser component / API: ESP Web Tools 10.2.1 over Web Serial, driving the bundled esptool-js loader.
- Manifest flags (all five generated per-build manifests): `new_install_prompt_erase: true`, `new_install_improv_wait_time: 0`, every build `improv: false`, single part at offset `0`.
- Resulting dialog flow, verified in the vendored source: `new_install_improv_wait_time === 0` forces the no-Improv dashboard, whose only install action routes through the ASK_ERASE screen because `new_install_prompt_erase` is true. The "Erase device" checkbox is **unchecked by default**.
- **P1a, default (checkbox left unchecked):** no full-chip erase. The single part is written at offset 0; the loader erases only the flash region the part covers (about 0.85 MiB to 0.97 MiB from offset 0 for the current builds). Flash above the image end, including the upstream NVS partition location (section 5), is not touched. Wi-Fi credentials, ownership state, and the device UUID stored in NVS would remain physically present. Whether the device still boots and honours them is a separate, unresolved question (section 5). Evidence: verified from vendored ESP Web Tools source plus manifest data; post-boot behaviour unresolved.
- **P1b, user ticks "Erase device":** full-chip erase (`ESP_ERASE_FLASH`) before writing. NVS, Wi-Fi credentials, ownership state, and UUID are all destroyed. This is currently the only user-visible route to a full erase in the wizard. Evidence: verified from vendored source.
- WebFlash never distinguishes first install from reinstall or update: with Improv disabled the dialog cannot identify the running firmware, so every run presents the same ASK_ERASE prompt with the same unchecked default.

### P2 — Rescue / Recovery modal

- Entry point: the topbar Rescue action; `scripts/app.js` → `recovery.openRescueModal`.
- Code: `scripts/layout/rescue-modal.js` builds its own `<esp-web-install-button manifest="./firmware/rescue/manifest.json">` behind an "I understand this will erase the device" acknowledgement.
- The modal sets an `erase-first` attribute on the button (`rescue-modal.js` line 184, pinned by `__tests__/rescue-modal.test.js`). **ESP Web Tools 10.2.1 does not read this attribute.** The vendored `install-button.js` consumes only `manifest` and `overrides`; the string `erase-first` appears nowhere in the vendored tree. The attribute is a silent no-op. Evidence: verified from vendored source.
- The rescue flash nevertheless full-erases in practice, through a different mechanism: `firmware/rescue/manifest.json` carries only the deprecated `new_install_skip_erase: false` and therefore no `new_install_prompt_erase`. In the vendored dialog, a new install without that flag skips the ASK_ERASE prompt and calls `_startInstall(true)`, which is a full-chip erase. (The rescue manifest also omits `new_install_improv_wait_time`, so the dialog first probes for Improv; on a dead or download-mode device the probe fails and the no-Improv install path above is taken.) Evidence: verified from vendored source plus manifest data for the no-Improv case; the Improv-probe-succeeds case is theoretical today because no served build ships Improv.
- So the modal copy ("This will erase the device… Wi-Fi, names, calibration will be lost") is accurate in effect, but it is enforced by a manifest default, not by the `erase-first` attribute the code appears to rely on. If the rescue manifest ever gains `new_install_prompt_erase: true`, the rescue path would silently stop guaranteeing an erase.
- Note: the committed `firmware/rescue/Sense360-Rescue-v1.0.0-rescue.bin` is a 512 KiB ASCII placeholder (the string `Sense360RescueFirmware` repeated), not a valid ESP image. No rescue-path behaviour beyond the erase itself can be claimed. Evidence: verified from artifact bytes.

### P3 — ESP Web Tools "Update" and "Erase User Data" flows (currently unreachable)

The upstream dialog has two further flows that only exist when Improv detection
identifies the running firmware: same-firmware "Update" (installs with **no**
erase) and same-version "Erase User Data" (full erase). Both are unreachable in
WebFlash today: the wizard manifests set `new_install_improv_wait_time: 0`,
which disables the probe entirely, and no served build ships Improv. If Improv
is ever enabled, these flows appear without any WebFlash code change and must
be re-evaluated. Evidence: verified from vendored source plus manifest data.

### P4 — Manual firmware download

`downloadFirmware()` in `scripts/state.js` lets a user download the verified
`.bin`. Offsets, erase flags, and tooling are then entirely user-controlled
(for example `esptool write_flash` or `--erase-all`); WebFlash governs nothing
past the download. Documented for completeness.

### P5 — Post-flash Wi-Fi step (not a flash path)

Step 3 (`scripts/connect.js`) would provision Wi-Fi over Improv Serial inside
the upstream dialog. It writes Wi-Fi credentials (an NVS write performed by
firmware); it never erases flash. Inactive today because no served build ships
Improv.

## 4. ESP Web Tools default behaviour (10.2.1, from vendored source)

All statements in this section are verified from `vendor/esp-web-tools/`
(the exact code WebFlash ships), unless marked otherwise.

- **A normal install does not unconditionally full-erase.** The bundle's flash routine takes a single boolean `erase`. When true, it calls the loader's `eraseFlash()` (`ESP_ERASE_FLASH`, full chip) before writing. When false, no chip erase happens. `writeFlash` is then always invoked with `eraseAll: false`.
- **Writing erases only the target regions.** With `eraseAll: false`, the loader issues `FLASH_DEFL_BEGIN` per part, sized to that part; the on-chip stub erases exactly the flash region the part covers before the compressed write. Data outside the written parts (including NVS, if it lies outside) is untouched. Corroborated by the Espressif esptool documentation, which reports erasure only of the address ranges being written unless erase-all is requested.
- **Writing an application image preserves NVS only if NVS lies outside the written span.** There is no partition awareness in the component: it neither reads nor respects the device's partition table. "Preserves NVS" is purely an offset arithmetic outcome.
- **Multiple parts:** each part is fetched, then erased-and-written independently at its own offset. No full erase is implied by multi-part manifests.
- **Erase options.** The manifest option `new_install_prompt_erase: true` inserts the ASK_ERASE screen (checkbox default unchecked). Without it, a **new install defaults to a full erase** (`_startInstall(true)`) on both the no-Improv dashboard and the different-firmware Improv dashboard. The older `new_install_skip_erase` is deprecated; the 10.2.1 loader maps `new_install_skip_erase: true` to `new_install_prompt_erase: true` and logs a deprecation warning. esptool-js exposes `eraseAll` on `writeFlash`; ESP Web Tools hard-codes it to false and performs its own optional chip erase beforehand.
- **First install vs reinstall:** the component cannot tell them apart without Improv. With Improv, same-firmware "Update" installs with no erase, and same-version offers "Erase User Data" (full erase). Defaults therefore differ only when Improv identification succeeds.
- **The component exposes no erase attribute.** `install-button.js` reads only `manifest` and `overrides`. There is no `erase-first`, `eraseFirst`, or equivalent public erase option on the element in 10.2.1.
- **Behaviour has changed across versions.** The deprecation shim for `new_install_skip_erase` is direct evidence that erase semantics were reshaped in earlier major versions. All statements above are pinned to 10.2.1; a version bump of the vendored tree must re-run this analysis. (Historical change-by-change reconstruction was not performed; classification: verified for 10.2.1, unverified for other versions.)

## 5. Manifest and partition findings

- Every generated build (four wizard builds plus Rescue) writes **exactly one part at offset 0**. No manifest lists an NVS part, a bootloader part, or a partition-table part separately. Evidence: verified from manifest data.
- **The four wizard `.bin` artifacts are ESP-IDF application-format images, not merged factory images.** Each begins with the ESP image magic `0xE9` and carries the `esp_app_desc_t` magic `0xABCD5432` at file offset `0x20`, with app version `2026.4.5`, ESP-IDF `5.5.4`, and project names matching the config (for example `s360-ceil-poe-ventiq-roomiq`). None contains a partition table at `0x8000` (no `0xAA50` entry table; that region holds application string data). The `.meta.json` sidecars agree: `artifact_type: "application"`. Evidence: verified from artifact bytes and sidecar metadata.
- **Where NVS lives upstream.** The pinned ESPHome `2026.4.5` (ESP-IDF framework) generates the partition table as `otadata, phy_init, app0, app1, nvs` with offsets auto-placed from `0x9000` and NVS **last** (`0x70000` long). For any plausible flash size this places NVS at or above roughly `0x390000` (4 MB flash) — far beyond the 0.97 MiB maximum image span written at offset 0. Under this layout, the no-erase install can never reach the NVS sectors. Evidence: verified from upstream ESPHome source for the pinned version; the actual partition table burned into production hubs is not observable from this repository (unresolved).
- **The offset-0 write overwrites the bootloader and partition-table regions.** Whatever the layout, writing an application-format image at offset 0 replaces the contents of `0x0`–`0x8000` (second-stage bootloader) and `0x8000` (partition table) with application bytes. After a no-erase P1a install of the committed artifacts, the NVS sectors are physically intact but the partition table that locates them has been destroyed, and the device has no bootloader at the address the ROM loads from. Whether such a device boots at all cannot be determined from source; it is strongly inferred that it does not, and bench confirmation is required. Whether upstream intends these release assets to be factory-format images (bootloader + partition table + app merged) is an `sense360store/esphome-public` question outside this repository's authority.
- **Partition-table changes can silently relocate or orphan NVS.** Upstream app-partition sizes are computed from flash size and any custom partitions, and NVS is placed after them; any upstream layout change moves NVS. WebFlash carries no partition-table knowledge, pins nothing, and cannot detect such a change. A future update flow that "preserves NVS" by offset arithmetic alone would silently break the first time the layout moves. Evidence: verified from upstream source (mechanism); impact on any particular device is inferred.
- **Do current update paths preserve device state in practice by design?** No such design exists. The preservation observed in P1a is a byproduct of a single-part offset-0 manifest, a default-unchecked upstream checkbox, and an upstream partition layout that happens to place NVS out of reach. None of those three is pinned by any WebFlash contract, test, or document today.

## 6. NVS / ownership preservation against the ADR policy

ADR §13 requires: reboot, OTA update, and a normal serial reflash without erase
must preserve ownership state, the API encryption key, the OTA password, the
fallback AP password, the device UUID, and Wi-Fi configuration; a full flash
erase or the guarded factory reset must remove all of them and return the
device to `FACTORY_UNOWNED`.

Assessment of current WebFlash behaviour against that policy:

| ADR expectation | Current WebFlash reality | Match |
|---|---|---|
| Normal serial reflash without erase preserves NVS | P1a does not erase or write the upstream NVS region (transport level) | Matches at the flash-transport level; unproven as a working update because the same write destroys the bootloader and partition-table regions (section 5) |
| Full flash erase removes everything | P1b (checkbox) and P2 (rescue) perform a genuine full-chip erase | Matches |
| Factory reset is a deliberate, guarded action | The only in-installer erase is a mid-dialog checkbox with generic upstream copy ("All data on the device will be lost"), plus the rescue modal's acknowledgement | Partially: the rescue path is deliberately gated; the wizard checkbox is not a deliberate factory-reset UX and is one click away from the preserve path |
| Installer claims only what upstream metadata proves | No WebFlash surface currently claims any preservation or provisioning behaviour | Matches (nothing is claimed) |

Bottom line: existing WebFlash behaviour does **not yet demonstrably match**
the ADR's ordinary-update semantics. The erase/preserve split at the transport
level is exactly what the ADR wants (preserve by default, erase only on
explicit action), but the artifact format served today makes "ordinary update
that leaves a working, still-owned device" unproven from source.

## 7. Evidence classification

Classes used in this record:

1. **Verified from WebFlash source** — read directly from this repository's committed code at `3f35f00`.
2. **Verified from upstream ESP Web Tools / esptool-js source** — read from the vendored 10.2.1 tree (byte-identical to the pinned npm tarball), or from Espressif esptool documentation where explicitly noted.
3. **Verified from manifest / partition / artifact data** — read from the committed manifests, sidecars, or binary bytes.
4. **Strongly inferred** — follows from verified facts plus standard ESP32-S3 boot architecture, but not directly observed.
5. **Unresolved, bench confirmation required.**

Classification of the main conclusions:

| Conclusion | Class |
|---|---|
| Wizard install always routes through ASK_ERASE; checkbox default is unchecked; unchecked means no chip erase | 1 + 2 |
| Unchecked install writes one part at offset 0 and erases only that region | 2 + 3 |
| Checked install and rescue install perform a full chip erase | 2 + 3 |
| `erase-first` attribute is a no-op in ESP Web Tools 10.2.1 | 1 + 2 |
| Rescue full-erase comes from the missing `new_install_prompt_erase` flag, not the attribute | 2 + 3 |
| Served wizard artifacts are application-format images without partition tables | 3 |
| Upstream (ESPHome 2026.4.5, IDF) places NVS last, beyond the written span | Verified from upstream ESPHome source for the pinned version |
| No-erase install therefore leaves NVS sectors untouched | 2 + 3 (transport level only) |
| No-erase install overwrites bootloader and partition-table regions | 3 |
| A device flashed that way does not boot | 4 — bench required |
| Actual partition table and flash size of production hubs | 5 |
| Post-update honouring of preserved NVS by new firmware | 5 (and owned by `esphome-public`) |

## 8. Recommended future WebFlash UX (not implemented in this spike)

The investigation supports the ADR's implied two-action model, with additions:

**Update / reinstall (preserve ownership).** Do not chip-erase. Write only the
required firmware parts. Precondition (blocking, discovered by this spike):
the served artifact and offsets must be a scheme where the written span cannot
intersect NVS **and** still yields a bootable device — either app-only parts at
the app partition offset, or a factory image whose merged span provably ends
below the NVS partition, with the partition layout pinned by upstream metadata
that WebFlash consumes (never assumes). Warn, from upstream capability metadata
only (ADR G-P1: `provisioning: true` gated on contract tests), when the
selected build does not support the device's provisioning generation, and say
plainly that ownership is ignored-but-retained under a non-capable build
(ADR §13 row 4).

**Factory reset / erase and reinstall.** Perform an explicit full-chip erase
(the semantics P1b and P2 already have). Require deliberate, WebFlash-owned
confirmation copy naming everything that is destroyed: ownership, device UUID,
API encryption key, OTA password, fallback AP password, Wi-Fi configuration,
calibration, and user configuration, returning the device to `FACTORY_UNOWNED`.
The current upstream checkbox copy does not meet this bar and its placement
(one optional tick inside the install dialog) does not constitute a deliberate
guard.

Supporting hardening that should accompany any such work (all out of scope
here): stop setting the dead `erase-first` attribute or make the rescue
manifest's erase explicit and tested; document the ASK_ERASE checkbox in the
user guide and troubleshooting docs (today no user-facing document mentions
it); treat any vendored ESP Web Tools version bump as a re-audit trigger for
this record; and pin the artifact-format expectation (factory vs application)
in the importer contract so a format change upstream fails loudly at import.

## 9. Downgrade risks

Flashing an owned device (preserved NVS) with different builds, assessed
against ADR §13/§14:

- **Provisioning-capable newer build (no erase):** ownership record honoured; intended path. Requires the update path to actually work (section 5 blocker).
- **Same build (no erase):** state preserved; behaviour unchanged. Same blocker.
- **Older unprovisioned build (no erase):** the ADR's design is fail-safe — the record "persists in NVS but is not honoured (device behaves unprovisioned); restored by flashing a capable image". Risk: the device silently reverts to the open, unauthenticated posture of today's builds while stale credentials sit in flash. A user may believe the device is still protected. WebFlash should warn on downgrade below the provisioning capability floor (from upstream metadata only). Firmware-side OTA downgrade refusal while OWNED is ADR §14.2 territory, owned upstream.
- **Preview build:** same as the previous case plus the existing preview gates. Preview builds must never be presented as provisioning-capable without the upstream capability flag; the current channel acknowledgement is not a capability statement.
- **Self-built firmware image:** outside WebFlash's control entirely (manual download path P4 or user tooling). Stale NVS credentials remain readable by any firmware the owner (or an attacker with physical access) flashes without erase; this is inherent to unencrypted NVS and is an ADR-level acceptance (physical access is out of scope there), not a WebFlash defect. NVS encryption upstream would change this calculus.
- **Firmware using a changed partition table:** the dangerous case. If NVS moves, a preserved-NVS flash leaves the ownership record at the old offset: at best invisible (device boots unowned — ownership silently lost without the guarded reset the ADR requires), at worst partially overwritten by a partition now covering those sectors. Nothing in the current pipeline detects this. A provisioning **schema/version marker plus a partition-layout identifier in upstream release metadata** is needed before any preserve-mode UX can be truthful. The ADR's capability flag alone does not cover layout changes.

## 10. Unresolved questions

1. Do the currently served application-format images produce a bootable device when written at offset 0, with or without the erase checkbox? Strongly inferred not; **bench confirmation required**, and the answer determines whether any install path works at all today.
2. What partition table and flash size do production S360-100 hubs actually carry? Not observable from this repository; needed to confirm the NVS-out-of-reach conclusion on real hardware.
3. Will upstream publish factory-format images, partition-layout metadata, or both? (esphome-public decision; this spike only records the dependency.)
4. The Rescue placeholder binary must be replaced with a real image before any rescue-path behaviour beyond "full erase" can be claimed.
5. The Improv-enabled dialog flows ("Update" without erase, "Erase User Data") are unreachable today; if Improv ships in any build, this analysis must be redone for those flows.
6. Live-deployment parity was assumed from hash pinning (committed manifest SHA-256 values match committed binaries and are enforced by the browser install gate), not re-verified against the live site in this investigation.

## 11. Conclusion

**Outcome: UNPROVEN — source evidence is insufficient to call the current
ordinary install an NVS-preserving update; bench testing is required.**

Precisely: the flash-transport layer is proven and is exactly what the ADR
needs — the default wizard install performs no chip erase and physically cannot
touch the upstream NVS region, while the explicit erase checkbox and the rescue
path perform a genuine full-chip erase. On that layer alone this would be a
CONDITIONAL PASS. The outcome is UNPROVEN because the served artifacts are
application-format images written at offset 0, which overwrites the bootloader
and partition-table regions; whether the "ordinary install" leaves a working
device that boots and honours the preserved NVS cannot be established from
source, and preservation that leaves a non-booting device does not satisfy the
ADR's ordinary-update semantics. Additionally, the preservation that does occur
is accidental (unpinned upstream layout plus an upstream dialog default), not a
designed contract.

**Actions that erase NVS today:** ticking "Erase device" in the wizard's
install dialog (P1b), and the Rescue flash (P2, always). Nothing else in
WebFlash erases NVS.

**Is SPIKE-W1 complete for ADR acceptance?** The desk portion defined by ADR
§10 is complete: every WebFlash and ESP Web Tools install path is inventoried
with its erase semantics, and the "can/should the installer offer reflash
preserving ownership" question is answered (yes, but only after the artifact
format blocker in section 5 and the partition-layout metadata gap in section 9
are resolved upstream). A hardware/browser bench test is still required before
the ADR can rely on "ordinary update preserves ownership" as a fact, and this
record must not be cited as bench evidence. Recommended acceptance posture:
treat SPIKE-W1 as complete as a source investigation with outcome UNPROVEN,
and carry the bench confirmation forward (it can fold into the existing
SPIKE-P1/P2 bench sessions, since it needs the same assembled hardware).

## 12. Proposed wording for PR #821 (do not merge from here)

The following text can be copied into the SPIKE-W1 row / acceptance section of
`docs/adr/ADR-SEC-ESP-PROVISIONING-001.md` on PR #821 when the owner updates
that PR. It records the outcome without accepting the ADR:

> **SPIKE-W1 outcome (recorded 2026-07-11, WebFlash
> `docs/spikes/SPIKE-W1-webflash-erase-semantics.md`): UNPROVEN, desk portion
> complete.** WebFlash's default install (ESP Web Tools 10.2.1, vendored) does
> not chip-erase and writes a single part at offset 0, so the upstream NVS
> partition (placed last by ESPHome 2026.4.5's ESP-IDF layout) is never erased
> or written by an ordinary install; a full-chip erase happens only when the
> user ticks the dialog's "Erase device" checkbox or uses the Rescue path.
> However, the artifacts WebFlash currently serves are application-format
> images (not factory images), so the offset-0 write overwrites the bootloader
> and partition-table regions and the post-install boot outcome is unverified.
> Ordinary-update-preserves-ownership therefore remains bench-unconfirmed, and
> the preservation observed is not yet a designed contract (no partition-layout
> or capability metadata is pinned). WebFlash can offer a "reflash preserving
> ownership" mode only after upstream publishes artifacts and partition-layout
> metadata that make the preserved span provable, plus a provisioning
> capability/generation marker for downgrade warnings. Bench confirmation of
> boot-after-update folds into the SPIKE-P1/P2 hardware sessions. SPIKE-W1's
> desk investigation is complete; the ADR remains Proposed.

Status boundaries restated: this record does not mark the ADR accepted, does
not change the SOT programme status (`planned`), and claims no hardware, bench,
or compliance verification.
