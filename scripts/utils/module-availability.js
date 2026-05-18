/**
 * @fileoverview WF-WIZARD-AVAIL-001 — module availability classifier.
 *
 * Pure presentation-only helper that classifies each (module, variant)
 * combination and each assembled config_string into one of a fixed set of
 * availability states, so the Step 4 wizard can mark docs-only / design-
 * pending / blocked / advanced-manual-warning / legacy modules as non-
 * installable BEFORE the user reaches Step 5.
 *
 * Sources of truth (no new catalog fields, no committed PDFs):
 *
 *   - manifest.json config_strings (passed in by scripts/state.js as
 *     `manifestStableTokens` / `manifestPreviewTokens` / `manifestStableConfigs`
 *     / `manifestPreviewConfigs`) — the only true "is installable" signal.
 *   - The static per-variant overrides in
 *     `MODULE_VARIANT_AVAILABILITY_OVERRIDES` below, which encode the
 *     cases the manifest cannot disambiguate on its own:
 *       * Voice (legacy / manual only — never customer-facing).
 *       * Sense360 TRIAC / S360-320 (advanced-manual-warning under
 *         HW-005 + COMPLIANCE-001 — visible and selectable in the
 *         custom path, but install-gated behind an explicit
 *         advanced/manual-warning acknowledgement AND a future imported
 *         artifact; never Release-One, never a kit / default, never
 *         recommended, never compliance-certified).
 *       * Sense360 Relay / S360-310 (design pending — no S360-310
 *         schematic has been uploaded upstream yet).
 *       * Sense360 PWM / S360-311 and Sense360 DAC / S360-312
 *         (no WebFlash firmware yet — S360-311-R4 and S360-312-R4
 *         schematic evidence exists upstream but no WebFlash build
 *         ships).
 *       * Sense360 AirIQ / S360-210 (no WebFlash firmware yet —
 *         documented hardware, no build in the current manifest).
 *
 * This module does NOT replace scripts/utils/firmware-readiness.js (which
 * still owns the five canonical Step-5 headlines), the release-channel
 * policy in scripts/utils/release-channels.js, the preflight engine, or
 * the install gate. It only annotates each module card with an honest
 * "what you'll get if you pick this" pill so the customer can tell
 * documented hardware apart from installable hardware.
 *
 * Per the WF-WIZARD-AVAIL-001 amendments, no new schematic PDFs are
 * committed in WebFlash; the upstream schematic evidence is referenced
 * only in copy. PWM/DAC are 'no-firmware', not 'design-pending', because
 * their upstream schematic uploads cover that gap. Relay stays
 * 'design-pending' until an S360-310 schematic is uploaded upstream.
 *
 * WF-TRIAC-001 amendment: TRIAC moved from 'blocked' to
 * 'advanced-manual-warning'. The `blocked` taxonomy value stays in the
 * exported state set for any future genuinely-blocked module — no current
 * variant uses it after this change. The advanced-manual-warning state
 * is a *visible + selectable* state with `installable: false`; the
 * install gate in scripts/state.js still enforces an additional
 * advanced/manual-warning acknowledgement that is orthogonal to the
 * release-channel preview acknowledgement (which is unchanged).
 * Advanced/manual-warning is **not** a compliance certification claim;
 * see docs/webflash-import-readiness-matrix.md for the import-side
 * counterpart.
 */

export const AVAILABILITY_STATES = Object.freeze({
    AVAILABLE_STABLE: 'available-stable',
    AVAILABLE_PREVIEW: 'available-preview',
    NO_FIRMWARE: 'no-firmware',
    DESIGN_PENDING: 'design-pending',
    BLOCKED: 'blocked',
    ADVANCED_MANUAL_WARNING: 'advanced-manual-warning',
    LEGACY_ONLY: 'legacy-only',
    HIDDEN: 'hidden'
});

export const AVAILABILITY_LABELS = Object.freeze({
    'available-stable': 'Available',
    'available-preview': 'Preview',
    'no-firmware': 'No WebFlash firmware yet',
    'design-pending': 'Design pending',
    'blocked': 'Blocked',
    'advanced-manual-warning': 'Advanced / manual only',
    'legacy-only': 'Legacy / manual only',
    'hidden': ''
});

export const AVAILABILITY_TONES = Object.freeze({
    'available-stable': 'positive',
    'available-preview': 'warning',
    'no-firmware': 'info',
    'design-pending': 'info',
    'blocked': 'danger',
    'advanced-manual-warning': 'danger',
    'legacy-only': 'neutral',
    'hidden': 'neutral'
});

export const AVAILABILITY_REASON_CODES = Object.freeze({
    MANIFEST_MATCH: 'manifest-match',
    PREVIEW_BUILD: 'preview-build',
    NO_MANIFEST_BUILD: 'no-manifest-build',
    DESIGN_PENDING: 'design-pending',
    HW_005: 'hw-005',
    HW_005_ADVANCED_MANUAL: 'hw-005-advanced-manual',
    LEGACY_COMPATIBLE: 'legacy-compatible',
    INTERNAL_PLACEHOLDER: 'internal-placeholder'
});

const ADVANCED_MANUAL_WARNING_DETAIL = 'Sense360 TRIAC (S360-320) controls mains-connected loads and is not compliance-certified by WebFlash. It is not Release-One, not a kit / default option, and not recommended. No installable firmware has been imported yet, and WebFlash will not install TRIAC firmware until an advanced/manual-warning artifact is imported. Selecting TRIAC requires explicit acknowledgement of the advanced/manual warning. HW-005 and COMPLIANCE-001 remain open upstream.';

const DEFAULT_DETAIL_BY_STATE = Object.freeze({
    'available-stable': 'This module is covered by a published WebFlash build.',
    'available-preview': 'This module is only covered by a preview WebFlash build. You must acknowledge the preview channel before installing.',
    'no-firmware': 'Documented hardware, but no WebFlash firmware build exists for this configuration yet.',
    'design-pending': 'No upstream schematic has been published yet, so no WebFlash firmware can be planned for this module.',
    'blocked': 'Hardware verification or compliance work is still open. WebFlash will not install firmware for this module.',
    'advanced-manual-warning': ADVANCED_MANUAL_WARNING_DETAIL,
    'legacy-only': 'Legacy or manual-only path. Not surfaced as a WebFlash-selectable module.',
    'hidden': ''
});

/**
 * Static per-(module, variant) overrides.
 *
 * These take precedence over manifest-derived classification because they
 * encode reasons the manifest cannot represent on its own (hardware blocks,
 * upstream schematic evidence vs. design-pending, legacy quarantines).
 *
 * Keys are wizard module keys (`voice`, `airiq`, `fan`, ...) and variant
 * keys as defined in scripts/data/module-requirements.js. The `none`
 * variant of every module is intentionally classified as `hidden`: it
 * never drives a customer-facing availability pill.
 */
export const MODULE_VARIANT_AVAILABILITY_OVERRIDES = Object.freeze({
    voice: Object.freeze({
        none: Object.freeze({
            state: AVAILABILITY_STATES.LEGACY_ONLY,
            reasonCode: AVAILABILITY_REASON_CODES.INTERNAL_PLACEHOLDER,
            detail: 'Voice is not a customer-selectable WebFlash module. The voice key is retained only as the internal "Core" placeholder so legacy share-links keep parsing.'
        })
    }),
    airiq: Object.freeze({
        airiq: Object.freeze({
            state: AVAILABILITY_STATES.NO_FIRMWARE,
            reasonCode: AVAILABILITY_REASON_CODES.NO_MANIFEST_BUILD,
            detail: 'Sense360 AirIQ (S360-210) is documented hardware, but no current WebFlash firmware build targets a Core + AirIQ configuration. You can still select it for planning — Step 5 will show no published firmware.'
        })
    }),
    fan: Object.freeze({
        relay: Object.freeze({
            state: AVAILABILITY_STATES.DESIGN_PENDING,
            reasonCode: AVAILABILITY_REASON_CODES.DESIGN_PENDING,
            detail: 'Sense360 Relay (S360-310) has no upstream schematic uploaded yet. WebFlash firmware cannot be planned until S360-310 design evidence lands upstream.'
        }),
        pwm: Object.freeze({
            state: AVAILABILITY_STATES.NO_FIRMWARE,
            reasonCode: AVAILABILITY_REASON_CODES.NO_MANIFEST_BUILD,
            detail: 'Sense360 PWM (S360-311) has S360-311-R4 schematic evidence upstream, but no WebFlash firmware build ships for this driver yet.'
        }),
        analog: Object.freeze({
            state: AVAILABILITY_STATES.NO_FIRMWARE,
            reasonCode: AVAILABILITY_REASON_CODES.NO_MANIFEST_BUILD,
            detail: 'Sense360 DAC (S360-312) has S360-312-R4 schematic evidence upstream, but no WebFlash firmware build ships for this driver yet.'
        }),
        triac: Object.freeze({
            state: AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING,
            reasonCode: AVAILABILITY_REASON_CODES.HW_005_ADVANCED_MANUAL,
            detail: ADVANCED_MANUAL_WARNING_DETAIL
        })
    })
});

function makeClassification(state, reasonCode, detail) {
    const resolvedDetail = typeof detail === 'string' && detail.length > 0
        ? detail
        : DEFAULT_DETAIL_BY_STATE[state] || '';
    return Object.freeze({
        state,
        label: AVAILABILITY_LABELS[state] || '',
        tone: AVAILABILITY_TONES[state] || 'neutral',
        detail: resolvedDetail,
        reasonCode: reasonCode || '',
        // Blocked variants are not selectable (radio disabled). The
        // advanced-manual-warning state IS selectable — the user opts in
        // deliberately and the install gate then enforces the
        // acknowledgement + manifest-match interlock.
        selectable: state !== AVAILABILITY_STATES.BLOCKED,
        // Installability is conservative — the classifier never reports
        // an advanced-manual-warning selection as installable, regardless
        // of manifest content. The install gate in scripts/state.js owns
        // the live ack + manifest-match check.
        installable: state === AVAILABILITY_STATES.AVAILABLE_STABLE
            || state === AVAILABILITY_STATES.AVAILABLE_PREVIEW
    });
}

function lookupOverride(moduleKey, variantKey) {
    const moduleOverrides = MODULE_VARIANT_AVAILABILITY_OVERRIDES[moduleKey];
    if (!moduleOverrides) {
        return null;
    }
    return moduleOverrides[variantKey] || null;
}

/**
 * Classify a single (module, variant) pair.
 *
 * Static overrides win. Otherwise the classifier looks at the supplied
 * manifest token sets:
 *   - If the variant's canonical token appears in `manifestStableTokens`,
 *     the variant is `available-stable`.
 *   - Else if it appears in `manifestPreviewTokens`, it is
 *     `available-preview`.
 *   - Else it is `no-firmware`.
 *
 * The `none` variant is always classified as `hidden` — it represents the
 * "module not installed" choice and never drives an availability pill.
 *
 * @param {string} moduleKey
 * @param {string} variantKey
 * @param {Object} [options]
 * @param {(token: string) => string|null} [options.canonicalTokenFor]
 *   - Optional resolver that turns a (module, variant) into its
 *     manifest token (e.g. ('airiq', 'airiq') → 'AirIQ'). When omitted
 *     only the override path is exercised; manifest-derived classification
 *     short-circuits to `no-firmware`.
 * @param {Set<string>} [options.manifestStableTokens]
 * @param {Set<string>} [options.manifestPreviewTokens]
 * @returns {Readonly<{state: string, label: string, tone: string, detail: string, reasonCode: string, selectable: boolean, installable: boolean}>}
 */
export function classifyModuleVariant(moduleKey, variantKey, options = {}) {
    const {
        canonicalTokenFor = null,
        manifestStableTokens = new Set(),
        manifestPreviewTokens = new Set()
    } = options;

    const override = lookupOverride(moduleKey, variantKey);
    if (override) {
        return makeClassification(override.state, override.reasonCode, override.detail);
    }

    if (variantKey === 'none') {
        return makeClassification(
            AVAILABILITY_STATES.HIDDEN,
            AVAILABILITY_REASON_CODES.INTERNAL_PLACEHOLDER,
            ''
        );
    }

    const token = typeof canonicalTokenFor === 'function'
        ? canonicalTokenFor(moduleKey, variantKey)
        : null;

    if (!token) {
        return makeClassification(
            AVAILABILITY_STATES.NO_FIRMWARE,
            AVAILABILITY_REASON_CODES.NO_MANIFEST_BUILD,
            DEFAULT_DETAIL_BY_STATE[AVAILABILITY_STATES.NO_FIRMWARE]
        );
    }

    if (manifestStableTokens && manifestStableTokens.has(token)) {
        return makeClassification(
            AVAILABILITY_STATES.AVAILABLE_STABLE,
            AVAILABILITY_REASON_CODES.MANIFEST_MATCH,
            DEFAULT_DETAIL_BY_STATE[AVAILABILITY_STATES.AVAILABLE_STABLE]
        );
    }

    if (manifestPreviewTokens && manifestPreviewTokens.has(token)) {
        return makeClassification(
            AVAILABILITY_STATES.AVAILABLE_PREVIEW,
            AVAILABILITY_REASON_CODES.PREVIEW_BUILD,
            DEFAULT_DETAIL_BY_STATE[AVAILABILITY_STATES.AVAILABLE_PREVIEW]
        );
    }

    return makeClassification(
        AVAILABILITY_STATES.NO_FIRMWARE,
        AVAILABILITY_REASON_CODES.NO_MANIFEST_BUILD,
        DEFAULT_DETAIL_BY_STATE[AVAILABILITY_STATES.NO_FIRMWARE]
    );
}

/**
 * Classify an assembled wizard config_string (e.g. `Ceiling-POE-VentIQ-RoomIQ`).
 *
 * Token recognition short-circuits the manifest lookup:
 *   - If any token in `advancedWarningTokens` (default `['FanTRIAC']`,
 *     matching the WF-TRIAC-001 wizard policy) appears in the
 *     config_string the result is `advanced-manual-warning`. This is a
 *     conservative classifier-level signal — the install gate in
 *     scripts/state.js still enforces both an acknowledgement and a
 *     manifest match before TRIAC firmware can flash.
 *
 * Otherwise the manifest is the source of truth:
 *   - In `manifestStableConfigs` → `available-stable`.
 *   - In `manifestPreviewConfigs` → `available-preview`.
 *   - Otherwise → `no-firmware`.
 *
 * The legacy `blockedTokens` option name is accepted for back-compat;
 * when supplied it is treated identically to `advancedWarningTokens`.
 *
 * @param {string} configString
 * @param {Object} [options]
 * @param {Set<string>} [options.manifestStableConfigs]
 * @param {Set<string>} [options.manifestPreviewConfigs]
 * @param {Set<string>} [options.advancedWarningTokens]
 * @param {Set<string>} [options.blockedTokens] - Deprecated alias for
 *   advancedWarningTokens. Retained so older callers keep working.
 */
export function classifyConfigString(configString, options = {}) {
    const {
        manifestStableConfigs = new Set(),
        manifestPreviewConfigs = new Set(),
        advancedWarningTokens,
        blockedTokens
    } = options;

    const tokens = advancedWarningTokens || blockedTokens || new Set(['FanTRIAC']);

    if (typeof configString !== 'string' || configString.length === 0) {
        return makeClassification(
            AVAILABILITY_STATES.HIDDEN,
            AVAILABILITY_REASON_CODES.INTERNAL_PLACEHOLDER,
            ''
        );
    }

    const segments = configString.split('-');
    const tokenHit = segments.find(seg => tokens.has(seg));
    if (tokenHit) {
        return makeClassification(
            AVAILABILITY_STATES.ADVANCED_MANUAL_WARNING,
            AVAILABILITY_REASON_CODES.HW_005_ADVANCED_MANUAL,
            `${tokenHit} is an advanced/manual-warning module under HW-005 and COMPLIANCE-001. WebFlash will not install firmware for any configuration containing ${tokenHit} until an advanced/manual-warning artifact is imported AND the user acknowledges the advanced/manual warning. ${tokenHit} is not Release-One, not a kit / default, not recommended, and not compliance-certified.`
        );
    }

    if (manifestStableConfigs.has(configString)) {
        return makeClassification(
            AVAILABILITY_STATES.AVAILABLE_STABLE,
            AVAILABILITY_REASON_CODES.MANIFEST_MATCH,
            DEFAULT_DETAIL_BY_STATE[AVAILABILITY_STATES.AVAILABLE_STABLE]
        );
    }

    if (manifestPreviewConfigs.has(configString)) {
        return makeClassification(
            AVAILABILITY_STATES.AVAILABLE_PREVIEW,
            AVAILABILITY_REASON_CODES.PREVIEW_BUILD,
            DEFAULT_DETAIL_BY_STATE[AVAILABILITY_STATES.AVAILABLE_PREVIEW]
        );
    }

    return makeClassification(
        AVAILABILITY_STATES.NO_FIRMWARE,
        AVAILABILITY_REASON_CODES.NO_MANIFEST_BUILD,
        DEFAULT_DETAIL_BY_STATE[AVAILABILITY_STATES.NO_FIRMWARE]
    );
}

/**
 * Convenience helper: derive `manifestStableTokens` / `manifestPreviewTokens`
 * / `manifestStableConfigs` / `manifestPreviewConfigs` from an iterable of
 * `{config_string, channel}`-shaped build records.
 *
 * Kept here (rather than in scripts/state.js) so the same derivation runs
 * in unit tests against synthetic manifests.
 */
export function deriveManifestIndex(builds) {
    const manifestStableTokens = new Set();
    const manifestPreviewTokens = new Set();
    const manifestStableConfigs = new Set();
    const manifestPreviewConfigs = new Set();

    if (!builds || typeof builds[Symbol.iterator] !== 'function') {
        return {
            manifestStableTokens,
            manifestPreviewTokens,
            manifestStableConfigs,
            manifestPreviewConfigs
        };
    }

    for (const build of builds) {
        const configString = build && typeof build.config_string === 'string'
            ? build.config_string
            : null;
        if (!configString) {
            continue;
        }
        const channel = build && typeof build.channel === 'string'
            ? build.channel
            : 'stable';

        const segments = configString.split('-');
        if (channel === 'stable') {
            manifestStableConfigs.add(configString);
            segments.forEach(seg => manifestStableTokens.add(seg));
        } else if (channel === 'preview' || channel === 'beta' || channel === 'development') {
            manifestPreviewConfigs.add(configString);
            segments.forEach(seg => {
                if (!manifestStableTokens.has(seg)) {
                    manifestPreviewTokens.add(seg);
                }
            });
        }
        // 'rescue' and other channels: deliberately not contributing to
        // module-level availability — Rescue is its own surface.
    }

    return {
        manifestStableTokens,
        manifestPreviewTokens,
        manifestStableConfigs,
        manifestPreviewConfigs
    };
}
