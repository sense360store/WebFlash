# Release channel policy (install time)

This page documents WebFlash's install time release channel policy. It was
relocated from the repository README when it became a short front door
(REPO-CUSTOMER-READY-001 S4). For what stable, preview, and experimental mean
for a customer and what support each channel receives, see
[docs/release-channels.md on sense360store/esphome-public](https://github.com/sense360store/esphome-public/blob/main/docs/release-channels.md).

## Release Channels

WebFlash organises every firmware build under one of seven release tiers. The
wizard surfaces the channel as a badge, displays the warning copy described
below, and gates the install button on the matching acknowledgements before
ESP Web Tools is allowed to start.

| Channel | Audience | Default? | Visibility | Warning copy | Acknowledgement |
|---|---|---|---|---|---|
| **Stable** | All customers / production deployments | ✅ Default when compatible and not deprecated | Always visible | None | None |
| **Beta** | Testers willing to accept regressions ahead of stable | ❌ Never default | Always visible | "Beta firmware is intended for testers…" (visible warning) | Required tickbox before install |
| **Preview** | Experimenters evaluating upcoming capabilities | ❌ Never default | Always visible | "Preview firmware is experimental…" (stronger warning) | Required tickbox before install |
| **Development** | Internal engineers / advanced users running unsupported builds | ❌ Never default | **Hidden** unless the wizard is loaded with `?mode=development` | "Development firmware is intended for internal testing…" (danger banner) | Required tickbox before install |
| **Recovery** (rescue) | Users intentionally entering the unbrick / rollback / factory-restore path | ❌ Never default | **Hidden** unless the wizard is loaded with `?mode=recovery` | "Recovery firmware is for unbricking, factory restore, or rollback only…" (danger banner) | Channel itself is the consent gesture; warning copy is shown |
| **Deprecated** | Lifecycle-retired builds retained for diagnostic comparison | ❌ Never default | Visible alongside its channel | "This firmware build is deprecated…" (warning banner with reason) | Required tickbox before install |
| **Recommended** | Not a channel — a presentation flag | — | Renders as an extra badge on the auto-selected default | None | None |

Notes on the policy:

- **Stable is the only `defaultSelectable` tier.** When the user finishes the
  wizard, the firmware version dropdown auto-picks the newest non-deprecated
  stable build. Beta / preview / dev / rescue stay user-selectable but never
  become the default.
- **Deprecated is orthogonal to channel.** A deprecated stable build still
  shows the `Stable` badge plus a separate `Deprecated` badge, and requires a
  deprecation acknowledgement on top of any channel acknowledgement.
- **Hidden tiers must be opted into via URL.** Recovery firmware appears only
  when the page is loaded with `?mode=recovery`; development firmware appears
  only with `?mode=development`. Production deployments must never link to
  those modes from public marketing surfaces.
- **Verification is enforced at the install gate, per build.** The channel UI
  displays the provenance results produced by the validation layer in
  `scripts/utils/firmware-provenance.js`, and the install gate additionally
  verifies the downloaded bytes (SHA-256 integrity and Ed25519 signature
  against the pinned trust list) before install is armed. Signing *metadata*
  in the manifest is never presented as a completed verification — see
  [`firmware-provenance.md`](firmware-provenance.md) for the full trust
  model.
- **Channel synonyms.** `general`, `ga`, `release`, `prod`, `production`,
  `lts` map to **Stable**. `rc`, `candidate` map to **Beta**. `prerelease`
  maps to **Preview**. `alpha`, `nightly`, `canary`, `experimental` map to
  **Development**. `recovery`, `rollback`, `restore`, `unbrick` map to
  **Recovery**. The full alias map lives in
  [`../scripts/utils/release-channels.js`](../scripts/utils/release-channels.js).
- **Acknowledgement is bound to firmware identity.** Consent ticked for one
  risky build does **not** carry over to a different risky build. Each
  acknowledgement is internally bound to a firmware-identity signature
  derived from `(channel, build ID/URL, version, config_string, deprecated,
  deprecation_reason)`. If any of those fields change — including a hardware-
  profile switch in step 4, a new beta/preview/dev version appearing in the
  manifest, the deprecated flag flipping, or the deprecation reason being
  rewritten — the gate treats prior consent as stale and forces the user to
  acknowledge again. The signature helper is
  `getFirmwareAcknowledgementSignature` in
  [`../scripts/utils/release-channels.js`](../scripts/utils/release-channels.js); the
  prune-on-mismatch enforcement lives in `state.js`.
