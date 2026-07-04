# Docs disposition manifest: esphome-public and webflash

Generated 2026-07-04 from live clones (esphome-public @ HEAD, webflash @ 7f00997).

Status: **proposed**. This manifest records the intended disposition of every documentation file across both repos. No file moves, merges, or deletions have been executed yet; the DECIDE rows need an explicit owner call before any action is taken, and the remaining rows are staged for follow-up PRs once the DECIDE rows are resolved.

Actions: KEEP (production doc, stays), KEEP-SLIM (keep but strip embedded audit trail to archive), MERGE (duplicate pair, consolidate), ARCHIVE (move to docs/archive/ or private records repo), REMOVE (working state, transfer to issues then delete), DECIDE (needs your call).

## esphome-public

### DECIDE (4 files, 64 KB)

| File | KB | Rationale |
|---|---:|---|
| `docs/sense360-roadmap-status.md` | 34 | Canonical status doc from DOCS-CONSOLIDATION-ROADMAP-001. Either keep as the single internal status page or migrate to GitHub Projects and delete. |
| `CLAUDE.md` | 14 | Agent instructions in a public production repo. Keep but sanitise, or move to .claude/ and strip internal process detail. |
| `docs/shop-commercial-source-of-truth.md` | 11 | Commercial source of truth probably should not live in a public repo at all. Move to private repo. |
| `include/README.md` | 5 | Needs a look. |

### REMOVE (1 files, 38 KB)

| File | KB | Rationale |
|---|---:|---|
| `UPCOMING_PR.md` | 38 | 38KB working queue at root. Transfer live items to GitHub issues/project, then delete. Git history retains it. |

### MERGE (4 files, 503 KB)

| File | KB | Rationale |
|---|---:|---|
| `docs/hardware/s360-311-r4-pwm.md` | 225 | Duplicate pair with s360-311-r4-fanpwm.md (naming drift). Merge into one clean S360-311 reference per official naming, archive the audit trail. |
| `docs/hardware/s360-312-r4-fandac.md` | 155 | See s360-312-r4-dac.md. |
| `docs/hardware/s360-312-r4-dac.md` | 87 | Duplicate pair with s360-312-r4-fandac.md. Same treatment. |
| `docs/hardware/s360-311-r4-fanpwm.md` | 35 | See s360-311-r4-pwm.md. |

### KEEP-SLIM (5 files, 742 KB)

| File | KB | Rationale |
|---|---:|---|
| `docs/hardware/s360-310-r4-relay.md` | 205 | Board reference with embedded audit trail. Keep a clean reference, move the trail to archive. |
| `docs/hardware/s360-410-r4-poe.md` | 192 | Board reference with embedded audit trail. Keep a clean reference, move the trail to archive. |
| `docs/hardware/s360-400-r4-power.md` | 171 | Board reference with embedded audit trail. Keep a clean reference, move the trail to archive. |
| `docs/hardware/s360-320-r4-triac.md` | 110 | Board reference with embedded audit trail. Keep a clean reference, move the trail to archive. |
| `docs/hardware/s360-100-r4-core.md` | 65 | Board reference with embedded audit trail. Keep a clean reference, move the trail to archive. |

### ARCHIVE (71 files, 4146 KB)

| File | KB | Rationale |
|---|---:|---|
| `docs/cleanup-audit.md` | 808 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/product-readiness-matrix.md` | 266 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-artifact-readiness-matrix.md` | 250 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-exposure-readiness-matrix.md` | 226 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/hardware/core-abstract-bus-reconciliation.md` | 167 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/hardware/package-readiness-matrix.md` | 159 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/blocker-burndown.md` | 134 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/package-naming-audit.md` | 122 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/hardware/board-readiness-matrix.md` | 107 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/hardware/firmware-package-mapping-audit.md` | 87 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/compile-only-firmware-validation.md` | 87 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/hardware/remaining-board-documentation-audit.md` | 68 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/product-availability-taxonomy.md` | 68 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/hardware/hardware-artifact-policy.md` | 65 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/arch-board-bundle-plan.md` | 59 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-one-hardware-audit.md` | 56 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/hardware/core-abstract-bus-001c-rebind-plan.md` | 53 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/package-poe-410-001-audit.md` | 50 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/product-led-preview-decision.md` | 50 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/preview-to-stable-promotion-gates.md` | 49 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/first-release-dryrun-checklist.md` | 46 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/package-poe-410-evidence-result.md` | 44 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-drift-audit.md` | 43 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/pre-hardware-prep-plan.md` | 42 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/product-deprecation-removal-policy.md` | 40 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/repo-freshness-roadmap-audit.md` | 40 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-compatibility-taxonomy-audit.md` | 40 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/sense360-room-bundles.md` | 39 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/product-onboarding.md` | 39 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/all-yaml-release-matrix.md` | 38 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/room-firmware-release-matrix.md` | 37 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/stable-target-expansion-plan.md` | 34 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/first-release-gates.md` | 32 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/modular-combinations.md` | 31 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/stable-target-ventiq-001-gate-closure.md` | 31 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/v1-r4-product-gap.md` | 30 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/room-firmware-release-notes.md` | 29 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-matrix-webflash-alignment.md` | 28 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-build-dryrun.md` | 28 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/kit-intent-matrix.md` | 28 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-build-dryrun-002.md` | 23 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/pre-hardware-room-bundle-release-handoff.md` | 22 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/compile-only-expansion-candidates.md` | 22 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-release-proof.md` | 21 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-contract.md` | 21 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-release-handoff.md` | 21 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-channel-policy.md` | 21 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/firmware-build-gap-report.md` | 20 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/board-combinations.md` | 19 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-publish-plan.md` | 19 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/package-triac-001-operator-bench-proof.md` | 19 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/manual-install-fan-candidates.md` | 18 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/manual-user-walkthrough.md` | 18 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/product-config-audit-2026-06.md` | 18 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-publish-results.md` | 17 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/repo-structure-audit.md` | 17 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/workflow-audit-2026-06.md` | 16 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-ci-alignment.md` | 16 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/firmware-combination-matrix.md` | 15 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/first-release-publish-readiness.md` | 15 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-compile-dryrun.md` | 15 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-one.md` | 14 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/product-release-matrix.md` | 13 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/preview-release-targets.md` | 13 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-fan-triac-build-rows.md` | 11 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-webflash-release-notes-dryrun.md` | 10 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-webflash-build-rows.md` | 10 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/release-preview-webflash-wrappers.md` | 10 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/hardware/s360-310-relay-pinmap-reconcile.md` | 8 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/room-bundle-fan-compile-results.md` | 5 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/docs-consolidation-verify-001.md` | 5 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |

### KEEP (66 files, 1018 KB)

| File | KB | Rationale |
|---|---:|---|
| `docs/hardware/artifacts/S360-410-R4.md` | 76 | Production user or developer doc. |
| `docs/compliance/mains-voltage-uk-eu-assessment.md` | 61 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/hardware/artifacts/S360-400-R4.md` | 54 | Production user or developer doc. |
| `docs/hardware/s360-100-core-connector-pin-map.md` | 47 | Production user or developer doc. |
| `docs/hardware/artifacts/S360-310-R4.md` | 38 | Production user or developer doc. |
| `docs/hardware/artifacts/S360-320-R4.md` | 34 | Production user or developer doc. |
| `docs/hardware/artifacts/S360-100-R4.md` | 30 | Production user or developer doc. |
| `docs/hardware/artifacts/S360-312-R4.md` | 28 | Production user or developer doc. |
| `docs/hardware/artifacts/S360-311-R4.md` | 27 | Production user or developer doc. |
| `docs/product-matrix.md` | 26 | Production user or developer doc. |
| `docs/ci-pipeline.md` | 26 | Production user or developer doc. |
| `docs/hardware/s360-100-core-architecture.md` | 23 | Production user or developer doc. |
| `docs/security/SECURITY-AUDIT-2026-06.md` | 22 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/hardware/s360-300-r4-led.md` | 21 | Board reference, reasonable size. |
| `docs/hardware/s360-200-r4-roomiq.md` | 21 | Board reference, reasonable size. |
| `README.md` | 21 | Front door. Polish pass for production tone. |
| `docs/hardware/artifacts/S360-200-R4.md` | 20 | Production user or developer doc. |
| `docs/hardware/artifacts/S360-210-R4.md` | 20 | Production user or developer doc. |
| `CHANGELOG.md` | 19 | Standard. |
| `docs/hardware/s360-100-native-tach-pulse-strategy.md` | 18 | Production user or developer doc. |
| `docs/configuration.md` | 17 | Production user or developer doc. |
| `docs/hardware/s360-100-native-fan-gpio-map.md` | 17 | Production user or developer doc. |
| `docs/security/rebuild-clean-credentials-001.md` | 15 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/hardware/s360-210-r4-airiq.md` | 15 | Board reference, reasonable size. |
| `docs/hardware/s360-311-module-pinmap.md` | 14 | Production user or developer doc. |
| `docs/repo-structure.md` | 14 | Production user or developer doc. |
| `docs/hardware/s360-211-r4-ventiq.md` | 13 | Board reference, reasonable size. |
| `packages/SENSE360_MODULES.md` | 12 | Production user or developer doc. |
| `docs/decisions/COMPLIANCE-001-RESOLUTION-001.md` | 12 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/product-scaffold-generator.md` | 11 | Production user or developer doc. |
| `docs/system-architecture.md` | 11 | Production user or developer doc. |
| `docs/feature-entity-matrix.md` | 11 | Production user or developer doc. |
| `docs/installation.md` | 11 | Production user or developer doc. |
| `packages/README.md` | 10 | Production user or developer doc. |
| `docs/hardware/s360-410-module-pinmap.md` | 10 | Production user or developer doc. |
| `tests/README.md` | 10 | Production user or developer doc. |
| `docs/hardware/s360-211-module-pinmap.md` | 10 | Production user or developer doc. |
| `docs/hardware/s360-200-module-pinmap.md` | 10 | Production user or developer doc. |
| `docs/hardware/s360-320-module-pinmap.md` | 9 | Production user or developer doc. |
| `security.md` | 9 | Rename to SECURITY.md for GitHub recognition. |
| `docs/hardware/s360-400-module-pinmap.md` | 9 | Production user or developer doc. |
| `docs/hardware/s360-310-module-pinmap.md` | 9 | Production user or developer doc. |
| `docs/workflow-security-hardening.md` | 9 | Production user or developer doc. |
| `docs/hardware/s360-312-module-pinmap.md` | 9 | Production user or developer doc. |
| `docs/hardware-catalog.md` | 8 | Production user or developer doc. |
| `docs/hardware/fandac-i2c-address-verification.md` | 8 | Production user or developer doc. |
| `docs/development.md` | 8 | Production user or developer doc. |
| `docs/security/release-firmware-credential-posture.md` | 8 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/hardware/s360-210-module-pinmap.md` | 7 | Production user or developer doc. |
| `docs/hardware/s360-300-module-pinmap.md` | 7 | Production user or developer doc. |
| `docs/DEV_WORKFLOW.md` | 6 | Production user or developer doc. |
| `docs/security/checksums-verification.md` | 6 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/manual-preview/ceiling-poe-ventiq-fantriac-roomiq.md` | 6 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `tests/INTEGRATION_GUIDE.md` | 6 | Production user or developer doc. |
| `docs/release-notes/experimental/ceiling-poe-ventiq-fantriac-roomiq.md` | 5 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/preview/v1.0.0-preview.md` | 4 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/manual-preview/ceiling-poe-ventiq-fanrelay-roomiq.md` | 4 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/manual-preview/ceiling-poe-fanpwm.md` | 4 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/manual-preview/ceiling-poe-fandac.md` | 4 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/preview/ceiling-poe-roomiq-led.md` | 4 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/preview/README.md` | 3 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/manual-preview/README.md` | 3 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/preview/ceiling-poe-airiq-roomiq.md` | 3 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/preview/ceiling-poe-roomiq.md` | 3 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-notes/experimental/README.md` | 2 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `dev/README.md` | 1 | Production user or developer doc. |

## webflash

### DECIDE (2 files, 82 KB)

| File | KB | Rationale |
|---|---:|---|
| `docs/sense360-webflash-status.md` | 57 | Same, WebFlash side. |
| `CLAUDE.md` | 25 | Same question as esphome-public. |

### REMOVE (2 files, 138 KB)

| File | KB | Rationale |
|---|---:|---|
| `UPCOMING_PR.md` | 138 | 140KB working queue. Transfer to issues/project, delete from tree. |
| `docs/pr-comment.md` | 0 | 488 byte leftover scratch file. |

### ARCHIVE (33 files, 762 KB)

| File | KB | Rationale |
|---|---:|---|
| `docs/wizard-ux-roadmap.md` | 89 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-import-readiness-matrix.md` | 72 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-cleanup-audit.md` | 70 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/conventions-history.md` | 63 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-required-configs-cleanup.md` | 45 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/github-pages-surface-audit.md` | 43 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/dual-channel-coexistence-design.md` | 29 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/firmware-import.md` | 27 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/led-preview-webflash-proof.md` | 27 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/led-preview-import-plan.md` | 26 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/product-import-readiness.md` | 21 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `FIRMWARE-DISTRIBUTION-REVIEW.md` | 21 | One-off review record. |
| `docs/webflash-2-migration.md` | 18 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-2-migration-prompts.md` | 18 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/fan-bundle-preview-import-proof.md` | 15 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/preview-import-automation-proof.md` | 15 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/ux-roadmap.md` | 14 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-2-beta-default-s360-410-evidence.md` | 13 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/workflow-audit.md` | 12 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/fanpwm-preview-import-proof.md` | 12 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-bundle-sku-matrix.md` | 12 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/fanrelay-preview-import-proof.md` | 12 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/live-smoke-easy-bundle-picker-current.md` | 11 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/live-smoke-preview-import.md` | 10 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/wf-ux-017-freshness-diagnosis.md` | 10 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/wf-import-pwm-001-closure.md` | 10 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/preview-import-first-batch-proof.md` | 10 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/webflash-2-migration-delivery.md` | 9 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/live-smoke-easy-bundle-picker-fan-expansion.md` | 8 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/live-smoke-easy-bundle-picker.md` | 7 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/wf-manifest-freshness-race-diagnosis.md` | 6 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/expected-surface-fixture.md` | 4 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |
| `docs/docs-consolidation-verify-001.md` | 3 | Process artifact (audit/proof/dryrun/matrix/plan/handoff). Move to docs/archive/ with index entry, or a private records repo. |

### KEEP (17 files, 312 KB)

| File | KB | Rationale |
|---|---:|---|
| `README.md` | 56 | Front door, 57KB is too long. Split user quickstart vs everything else. |
| `DEVELOPER.md` | 38 | Contributor doc. |
| `CHANGELOG.md` | 33 | Standard. |
| `firmware-signing/README.md` | 26 | Signing/verification doc, user facing trust surface. |
| `docs/release-gates/WEBFLASH-FIRST-RELEASE-DRYRUN-HANDOFF-001.md` | 24 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/security/SECURITY-AUDIT-2026-06.md` | 18 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-gates/WF-LIVE-SMOKE-2-0-DEFAULT-001.md` | 17 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/security/CTF-AUDIT-2026-07-03.md` | 14 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-gates/WEBFLASH-FIRST-RELEASE-GATES-SYNC-001.md` | 14 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/release-gates/WEBFLASH-LIVE-MANIFEST-FRESHNESS-SMOKE-001.md` | 13 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/deploy-notes.md` | 12 | Production user or developer doc. |
| `docs/architecture.md` | 12 | Production user or developer doc. |
| `security.md` | 11 | Rename to SECURITY.md. |
| `docs/release-gates/PRE-HW-PREP-FIRST-RELEASE-GATES-001.md` | 10 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `docs/adr/0001-webflash-2-view-over-engine.md` | 6 | Governance record (security/compliance/decision/release note/gate). Stays, structure already correct. |
| `TROUBLESHOOTING.md` | 5 | User doc. |
| `FEATURES.md` | 2 | Small, already redirects to canonical status. |

## Execution notes

- Several ARCHIVE rows on the webflash side are currently referenced as live contracts by `CLAUDE.md` and the guard tests (for example `docs/firmware-import.md`, `docs/product-import-readiness.md`, `docs/webflash-import-readiness-matrix.md`, `docs/conventions-history.md`, `docs/wizard-ux-roadmap.md`, `docs/led-preview-webflash-proof.md`). Executing those rows requires updating every inbound reference (CLAUDE.md, README, tests such as `__tests__/product-import-readiness.test.js`) in the same change, or the disposition must be downgraded to KEEP until the reference is retired.
- `UPCOMING_PR.md` removal likewise requires retiring the standing convention in `CLAUDE.md` that every queue-changing PR must update it, and transferring live queue items to GitHub issues or a project board first.
- Dispositions are per-repo: esphome-public rows are executed in `sense360store/esphome-public`, webflash rows in `sense360store/WebFlash`.
