# Room preset (kit) configuration mode

This page documents the room-preset picker in Step 1 of the wizard and how
preset metadata maps to manual configuration. It was relocated from the
repository README when it became a short front door (REPO-CUSTOMER-READY-001
S4) and reconciled to the room-led taxonomy by
WEBFLASH-TAXONOMY-RECONCILE-001.

## Room presets are firmware presets, not commercial listings

A WebFlash **room preset** (an entry in
[`../scripts/data/kits.json`](../scripts/data/kits.json) — the file keeps its
historical name to avoid compatibility churn) selects a known hardware
composition and resolves to a real firmware config in `manifest.json`. It is
an **installer preset**, never a commercial availability declaration:

- Firmware being stable or present in the manifest does not mean the
  corresponding commercial bundle is available or buyable.
- Commercial bundle names and status may only come from `sense360store/SOT`;
  WebFlash mirrors the slice it needs into
  [`../scripts/data/sot-commercial-mirror.json`](../scripts/data/sot-commercial-mirror.json)
  (synchronized evidence with provenance — refresh with
  `python3 scripts/refresh-sot-mirror.py --sot-path <local SOT checkout>`;
  never hand-edit it). As mirrored today, SOT has **no** bundle in the
  `available` state, so no customer copy may show "buy now", "on sale",
  prices, shop links, or equivalent.
- Identical supplied hardware is **one** preset with several
  `recommended_rooms` (e.g. the Bedroom preset also covers living rooms,
  home offices and nurseries) — never duplicate cards per room.
- Commercial status is not an install gate; the mirror only constrains copy.

Step 1 of the wizard offers two paths:

1. **Choose your room** — the primary path. The Step 1 picker loads room
   presets from [`../scripts/data/kits.json`](../scripts/data/kits.json):
   the room label leads the card, the preset's formal name, board contents
   (with SKUs) and the firmware config string stay visible as technical
   detail underneath.
2. **Build it module by module** — the advanced per-module flow (Mount →
   Power → Modules → Review). All compatibility checks, conflict warnings,
   release channel rules, provenance gating, and shareable-link behaviour
   remain unchanged in manual mode. This stays the secondary route.

Selecting a kit is shorthand for the manual selections that match it: the
kit's `wizard_state` is fed through the same `setState()` that manual
selection uses, the existing compatible-firmware lookup runs, and the user
is taken to Step 5 to review the recommended firmware. Kit selection
**never** bypasses provenance, release-channel acknowledgement, the freshness
banner, or the install gate — it just fills in the same boxes a user would
have filled in manually.

## Adding a new kit

Edit [`../scripts/data/kits.json`](../scripts/data/kits.json) and append a kit
entry. Each kit is an object with the following fields:

| Field | Required | Description |
|---|---|---|
| `sku` | ✅ | Customer-facing preset identifier. We use the `S360-KIT-…` prefix to keep preset SKUs distinct from per-module SKUs (`S360-100`, `S360-200`, …). Match is case-insensitive. |
| `display_name` | ✅ | The preset's formal name, pinned to the canonical bundle name mirror (`__tests__/fixtures/room-bundle-skus.json`). Shown as technical detail under the room label — it is a naming-parity surface, not an availability claim. |
| `room_label` | ✅ (visible presets) | The customer room label that leads the card (e.g. `Bathroom`, `Bedroom`). |
| `recommended_rooms` | ✅ (visible presets) | All rooms the same physical preset covers, mirrored from the SOT bundle record. Rendered as "Also suitable for …". |
| `presentation` | ✅ (visible presets) | Always `firmware-preset` — marks the entry as an installer preset, never a commercial listing. |
| `commercial_bundle_id` | ✅ (visible presets) | Join key to the bundle record in `scripts/data/sot-commercial-mirror.json` (e.g. `bathroom-poe`). Drift-guarded by `__tests__/webflash-taxonomy-reconcile.test.js`. |
| `description` | optional | One-sentence, outcome-led description shown under the room label. Must never contain commerce language, Base/Pro tiers, or internal programme IDs. |
| `recommended` | optional | Installer firmware recommendation flag (defaults to `false`) — never a commercial claim. |
| `sample` | optional | Set to `true` for example/demo entries that integrators should replace with real SKUs. The diagnostics bundle records the `sample` flag so support can tell a real customer order from a placeholder selection. |
| `wizard_state` | ✅ | The exact wizard state the kit maps to. Must contain `mount: "ceiling"` and a `power` value (`usb`, `poe`, or `pwr`). All module slots default to `"none"` if omitted. Keys: `mount`, `power`, `bathroom`, `airiq`, `ventiq`, `roomiq`, `fan`, `led`, `voice`. |
| `components` | optional | Display-only list of `{sku, label}` pairs (e.g. `S360-100 — Sense360 Core`). |
| `headers_required` | optional | Display-only list of header names required to wire the kit up. |
| `firmware_config_string` | ✅ | Must exactly match a `build.config_string` in `manifest.json` (e.g. `Ceiling-POE-VentIQ-RoomIQ`). The kit-config loader rejects entries that don't resolve. |
| `firmware_channel` | optional | Default channel preference (`stable`, `beta`, `preview`, `dev`). The release-channel picker still requires the user to acknowledge non-stable channels — kit metadata never bypasses this. Defaults to `stable`. |
| `notes`, `known_limitations` | optional | String arrays surfaced in the explanation panel (currently unused; reserved). |

When you add a new firmware configuration to `manifest.json`, also add the
`config_string` to `REQUIRED_CONFIGS` in
`.github/workflows/firmware-publish.yml` so CI keeps the manifest covered.
New shipping firmware should arrive through the cross-repo importer —
declare it in [`../firmware/sources.json`](../firmware/sources.json) and run
[`../scripts/import-firmware-sources.py`](../scripts/import-firmware-sources.py)
(the importer contract record `docs/firmware-import.md` is archived; see
[`archive-index.md`](archive-index.md)). Manual
placement of a `.bin` into `firmware/configurations/` is reserved for
hand-curated builds that already satisfy the `.meta.json` sidecar,
manifest-health, and `REQUIRED_CONFIGS` expectations.

Kits with malformed entries (missing `sku`, unknown `power` value,
unsupported `firmware_channel`, …) are silently skipped at load time so a
single bad entry can't break the whole picker. Skipped entries are
reported via `console.warn` and listed in the catalog's `skipped` array
returned by `loadKitCatalog()` — `__tests__/kit-config.test.js` exercises
each rejection path.

## How kit metadata maps to manual configuration

A kit selection runs three steps:

1. The wizard module slots are **reset to defaults** so a stale manual pick
   doesn't combine with the kit definition.
2. The kit's `wizard_state` is applied via `setState()` — the same path the
   manual flow uses. AirIQ/VentIQ exclusivity, the bathroom toggle, and the
   fan/AirIQ DAC conflict are still enforced by `state.js`.
3. The existing compatible-firmware lookup picks the firmware build that
   matches the kit's `firmware_config_string`. If no compatible firmware is
   available (e.g. the manifest is stale or the kit references a
   `config_string` that hasn't been published yet) the wizard surfaces a
   clear error and offers a fallback to manual mode.

## Unknown SKUs

If the user types or pastes a SKU that isn't in the catalog, the picker
shows: *"We could not find that kit. Check the label or choose hardware
manually."* The "Continue" button stays disabled until a valid kit is
chosen, and a one-click switch to manual mode is offered.

## Switching between kit and manual mode

- Switching to manual after a kit selection clears the kit's diagnostics
  fields but keeps the resolved hardware selections so Step 4 reflects what
  the kit applied — the user can fine-tune from there.
- Switching to kit mode after manual selections resets module slots back to
  `"none"` *before* applying the kit, so a stale manual pick can never
  silently combine with the kit definition.
- The `mode: "kit" | "manual"` field in the diagnostics bundle records
  which path was last active, plus the SKU when in kit mode.

## Shareable links

A kit-mode share link uses two extra parameters in addition to the existing
manual-mode params (`mount`, `power`, `airiq`, …):

- `configmode=kit` — explicitly requests the kit picker (defaults to `kit`
  when neither `configmode=` nor manual params are present).
- `sku=<SKU>` — the kit SKU. Match is case-insensitive.

Example: `https://sense360store.github.io/WebFlash/?configmode=kit&sku=S360-KIT-BATH-P`.

If the SKU is unknown the page falls back to the manual flow and shows a
"No kit found for SKU …" error. Existing manual share links continue to
work — the picker detects manual params (`mount=`, `power=`, …) in the URL
and stays in manual mode.

> Note: we deliberately use `configmode=…` rather than `mode=…` because
> the existing release-channel logic in `state.js` already consumes
> `mode=recovery` / `mode=development`. Keeping the kit picker on its own
> namespace prevents the two systems from clobbering each other.

## Diagnostics

The diagnostics bundle (`Copy diagnostics` in Step 5) carries a top-level
`configuration` block:

```json
{
  "configuration": {
    "mode": "kit",
    "sku": "S360-KIT-BATH-P",
    "kit_display_name": "Sense360 Bathroom Bundle — PoE",
    "kit_sample": false,
    "resolved_core": "core",
    "resolved_modules": ["ventiq", "roomiq"],
    "resolved_power": "poe",
    "resolved_firmware_config": "Ceiling-POE-VentIQ-RoomIQ"
  }
}
```

Manual mode emits a leaner block with `mode: "manual"`, `selected_core`,
`selected_modules`, and `selected_power`. Kit metadata never includes
customer identity, order details, shipping data, or anything that wasn't
already in the public kit definition.
