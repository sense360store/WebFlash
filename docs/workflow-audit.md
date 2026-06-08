# WebFlash GitHub Actions workflow audit

Date: 2026-06-08
Reviewed at: `main` @ `76268a9`

Scope: every GitHub Actions workflow in `sense360store/WebFlash` (the three committed workflow files plus the two GitHub-managed workflows) and the Dependabot config. This is a review-first audit. The findings below are backed by the workflow files, the Actions run history, and the live deployed site.

## Evidence sources

- The three workflow files read at `main` (`76268a9`).
- Workflow and run history via the GitHub Actions API (`list_workflows`, `list_workflow_runs`, `list_workflow_jobs`).
- The live deployed manifest at `https://sense360store.github.io/WebFlash/manifest.json`.
- `actionlint` v1.7.12 with `shellcheck` 0.10.0 on the workflow files.
- Local execution of both test suites on `main` HEAD.

## Per-workflow verdicts

### firmware-publish.yml — "Publish: Deploy Site (auto on merge)" — KEEP

- Triggers: `push` to `main` (with a `paths` filter), `release: [published]`, `workflow_dispatch`.
- Role: the live deploy pipeline. Jobs run in a chain: `test` (the unit suites), then `build` (naming-policy validation, firmware signing, manifest generation, the release-note channel policy, and the `REQUIRED_CONFIGS` allowlist), then `deploy` (the GitHub Actions Pages publish via configure-pages plus upload-pages-artifact plus deploy-pages), then `smoke-test` (a post-deploy read-only HTTP check of the live origin).
- Run history: workflow id 198570890, 808 runs, last run #808 succeeded on 2026-06-08 (`76268a9`). It is the busiest and most load-bearing workflow.
- Overlap: none that is redundant. It is the publish stage of the release chain (author source, then import firmware, then publish).
- Gap: its `test` job is the only place the suites run, and only post-merge (see hypothesis A). The fix is a separate PR, not an edit to this file.
- actionlint: clean.

### add-firmware-source.yml — "Release 4: Add Source" — KEEP

- Trigger: `workflow_dispatch` only.
- Role: publish-time source authoring. Reads an upstream release, pins the SHA256 and block tokens, upserts one `firmware/sources.json` entry, proves it resolves with a dry-run importer, then opens a PR. It never signs, regenerates the manifest, or deploys.
- Run history: workflow id 290534416, 5 runs, last success 2026-06-07. Created 2026-06-06, actively used.
- Verdict: keep. It is stage 4 of the release chain and does not overlap stage 5 or the publish workflow.
- actionlint: clean.

### firmware-import.yml — "Release 5: Import Firmware" — KEEP

- Trigger: `workflow_dispatch` only.
- Role: pulls the raw `.bin` assets declared in `firmware/sources.json`, verifies checksums and release-body metadata, writes the `.meta.json` sidecar, regenerates `manifest.json` and the per-build manifests, refreshes the vendored catalog fixture, and auto-commits to the current branch. It does not auto-merge or auto-deploy.
- Run history: workflow id 275965529, 3 runs, last success 2026-06-07 (run #3).
- Verdict: keep. It is stage 5 of the release chain.
- actionlint: two pre-existing info-level `SC2086` findings (the `${REPO_FLAG}` / `${TAG_FLAG}` deliberate word-splitting). Benign and out of scope for this audit. Optional future cleanup only.

### pages-build-deployment (GitHub-managed) — VESTIGIAL, no action

- This is the built-in GitHub Pages branch builder. It is not a committed file.
- Run history: workflow id 172578453, 277 runs, all with event `dynamic`, the last on 2025-10-16. It has had zero runs in roughly eight months, since the day `firmware-publish.yml` was created (2025-10-16). Since the Actions-based publish took over, this builder has been dormant.
- Verdict: vestigial. It cannot be deleted (GitHub-managed) and needs no action. See hypothesis B.

### Dependabot Updates / .github/dependabot.yml — KEEP

- Config present: `github-actions` ecosystem, `directory: "/"`, weekly, commit prefix `ci`.
- Working: recent Dependabot PRs (for example #521 through #527) bumped the SHA-pinned actions, which is exactly its job given that every `uses:` is pinned to a full commit SHA.
- Verdict: keep, sensibly scoped. See hypothesis E for an optional, low-value enhancement.

## Hypotheses

### A. No PR-level CI gate — CONFIRMED (highest priority). Fixed in PR #539.

The unit suites (`npm test -- --ci` and the Python `unittest` suite) run only inside `firmware-publish.yml`'s `test` job, which triggers on push to main, release, and manual dispatch. No workflow triggers on `pull_request`, and `pull_request` has never appeared in `firmware-publish.yml`'s history. PRs are therefore not test-gated, and test breakage is caught only post-merge at deploy time.

The impact is concrete and recent. On 2026-06-08 two consecutive merges to main failed the deploy workflow at the "Run unit tests" step:

- Run 27125410234 (merge of #535): `test` failed at step 5 "Run unit tests"; `build`, `deploy`, `smoke-test` skipped.
- Run 27126830500 (merge of #536): `test` failed at step 5 "Run unit tests"; `build`, `deploy`, `smoke-test` skipped.

Because `build` and `deploy` depend on `test`, the Pages deploy was blocked for every merge in that window until #537 ("Fix stale assumptions in deploy-gate tests") landed and run #808 went green. A pre-merge gate would have surfaced the breakage on #535 / #536 before they merged.

Fix: PR #539 adds `.github/workflows/ci.yml`, a read-only workflow that runs the same two suites on `pull_request`. It mirrors the deploy gate's `test` job exactly (same action pins, Node 20, Python 3.11, same commands), has `permissions: contents: read`, and never deploys. Both suites pass on the current `main` HEAD (Jest 66 suites / 1146 tests; Python 143 tests).

### B. Pages source vs pages-build-deployment — Pages source is "GitHub Actions" (correct). No action.

`firmware-publish.yml` publishes with the GitHub Actions Pages method (configure-pages plus upload-pages-artifact plus deploy-pages). The evidence that the Pages source is already set to "GitHub Actions":

- The `deploy` job (`actions/deploy-pages@v5`) concludes `success` on the recent runs (for example run #808). `deploy-pages` fails when the Pages source is "Deploy from a branch", so a succeeding deploy is proof the source is "GitHub Actions".
- The live site serves `source_commit` `76268a94...`, which is the current `main` HEAD that run #808 published, and the post-deploy `smoke-test` job (which fetches the live origin and asserts the commit matches) passes. The Actions deploy is what is actually serving the site.
- `pages-build-deployment` (the legacy branch builder) has not run since 2025-10-16, so it is not the publisher.

Conclusion: the source is "GitHub Actions", `pages-build-deployment` is vestigial, and no action is required. A maintainer can optionally double-confirm in Settings, Pages, where the source should read "GitHub Actions" (`build_type: workflow`). The Pages settings API is not readable anonymously and there is no MCP tool for it, so this is a visual confirmation only, not a blocker.

### C. Deploy paths filter — Real gap (app.css, assets/). Fixed in PR #540.

The Pages artifact is uploaded from the repo root, so everything at the root is served, but the deploy `push` trigger only fires for a specific path list. Two served paths fall outside it:

- `app.css` at the repo root. It is injected at runtime by the live 2.0 view (`scripts/shell.js:63`) and precached by the service worker (`sw.js` `STATIC_ASSETS` includes `./app.css`). The filter matched `css/**`, but a root-level `app.css` is not under `css/`, and there was no `*.css` entry. It also changes regularly (recent commits e413b9b, 5b15cc4, 665685c touched it).
- `assets/**`. `assets/sense360-logo.png` is referenced by `scripts/app.js:28` and precached by `sw.js`. The filter matched root `*.png`, but `*.png` does not match `assets/*.png`.

So a commit touching only `app.css` or only a file under `assets/` would not fire the deploy and would sit unpublished until an unrelated push touched a matched path. The `__tests__/**` exclusion is correct and should stay (a test-only change does not alter the served site; `workflow_dispatch` is the manual escape hatch for the rare case where a deploy must be re-run).

Fix: PR #540 adds `*.css` and `assets/**` to the filter. No other trigger, job, or step changes.

### D. Production signing key fallback — Currently prod-signed. Latent fail-open risk. Needs a maintainer decision.

The build step warns that without `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` in CI it falls back to development-mode signing with the committed `test_only` dev key, producing a manifest the deployed wizard refuses.

Current state (good): the live manifest is fully production-signed. Every build, including the stable `Ceiling-POE-VentIQ-RoomIQ` (v1.0.4), carries key id `sense360-prod-2026-02` with no `test_only` or development markers. The production signing secret is configured, and the deployed manifest is prod-signed and accepted by the wizard.

Latent risk (report only, no code change made): the fallback is fail-open and silent. If the secret were ever unset, rotated out, or expired, the build step would emit only a `::warning::` and proceed in development mode, and the `deploy` job runs before the `smoke-test` job, so a dev-signed manifest would be published to the live site before the smoke test catches the dev-key signatures. The smoke test fails closed, but only after the bad manifest is already live.

This is a correctness and security review item, not something to fix by adding keys (no key was added or fabricated). Whether to harden the deploy gate to fail closed on push-to-main and release when the production secret is absent (rather than silently dropping to dev mode and publishing) is a pipeline-behavior change that the maintainer should decide. See "Needs Neil".

### E. Dependabot — Present and sensibly scoped. Optional npm ecosystem add.

`.github/dependabot.yml` covers the `github-actions` ecosystem weekly, which is the security-relevant one here (every `uses:` is SHA-pinned and Dependabot keeps the pins current). The repo's only npm dependencies are devDependencies (`jest`, `jest-environment-jsdom`) with a committed `package-lock.json`; the shipped wizard has no runtime npm dependencies. Adding the `npm` ecosystem to Dependabot would keep the test toolchain current, but it is low value (dev-only, not shipped) and is optional, not a gap.

## Pull requests opened (do not merge without review)

- PR #539 — `ci: add pull_request test gate` (`.github/workflows/ci.yml`). Closes hypothesis A. https://github.com/sense360store/WebFlash/pull/539
- PR #540 — `ci: trigger deploy on served static-asset changes (app.css, assets/)` (`firmware-publish.yml` paths). Closes hypothesis C. https://github.com/sense360store/WebFlash/pull/540

Both were validated with `actionlint` (exit 0 on the changed and added workflows). Neither weakens any gate, and neither changes firmware, the manifest, `REQUIRED_CONFIGS`, signing, or release-channel logic.

## Needs Neil (cannot be fixed in code, or require a decision)

1. Pages source confirmation (optional, not a blocker). Behaviorally confirmed as "GitHub Actions". If you want belt-and-suspenders, open Settings, Pages and confirm the source reads "GitHub Actions". The settings API is not readable without credentials I have here.
2. Production signing fail-open (decision). Today the manifest is prod-signed and fine. Decide whether the deploy gate should fail closed when `WEBFLASH_FIRMWARE_PRIVATE_KEY_B64` is missing on push-to-main and release, instead of silently signing with the dev key and publishing a manifest the wizard rejects. If you want this, it can be a small follow-up PR; it was intentionally not done here to avoid changing live-pipeline behavior without sign-off.
3. npm Dependabot ecosystem (optional, minor). Add an `npm` entry to `.github/dependabot.yml` if you want the test toolchain (`jest`) tracked. Dev-only, low value.
4. Pre-existing SC2086 in firmware-import.yml (optional, minor). Two info-level shellcheck nits on the deliberate `${REPO_FLAG}` / `${TAG_FLAG}` word-splitting. Benign; clean up only if desired.
