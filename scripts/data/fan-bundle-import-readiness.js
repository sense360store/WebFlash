/**
 * @fileoverview WF-FAN-BUNDLE-IMPORT-READINESS-001 — import-readiness
 * expectations for the five future full-composition fan-control room bundles.
 *
 * WF-EASY-BUNDLE-PICKER-FAN-EXPANSION-001 (WebFlash #474) already *declared* the
 * five fan-control room bundles in `scripts/data/simple-bundles.js` and *gated*
 * them on the live manifest (`getExposableFanControlBundles`): a card only ever
 * appears once its exact firmware `config_string` is present in `manifest.json`.
 * None is exposed today because upstream `sense360store/esphome-public` has not
 * published the firmware (upstream `ROOM-BUNDLE-FAN-CONFIGS-001` / #713 added the
 * product YAMLs; #716 recorded compile proof; #717 planned publication — but no
 * `.bin`, no release asset, no import exists yet).
 *
 * This module is the **import-readiness prep** that sits in front of that future
 * import PR. It does NOT import firmware, regenerate manifests, edit
 * `firmware/sources.json`, change `REQUIRED_CONFIGS`, add a kit, or expose any
 * card. It only declares, for each of the five future artifacts, the *expected*
 * import shape so the eventual firmware-import PR is small and mechanical:
 *
 *   - expected `config_string`        (sourced from the bundle definition)
 *   - expected artifact filename       (canonical `Sense360-…-vX.Y.Z-<channel>.bin`)
 *   - expected `.meta.json` sidecar    (derived from the artifact filename)
 *   - expected channel (`preview`)
 *   - expected `block_tokens`          (`["FanTRIAC", "LED"]` — neither token appears)
 *   - expected upstream release tag / url / repo / version
 *   - the full room-bundle flag        (room sensors + a fan driver)
 *   - the Simple-picker card gate       (`getExposableFanControlBundles`)
 *   - the required acknowledgements     (preview + fan-control, plus the analog
 *                                        address-switch acknowledgement for the
 *                                        two FanDAC bundles)
 *   - a ready-to-fill `firmware/sources.json` source-entry skeleton (everything
 *     EXCEPT the human-pinned `expected_sha256`, which must come from the real
 *     published artifact — the trust anchor the import PR supplies).
 *
 * NON-RUNTIME MODULE. Nothing in the wizard runtime graph (`app.js` and the
 * modules it imports) imports this file, so it is intentionally NOT registered
 * in `sw.js` `STATIC_ASSETS` / `SCRIPT_MODULES` and never fetched by the browser.
 * It is consumed by the test pin (`__tests__/wf-fan-bundle-import-readiness.test.js`)
 * and by the future import PR / docs. The single source of truth for the bundle
 * shape stays `scripts/data/simple-bundles.js`; this module derives from it so the
 * two can never drift.
 *
 * Hard guardrails (each pinned by the test):
 *   - every expectation is `channel: preview` — never stable/default/recommended/
 *     buyable, never `REQUIRED_CONFIGS`-eligible,
 *   - every expectation is a FULL room bundle (room sensors + fan driver), never a
 *     standalone fan-only config (`Ceiling-POE-FanPWM` / `Ceiling-POE-FanDAC`),
 *   - no expectation carries a `FanTRIAC` / `TRIAC` token; TRIAC stays build-blocked,
 *   - the analog (FanDAC) expectations require the address-switch acknowledgement
 *     whose copy names `0x58` / `0x5A` and the forbidden `0x59`,
 *   - the expected source entry never carries a fabricated `expected_sha256`.
 *
 * @module data/fan-bundle-import-readiness
 */

import {
    FAN_CONTROL_BUNDLES,
    isFullRoomBundle,
    bundleRequiresDacAddressAcknowledgement,
    validateFanControlBundle,
    isFanControlBundleImportReady,
    getExposableFanControlBundles
} from './simple-bundles.js';
import { CANONICAL_PATTERN } from '../validate-naming-policy.js';

// --- Per-family import policy ----------------------------------------------
//
// These are the WebFlash-side expectations the future import PR must satisfy.
// They are *expected* values (the import PR confirms them against the real
// published artifact); they are not a claim that the artifact exists today.

/** Expected firmware version for the fan-control room bundles. They are siblings
 * of the standalone FanRelay / FanPWM / FanDAC previews on the `v1.0.0-preview`
 * line, so the expected version is `1.0.0`. The import PR reconciles this against
 * the actual published artifact. */
export const EXPECTED_FAN_BUNDLE_VERSION = '1.0.0';

/** Every fan-control room bundle imports on the preview channel — never stable. */
export const EXPECTED_FAN_BUNDLE_CHANNEL = 'preview';

/** Expected upstream release that would carry the artifacts. */
export const EXPECTED_FAN_BUNDLE_SOURCE_REPO = 'sense360store/esphome-public';
export const EXPECTED_FAN_BUNDLE_RELEASE_TAG = 'v1.0.0-preview';
export const EXPECTED_FAN_BUNDLE_RELEASE_URL =
    'https://github.com/sense360store/esphome-public/releases/tag/v1.0.0-preview';

/** Expected `block_tokens` for every fan-control room-bundle source entry. None of
 * the five configs carries a `LED` or `FanTRIAC` token, so blocking both is the
 * safe default — identical to the standalone FanRelay / FanPWM / FanDAC sources. */
export const EXPECTED_FAN_BUNDLE_BLOCK_TOKENS = Object.freeze(['FanTRIAC', 'LED']);

/** Minimum `.bin` size gate, matching the existing preview source entries. */
export const EXPECTED_FAN_BUNDLE_MIN_SIZE_BYTES = 102400;

/** The four canonical release-body H2 sections every import verifies. */
export const EXPECTED_RELEASE_BODY_SECTIONS = Object.freeze([
    'Changelog',
    'Known Issues',
    'Features',
    'Hardware Requirements'
]);

/** Tokens that must never appear in a fan-control room-bundle config_string. */
const FORBIDDEN_TOKENS = Object.freeze(['FanTRIAC', 'TRIAC']);

/** Standalone fan-only configs that must never resolve a fan-control card. */
export const STANDALONE_FAN_ONLY_CONFIGS = Object.freeze([
    'Ceiling-POE-FanPWM',
    'Ceiling-POE-FanDAC'
]);

// --- Derivations -----------------------------------------------------------

/**
 * Derive the canonical WebFlash artifact filename for a config_string.
 *
 *     Ceiling-POE-VentIQ-FanPWM-RoomIQ
 *       → Sense360-Ceiling-POE-VentIQ-FanPWM-RoomIQ-v1.0.0-preview.bin
 *
 * The shape matches `scripts/validate-naming-policy.js`'s `CANONICAL_PATTERN`
 * and every existing on-disk artifact.
 *
 * @param {string} configString
 * @param {string} [version]
 * @param {string} [channel]
 * @returns {string|null}
 */
export function deriveExpectedArtifactName(
    configString,
    version = EXPECTED_FAN_BUNDLE_VERSION,
    channel = EXPECTED_FAN_BUNDLE_CHANNEL
) {
    if (typeof configString !== 'string' || configString.length === 0) {
        return null;
    }
    return `Sense360-${configString}-v${version}-${channel}.bin`;
}

/**
 * Derive the `.meta.json` sidecar filename for an artifact filename.
 *
 * @param {string} artifactName
 * @returns {string|null}
 */
export function deriveExpectedSidecarName(artifactName) {
    if (typeof artifactName !== 'string' || !artifactName.endsWith('.bin')) {
        return null;
    }
    return artifactName.replace(/\.bin$/, '.meta.json');
}

function importPreconditionsFor(bundle) {
    const lines = [
        `Upstream ${EXPECTED_FAN_BUNDLE_SOURCE_REPO} publishes a signed .bin for ${bundle.firmwareConfigString} on a preview release (expected tag ${EXPECTED_FAN_BUNDLE_RELEASE_TAG}) with the four canonical release-body sections.`,
        'Upstream catalog row is status: preview OR carries webflash_import_eligibility.eligible=true (the manual-preview lane already used for the standalone FanRelay / FanPWM / FanDAC previews).',
        'Pin the published artifact SHA-256 as expected_sha256 in the new firmware/sources.json source entry (the human-committed trust anchor).',
        'Run the importer (scripts/import-firmware-sources.py or the preview-eligible automation) then scripts/gen-manifests.py to regenerate manifest.json + the per-build manifests.'
    ];
    if (bundle.fanDriver === 'dac') {
        lines.push(
            'Confirm the analog fan driver (GP8403) address policy before exposure: IC1 0x58 / IC2 0x5A, 0x59 forbidden on the shared bus.'
        );
    }
    return Object.freeze(lines);
}

/**
 * Build the import-readiness expectation for one fan-control bundle.
 *
 * @param {Object} bundle  a `FAN_CONTROL_BUNDLES` entry
 * @returns {Readonly<Object>|null}
 */
export function buildFanBundleImportExpectation(bundle) {
    if (!bundle || !bundle.firmwareConfigString) {
        return null;
    }
    const configString = bundle.firmwareConfigString;
    const artifactName = deriveExpectedArtifactName(configString);
    return Object.freeze({
        id: bundle.id,
        displayName: bundle.displayName,
        configString,
        expectedArtifactName: artifactName,
        expectedSidecarName: deriveExpectedSidecarName(artifactName),
        expectedChannel: EXPECTED_FAN_BUNDLE_CHANNEL,
        expectedVersion: EXPECTED_FAN_BUNDLE_VERSION,
        expectedReleaseTag: EXPECTED_FAN_BUNDLE_RELEASE_TAG,
        expectedReleaseUrl: EXPECTED_FAN_BUNDLE_RELEASE_URL,
        expectedSourceRepo: EXPECTED_FAN_BUNDLE_SOURCE_REPO,
        expectedBlockTokens: EXPECTED_FAN_BUNDLE_BLOCK_TOKENS,
        fanDriver: bundle.fanDriver,
        // The full room-bundle flag (room sensors + a fan driver).
        fullRoomBundle: isFullRoomBundle(bundle),
        // The Simple-picker card is import-gated — never statically present.
        simplePickerGated: true,
        // Required acknowledgements (each STRONGER than, never a replacement for,
        // the ones before it).
        requiresPreviewAcknowledgement: bundle.requiresPreviewAcknowledgement === true,
        requiresFanControlAcknowledgement: bundle.requiresFanControlAcknowledgement === true,
        requiresDacAddressAcknowledgement: bundleRequiresDacAddressAcknowledgement(bundle),
        dacAddressAcknowledgement: bundle.dacAddressAcknowledgement || '',
        // The single piece the import PR must supply from the real artifact.
        requiresPinnedSha256: true,
        importPreconditions: importPreconditionsFor(bundle),
        // Developer-only provenance pointer (never customer-facing copy).
        upstreamRef: bundle.upstreamRef
    });
}

/**
 * The ordered import-readiness expectations for the five future fan-control room
 * bundles, derived from `FAN_CONTROL_BUNDLES` so they can never drift.
 *
 * @type {ReadonlyArray<Readonly<Object>>}
 */
export const FAN_BUNDLE_IMPORT_EXPECTATIONS = Object.freeze(
    FAN_CONTROL_BUNDLES.map(buildFanBundleImportExpectation)
);

/**
 * Look up an expectation by bundle id or by firmware config_string.
 *
 * @param {string} key
 * @returns {Readonly<Object>|null}
 */
export function getFanBundleImportExpectation(key) {
    if (typeof key !== 'string' || !key) {
        return null;
    }
    const target = key.trim();
    return (
        FAN_BUNDLE_IMPORT_EXPECTATIONS.find(
            e => e.id === target || e.configString === target
        ) || null
    );
}

/**
 * Build the ready-to-fill `firmware/sources.json` source-entry skeleton for an
 * expectation. It carries every field the existing preview source entries carry
 * EXCEPT `expected_sha256` — the import PR adds that from the published artifact.
 * Copy this shape into `firmware/sources.json`, pin the SHA-256, and run the
 * importer + manifest generator: the matching Simple-install card lights up with
 * no further wizard-code change.
 *
 * @param {Object} expectation  a `FAN_BUNDLE_IMPORT_EXPECTATIONS` entry
 * @returns {Readonly<Object>|null}
 */
export function buildExpectedSourceEntry(expectation) {
    if (!expectation || !expectation.configString) {
        return null;
    }
    return Object.freeze({
        source_repo: expectation.expectedSourceRepo,
        release_tag: expectation.expectedReleaseTag,
        release_url: expectation.expectedReleaseUrl,
        version: expectation.expectedVersion,
        channel: expectation.expectedChannel,
        config_string: expectation.configString,
        asset_name: expectation.expectedArtifactName,
        min_size_bytes: EXPECTED_FAN_BUNDLE_MIN_SIZE_BYTES,
        required_assets: Object.freeze([
            expectation.expectedArtifactName,
            'checksums-sha256.txt',
            'checksums-md5.txt',
            'manifest.json'
        ]),
        required_release_body_sections: EXPECTED_RELEASE_BODY_SECTIONS,
        block_tokens: expectation.expectedBlockTokens
        // NOTE: expected_sha256 is deliberately omitted — the import PR pins the
        // real published artifact's SHA-256 here. A fabricated pin must never ship.
    });
}

/**
 * Validate that an import-readiness expectation is self-consistent and conforms
 * to the WebFlash import contract. Returns `{ valid, errors }`.
 *
 * Enforces: canonical artifact filename, preview channel, full room bundle, no
 * TRIAC token, FanTRIAC+LED block tokens, the preview + fan-control
 * acknowledgements, and (for analog bundles) the address-switch acknowledgement
 * with its 0x58 / 0x5A / forbidden-0x59 copy. Also re-runs the underlying
 * `validateFanControlBundle` contract on the source bundle.
 *
 * @param {Object} expectation
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFanBundleImportExpectation(expectation) {
    const errors = [];
    if (!expectation || typeof expectation !== 'object') {
        return { valid: false, errors: ['Expectation is not an object.'] };
    }
    const cfg = String(expectation.configString || '');
    const id = expectation.id || cfg || '<unknown>';

    // The underlying bundle must still pass its own contract.
    const bundle = FAN_CONTROL_BUNDLES.find(b => b.id === expectation.id);
    if (!bundle) {
        errors.push(`Expectation ${id} has no matching FAN_CONTROL_BUNDLES entry.`);
    } else {
        const base = validateFanControlBundle(bundle);
        base.errors.forEach(e => errors.push(`underlying bundle: ${e}`));
        if (bundle.firmwareConfigString !== cfg) {
            errors.push(`Expectation ${id} configString drifted from the bundle definition.`);
        }
    }

    // Canonical artifact filename.
    const artifact = String(expectation.expectedArtifactName || '');
    if (!CANONICAL_PATTERN.test(artifact)) {
        errors.push(`Expectation ${id} artifact '${artifact}' is not a canonical Sense360-…-vX.Y.Z-<channel>.bin name.`);
    }
    if (artifact !== `Sense360-${cfg}-v${expectation.expectedVersion}-${expectation.expectedChannel}.bin`) {
        errors.push(`Expectation ${id} artifact name does not derive from its config_string + version + channel.`);
    }
    if (deriveExpectedSidecarName(artifact) !== expectation.expectedSidecarName) {
        errors.push(`Expectation ${id} sidecar name does not derive from its artifact name.`);
    }

    // Channel must be preview.
    if (expectation.expectedChannel !== EXPECTED_FAN_BUNDLE_CHANNEL) {
        errors.push(`Expectation ${id} channel must be '${EXPECTED_FAN_BUNDLE_CHANNEL}', got '${expectation.expectedChannel}'.`);
    }

    // Full room bundle, never a standalone fan-only config.
    if (expectation.fullRoomBundle !== true) {
        errors.push(`Expectation ${id} must be a full room bundle (room sensors + fan driver).`);
    }
    if (STANDALONE_FAN_ONLY_CONFIGS.includes(cfg)) {
        errors.push(`Expectation ${id} resolves to a standalone fan-only config (${cfg}); fan-only configs are never Simple-install bundles.`);
    }
    if (!/RoomIQ/.test(cfg) || !/VentIQ|AirIQ/.test(cfg)) {
        errors.push(`Expectation ${id} config '${cfg}' must carry RoomIQ + a room air sensor (VentIQ or AirIQ).`);
    }

    // No TRIAC token anywhere.
    FORBIDDEN_TOKENS.forEach(token => {
        if (cfg.includes(token)) {
            errors.push(`Expectation ${id} config must not contain a ${token} token.`);
        }
        if (artifact.includes(token)) {
            errors.push(`Expectation ${id} artifact must not contain a ${token} token.`);
        }
    });

    // Block tokens.
    const blockTokens = Array.isArray(expectation.expectedBlockTokens) ? expectation.expectedBlockTokens : [];
    if (!blockTokens.includes('FanTRIAC')) {
        errors.push(`Expectation ${id} block_tokens must include 'FanTRIAC'.`);
    }
    if (!blockTokens.includes('LED')) {
        errors.push(`Expectation ${id} block_tokens must include 'LED' (no fan bundle carries an LED token).`);
    }

    // Acknowledgement contract.
    if (expectation.requiresPreviewAcknowledgement !== true) {
        errors.push(`Expectation ${id} must require the preview acknowledgement.`);
    }
    if (expectation.requiresFanControlAcknowledgement !== true) {
        errors.push(`Expectation ${id} must require the fan-control acknowledgement.`);
    }
    if (expectation.fanDriver === 'dac') {
        if (expectation.requiresDacAddressAcknowledgement !== true) {
            errors.push(`Analog expectation ${id} must require the address-switch acknowledgement.`);
        }
        const ack = String(expectation.dacAddressAcknowledgement || '');
        ['0x58', '0x5A', '0x59'].forEach(addr => {
            if (!ack.includes(addr)) {
                errors.push(`Analog expectation ${id} acknowledgement must name ${addr}.`);
            }
        });
    } else if (expectation.requiresDacAddressAcknowledgement === true) {
        errors.push(`Non-analog expectation ${id} must not require the address-switch acknowledgement.`);
    }

    // The import PR must supply a real pinned SHA-256.
    if (expectation.requiresPinnedSha256 !== true) {
        errors.push(`Expectation ${id} must flag requiresPinnedSha256 (the import PR supplies the real artifact SHA-256).`);
    }

    return { valid: errors.length === 0, errors };
}

function toConfigSet(configStrings) {
    if (configStrings instanceof Set) {
        return configStrings;
    }
    return new Set(Array.isArray(configStrings) ? configStrings : []);
}

/**
 * Build a per-bundle import-readiness report against the live (or a synthetic)
 * set of manifest / source config_strings. This is the machine-checkable
 * "what is blocking exposure today" view:
 *
 *   - `declared`     — the bundle + expectation exist in the codebase (always true),
 *   - `inSources`    — a `firmware/sources.json` entry declares the config,
 *   - `inManifest`   — `manifest.json` carries a build with the config,
 *   - `exposable`    — the Simple-install card would appear (manifest-gated),
 *   - `outstandingAcknowledgements` — the gates the user must still satisfy.
 *
 * With the live surfaces every row is `inManifest:false`, `exposable:false`, so
 * `allHiddenToday` is true. A synthetic set containing a matching config flips
 * exactly that one row to `exposable:true`.
 *
 * @param {Object} [opts]
 * @param {Set<string>|string[]} [opts.manifestConfigStrings]
 * @param {Set<string>|string[]} [opts.sourceConfigStrings]
 * @returns {{ entries: Object[], exposableIds: string[], allHiddenToday: boolean }}
 */
export function getFanBundleImportReadinessReport({
    manifestConfigStrings = [],
    sourceConfigStrings = []
} = {}) {
    const manifestSet = toConfigSet(manifestConfigStrings);
    const sourceSet = toConfigSet(sourceConfigStrings);

    const entries = FAN_BUNDLE_IMPORT_EXPECTATIONS.map(expectation => {
        const bundle = FAN_CONTROL_BUNDLES.find(b => b.id === expectation.id) || null;
        const inManifest = manifestSet.has(expectation.configString);
        const inSources = sourceSet.has(expectation.configString);
        const exposable = bundle
            ? isFanControlBundleImportReady(bundle, manifestSet)
            : false;
        const outstandingAcknowledgements = [];
        if (expectation.requiresPreviewAcknowledgement) {
            outstandingAcknowledgements.push('channel:preview');
        }
        if (expectation.requiresFanControlAcknowledgement) {
            outstandingAcknowledgements.push('fan-control');
        }
        if (expectation.requiresDacAddressAcknowledgement) {
            outstandingAcknowledgements.push('analog-fan-address-switch');
        }
        return {
            id: expectation.id,
            configString: expectation.configString,
            expectedArtifactName: expectation.expectedArtifactName,
            declared: true,
            inSources,
            inManifest,
            exposable,
            outstandingAcknowledgements
        };
    });

    const exposableIds = FAN_CONTROL_BUNDLES
        ? getExposableFanControlBundles(manifestSet).map(b => b.id)
        : [];

    return {
        entries,
        exposableIds,
        allHiddenToday: entries.every(e => !e.exposable)
    };
}
