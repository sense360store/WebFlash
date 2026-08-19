# Reviewer recovery and reflash (SENSE360-REVIEW-RELEASE-001)

Programme: `SENSE360-REVIEW-RELEASE-001`, Gate C — flash and recovery. Issue:
[#604](https://github.com/sense360store/WebFlash/issues/604). SOT charter:
`programmes/sense360-review-release-001.yaml` in
[`sense360store/SOT`](https://github.com/sense360store/SOT).

This record defines the route a reviewer follows to recover or reflash the
**Sense360 review unit** — Sense360 Core (`S360-100`) + RoomIQ (`S360-200`) +
AirIQ (`S360-210`) — and states exactly what that route does and does not
mean.

## The route

The reviewer opens one documented link. It carries **board selections**, never
a firmware identifier:

```
https://sense360store.github.io/WebFlash/?core=core&mount=ceiling&power=poe&airiq=airiq&roomiq=roomiq
```

WebFlash resolves those selections to the firmware target
`Ceiling-POE-AirIQ-RoomIQ`. The reviewer never types, reads or needs the config
string, and never opens the module builder to hunt for the right boards.

This is the **existing** advanced / manual share-link shape
(`scripts/utils/url-config.js`), consumed through the engine. It is not a new
flashing system, not a new URL namespace and not a new customer room preset.

### Why this needed a code change

The 2.0 view has been the sole view since PR 13, and it never calls the 1.0
`initializeWizard()`. Nothing applied the URL to the engine before
`initFromEngine()` read the engine back, so **every** share link — not just the
reviewer's — silently collapsed to the bare `Ceiling-POE` default.

`engine.state.applyUrlConfiguration()` is the engine-owned hydration that
fixes it. It deliberately does not route through `applyConfiguration()`, whose
final `updateConfiguration()` re-derives state from the 1.0 render layer's
`input[name=…]` radios; those inputs do not exist in the 2.0 view, which is
what wiped the modules. Hydration resolves a **selection only**: no step is
jumped, no firmware is chosen, and no acknowledgement, provenance, integrity,
freshness, channel or install gate is touched or bypassed.

## What the reviewer meets, in order

| Stage | What happens |
|---|---|
| Identify | The three boards arrive pre-selected from the link; the resolved target reads `Ceiling-POE-AirIQ-RoomIQ`. |
| Pre-flight | Browser support (Web Serial), secure context, manifest freshness and firmware verification all run before install is armed. |
| Channel | The build is served on the **preview** channel, so the preview acknowledgement is required. This is a presentation demotion recorded by the owner on 2026-07-28: the published filename keeps its immutable `stable` channel while the served channel is `preview`. |
| Confirm | The keep-powered acknowledgement and the preview-risk acknowledgement must both be given. |
| Install | ESP Web Tools drives connect / erase / write / verify. |

If the unit will not boot at all, the **Rescue** entry in the window bar flashes
the bundled rescue image first; the link above then restores the product
firmware.

## Naming

`OD-SOT-011` is **open**: which commercial room product the review unit is has
not been decided. Reviewer-facing copy therefore says *Sense360 review unit* or
names the boards — Core + RoomIQ + AirIQ — and never labels the unit Kitchen or
Bathroom. WebFlash renders it as a custom build with its board list, which is
already correct. Canonical SOT-mirrored labels elsewhere are untouched.

## What this route is not

- **Not a room preset.** `scripts/data/kits.json` gains no card. The
  recommended and default preset stays Bathroom PoE.
- **Not a commercial claim.** Firmware being served says nothing about
  availability. `OD-SOT-009` keeps the candidate Kitchen room product hidden and
  non-buyable; nothing here changes that.
- **Not a fan or experimental path.** The link carries no `fan` parameter, the
  resolved target contains no `FanRelay` / `FanPWM` / `FanDAC` / `FanTRIAC`
  token, and the install view shows none. The Core relay work in
  esphome-public #875 is not permission to expose the external fan-control
  product family.
- **Not a picker change.** `OD-SOT-012` — whether this configuration may be
  surfaced in the customer-facing WebFlash journey — is **open**. This route
  uses the pre-existing advanced/manual URL path only, which is why it needs no
  answer to that question. Making the route discoverable from inside WebFlash's
  customer UI would be new customer-facing exposure and is held for that
  decision.

## Artifact parity

**UX recovery readiness and artifact recovery readiness are separate, and only
the first is delivered here.**

The served artifact for `Ceiling-POE-AirIQ-RoomIQ` is
`Sense360-Ceiling-POE-AirIQ-RoomIQ-v1.0.9-stable.bin`, imported from
esphome-public release `v1.0.9`. That tag points at commit
`ab79d564c1a2d0c7613f79a11038a334f4af2180`, dated **2026-07-06**.

The reviewer Gate B firmware contract merged in esphome-public
[#875](https://github.com/sense360store/esphome-public/pull/875) on **2026-08-19**
(merge commit `d99df104656828aaadba6935a5301180147dc3fe`). `v1.0.9` is **not** a
descendant of that work — verified by `git merge-base --is-ancestor`.

So the served binary **predates the reviewer firmware surface**. Reflashing a
review unit from WebFlash today would restore the older behaviour: Formaldehyde,
Presence Status, Radar Target Count and the Core Relay all return to the default
Home Assistant view, and the customer-default surface goes back from 13 entities
to the pre-#875 state.

**Consequence:** the route below is the correct reviewer recovery *journey*, but
it is not yet the final reviewer recovery *artifact*. Closing that gap needs, in
order and outside this issue:

1. an owner-authorised upstream release of esphome-public `main` at or after
   `d99df10`;
2. a WebFlash import of that release through
   `scripts/import-firmware-sources.py` (checksum-verified, `block_tokens`
   enforced), regenerating `manifest.json` with `scripts/gen-manifests.py`;
3. the reviewed served-surface fixture
   (`__tests__/fixtures/expected-surface.json`) updated in the same PR.

None of that is performed here. Releasing, tagging and publishing are
owner-reserved, and this issue publishes nothing.

## Verification performed

Driven in headless Chromium (Playwright) against a local `python3 -m http.server`
serving this tree:

| Check | Result |
|---|---|
| Reviewer link resolves | target reads `Ceiling-POE-AirIQ-RoomIQ` |
| Reviewer reaches install | Step 2 · Install, build identity `Ceiling-POE-AirIQ-RoomIQ`, `Firmware v1.0.9 (preview)` |
| Pre-flight gates render | browser support, secure context, manifest freshness, firmware verification |
| Signature gate active | refused the local build: *"Firmware was signed with a test-only key and cannot be installed by the production WebFlash app."* |
| Preview acknowledgement | present and required before install |
| Fan / TRIAC in reviewer journey | none, at Identify or Install |
| Commercial copy | none |
| Console / page errors | 0, across the default landing, the reviewer link and the install step |
| Default landing unchanged | room picker still leads, Bathroom still recommended, no Kitchen card |
| Existing share links | `Ceiling-POE-VentIQ-RoomIQ` and `Ceiling-POE-RoomIQ` also resolve again |

**Not verified, and not claimed.** No physical flash was performed: no Sense360
hardware and no Web Serial device were attached to this environment, so
connect / erase / write / verify against a real hub is untested here. The
unsupported-browser path could not be exercised faithfully either — Playwright's
Chromium always exposes `navigator.serial`, and spoofing the user-agent alone
makes the capability probe report the real API. That path stays covered by
`__tests__/preflight-capabilities.test.js` and the install-view copy tests.

## Guard

`__tests__/reviewer-recovery.test.js` pins this contract: the link resolves to
the exact review composition, the reviewer supplies no config string, the link
round-trips deterministically, no preset or default is added, fan and TRIAC stay
out, the channel and integrity gates remain declared, and an unserved
configuration cannot resolve to a served build.
