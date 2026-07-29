# Preset consolidation (SENSE360-CANONICALISATION-001 PR 14)

**Canonical id:** `SENSE360-CANONICALISATION-001` PR 14
**Type:** Migration plan of record, committed before implementation. Charter
scope: *use canonical room names in customer selection; remove the Living
Room duplicate product and preset; retain living room only as a recommended
use case for Hallway / Landing; remove customer-facing fan-control kit
cards; keep valid advanced configurations in the advanced path only;
preserve current commercial visibility.* Repository:
`sense360store/WebFlash`, stacked on PR 13 (the canonical SOT import);
merge order after it.

## Starting truth (survey of 2026-07-29)

The charter was authored against an earlier tree. Several scope items are
already satisfied and this PR records the evidence rather than re-doing
them:

- **No Living Room preset exists.** `scripts/data/kits.json` carries
  exactly two visible presets (Bathroom, Bedroom). The former Living and
  Corridor cards (which shared one firmware config) were retired with the
  earlier kit-card cleanups; only two stale code comments still mention
  them (`scripts/app.js`, `scripts/promote-to-stable.js`).
- **No customer-facing fan-control kit cards exist.** The five fan kit
  cards were retired under WF-H1-REIMPORT-CLEAN-001 and the kits.json
  authoring log pins that fan configs stay out of the preset picker; fan
  configurations remain reachable only through the advanced module
  builder behind the engine-owned preview-channel acknowledgement plus
  the layered fan-control (and FanDAC address-switch) acknowledgements.
- **Customer selection is already room-led.** The taxonomy guard pins
  that the view leads with the room choice and that every visible preset
  carries `room_label` + `recommended_rooms` joined verbatim to its SOT
  bundle record.

What is genuinely open:

- **Living room placement is SOT-owned data.** `recommended_rooms` come
  verbatim from SOT `bundles.yaml` through the mirror, and the taxonomy
  guard enforces exact equality per preset. As mirrored at SOT `ee2d1c5`,
  "living room" appears under `bedroom-poe`, `kitchen-poe`, `pure-smart`
  and `hallway-landing-poe`. WebFlash cannot unilaterally narrow the
  Bedroom card's room list without diverging from the SOT record, and
  `hallway-landing-poe` is `concept` status, which the guard rightly
  forbids from backing a visible preset. The charter direction therefore
  needs an SOT-side `recommended_rooms` change first, made in a separate
  SOT PR per the operating model, never bundled here.
- **Stale Living / Corridor comments** in `scripts/app.js` and
  `scripts/promote-to-stable.js` describe retired cards as if current.
- **No guard pins the two already-satisfied removals.** Nothing today
  fails if a fan-control kit card or a duplicate room card returns.

## Contracts that survive unchanged

1. **Commercial visibility is preserved.** No bundle becomes visible,
   available or buyable; the posture flags stay all-false; the Kitchen
   candidate stays withheld from the picker.
2. **SOT owns commercial data.** Room lists, names, status and
   buyability change only by SOT edit plus mirror regeneration, never by
   WebFlash authorship; the PR 13 identity chain and drift gates are not
   weakened.
3. **Install gates are untouched.** Advanced-path acknowledgements
   (preview channel, fan control, FanDAC address switch, TRIAC manual
   warning) stay exactly as they are.
4. **The Bathroom preset stays the only default and recommendation.**

## Slices

1. **Evidence pass and guards for the satisfied items.** Record the
   already-removed Living Room preset and fan kit cards as verified;
   add guard assertions pinning that no visible preset ever carries a
   fan-bearing firmware config and that no two visible presets share a
   firmware config (the duplicate-card class); correct the two stale
   Living / Corridor comments. **Executed 2026-07-29.** The
   duplicate-card guard already existed in the taxonomy suite (one card
   per config, pinned); the fan-config guard is new (`FanRelay`,
   `FanPWM`, `FanDAC`, `FanTRIAC` tokens banned from every visible
   preset's firmware config); both stale comments now state the
   present-tense truth (the Living / Corridor pair is retired and the
   dedup paths are safety nets).
2. **SOT reconciliation recommendation (separate deliverable, not a
   WebFlash change).** Prepare the owner-facing recommendation for the
   SOT-side `recommended_rooms` narrowing (living room retained only on
   `hallway-landing-poe`) so the owner can decide it in SOT; the
   WebFlash-side room-list change lands only after SOT accepts and the
   mirror regenerates (this PR does not wait on it and does not claim
   it). **Executed 2026-07-29 — recommendation recorded below; no SOT
   edit was authored.** The survey found the question is narrower than
   the plan assumed, because an owner decision already covers most of
   it:

   **Owner recommendation — living room placement.** OD-SOT-006
   (decided 2026-07-25, owner) states in SOT `bundles.yaml` that the
   RoomIQ + LED composition (`hallway-landing-poe`) is "the one physical
   RoomIQ + LED bundle; living room is a recommended room on it, never a
   second product", and the duplicate SKU `S360-KIT-LIVING-P` was
   deleted upstream under programme PR 06. The charter line "retain
   living room only as a recommended use case for Hallway / Landing"
   therefore has two readings, and the choice is the owner's:

   - **Reading (b), product identity — RECOMMENDED.** Living room must
     never be a product, card, SKU or preset of its own; the composition
     it pointed at is `hallway-landing-poe`, where it is a recommended
     room. This is exactly what OD-SOT-006 decided and PR 06 executed:
     the charter item is already satisfied and no SOT edit is needed.
     SOT's own row comments deliberately keep "living room" as
     marketing positioning on other one-physical-product bundles
     (`bedroom-poe`: "room labels are marketing positioning"), which
     reading (a) would gut.
   - **Reading (a), strict surface narrowing.** "living room" appears in
     `recommended_rooms` of `hallway-landing-poe` only, requiring SOT
     edits removing it from `bedroom-poe`, `kitchen-poe` and
     `pure-smart` (and optionally the paused, never-rendered
     `air-quality-starter` legacy row). The visible effect in WebFlash
     today would be one string leaving the Bedroom card's recommended
     rooms once the mirror regenerates.

   If the owner intends reading (a), the change is three lines in SOT
   `bundles.yaml` plus a mirror regeneration in a follow-up WebFlash
   commit; this PR is correct under either reading and does not wait.
3. **Canonical room names in selection.** Verify the rendered room
   vocabulary in the picker equals the SOT `recommended_rooms` strings
   and the preset `room_label`s (no invented room names); pin with a
   guard where missing. **Executed 2026-07-29.** `recommended_rooms`
   were already pinned verbatim to the SOT record per preset; the new
   guard requires each card's `room_label` to be one of its own
   recommended rooms, so the picker can never invent a room name outside
   the canonical SOT vocabulary.
4. Docs, execution notes here, full verify pass, PR.

## Honesty limits

Nothing here changes commercial state, firmware, `manifest.json`,
`firmware/sources.json`, `REQUIRED_CONFIGS`, release channels or install
gates. No preset is added; no room card becomes visible or hidden; the
SOT-owned room-list narrowing is recommended to the owner, never
performed from WebFlash. Release-One (`Ceiling-POE-VentIQ-RoomIQ`)
remains the production stable customer baseline.
