# WebFlash documentation index

The canonical flasher URL is <https://sense360store.github.io/WebFlash/>.
Every reference to WebFlash as a destination uses that address.

## Getting started

- [`user-guide.md`](user-guide.md) — the full flashing guide: requirements,
  quick start, configuration options, the installation process, Wi-Fi setup,
  post flash validation, support features, and accessibility.
- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) — detailed troubleshooting
  for connection, browser, and flashing problems.
- [`../SUPPORT.md`](../SUPPORT.md) — where to file defects, where to ask
  questions, and how order or warranty matters are routed.

## Hardware reference

- [`hardware-options.md`](hardware-options.md) — the operator facing option
  inventory (friendly names and SKUs) and the compatibility matrix the wizard
  enforces.
- [`../CLAUDE.md`](../CLAUDE.md) — carries the authoritative Sense360 SKU
  table (engineering reference).

## Configuration

- [`kit-configuration.md`](kit-configuration.md) — the kit / SKU picker: how
  kit selection maps to manual configuration, shareable links, diagnostics,
  and how maintainers add a kit.
- [`release-channel-policy.md`](release-channel-policy.md) — WebFlash's
  install time release channel policy (defaults, visibility, warning copy,
  acknowledgements).
- [Release channels on sense360store/esphome-public](https://github.com/sense360store/esphome-public/blob/main/docs/release-channels.md)
  — what stable, preview, and experimental mean for a customer and what
  support each receives.

## Trust, publishing, and operations (maintainers)

- [`architecture.md`](architecture.md) — the canonical architecture
  narrative: publishing pipeline, wizard frontend, the `manifest.json`
  boundary, the cross repo contract, and the deploy gate.
- [`firmware-provenance.md`](firmware-provenance.md) — the firmware trust
  model: preflight checks, provenance validation, the enforced signature and
  integrity install gate, required manifest fields, sidecar metadata, and the
  reviewer checklist.
- [`cache-and-deployment.md`](cache-and-deployment.md) — cache and version
  policy, manifest freshness, service worker update behaviour, and the
  deployment security headers.
- [`../DEVELOPER.md`](../DEVELOPER.md) — maintainer guide for publishing
  firmware.
- [`../security.md`](../security.md) — security posture and known gaps.
- [`sense360-webflash-status.md`](sense360-webflash-status.md) — canonical
  product and release status (what installs today, what is preview only,
  what is blocked).
- [`standing-invariants.md`](standing-invariants.md) — the standing blockers
  and invariants that gate every WebFlash PR.
- `release-gates/` — the WebFlash first release gate and dry run handoff
  records.
- [`archive-index.md`](archive-index.md) — index of archived historical
  records.

## Contributing

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — how to file issues, how to
  open pull requests, the local gate every change must pass, and the
  documentation conventions.
