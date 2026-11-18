# Pebble concept page (draft)

This folder proposes a public, **static information page** at `https://sense360store.github.io/WebFlash/pebble/` after a reviewed merge and the existing GitHub Pages deployment succeed.

It is deliberately **not** part of the WebFlash installer, firmware manifest, kit picker, signed assets or product catalogue.

## Source and update policy

The private engineering record is `sense360store/concept` draft PR #89 and issue #88, in particular `sense360-pebble/` from branch `codex/sense360-pebble-c42-engineering-loop` until reviewed and merged. No GitHub API calls or external requests are made at runtime. The content is a dated public snapshot, **not a live synchronised dashboard**.

When engineering reaches a material new evidence gate, update this page by its own WebFlash PR, review wording against actual physical tests and source CAD, then merge/publish only after the owner's approval. Never auto-promote this concept into the kit selection or firmware catalogue.

As of 18 November 2026:
- C4.1 housing provisional: 108 x 130 x 76 mm.
- C4.2 PoE-inclusive placement audit; no new shell.
- Actual physical successes: three-board printed spacer assembly visually fits, SPS30 42 mm width gauge slides.
- Remaining: RJ45 service access, SPS30 air duct separation, PIR/radar optics, assembly integration, slicing and whole-enclosure print.
- **No complete prototype, no H2S slice evidence, not available for sale, no production release.**

## Security and build boundary

Two self-contained documents: `index.html` and `pebble.css`.
- Same-origin CSS and fonts; no JavaScript, tracking, APIs, extra dependencies, firmware manifest operations or external images.
- Uses existing Sense360 favicon and locally hosted fonts.
- Local CSP blocks scripts and network connections.
- Live WebFlash application and publishing pipeline remain untouched.

## Verification before merge

- Validate HTML syntax and responsiveness in browser.
- Test directly at `/WebFlash/pebble/` on GitHub Pages after publishing; test relative CSS, favicon and font paths.
- Confirm contrast, keyboard navigation, mobile readability and alt/description text.
- Check installer unchanged with repository's required CI and local gates.
- Confirm public copy does not misrepresent commercial availability or physical verification.
