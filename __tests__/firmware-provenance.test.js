import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import {
    REQUIRED_PROVENANCE_FIELDS,
    CRITICAL_PROVENANCE_FIELDS,
    CHECK_IDS,
    ARTIFACT_TYPES,
    MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES,
    PLACEHOLDER_FIRMWARE_SIZE_BYTES,
    validateFirmwareProvenance,
    pickDefaultEligibleBuilds,
    describeVerificationChecks,
    changelogSeverityForChannel,
    changelogLooksSynthesised,
    changelogLooksFiller,
    isMutableSourceUrl,
    sourceUrlMatchesCommit
} from '../scripts/utils/firmware-provenance.js';
import { findTrustedKey } from '../scripts/utils/firmware-trusted-keys.js';

const VALID_STABLE_BUILD = Object.freeze({
    channel: 'stable',
    version: '2.0.0',
    chipFamily: 'ESP32-S3',
    config_string: 'Ceiling-POE-VentIQ-RoomIQ',
    sha256: 'c9674b9df0ab00e3357c5dc526566ac440b32537aaf808a1e12b2f9db9b90397',
    md5: '1eb1fea3994bbbeea11080159dbbe611',
    signature: 'KQvII0GBl7I+lDSWVrq4q+q80Hsy+uZ8vBPL+hhNlyQ=',
    // Real Ed25519 signature metadata. The bytes here are not a real
    // signature over the test fixture — verification of the bytes
    // happens in firmware-signature.test.js. The provenance gate only
    // checks that the field is *present* and (in production mode) does
    // not refer to a 'test_only' key in the trust list. We use a
    // synthetic key id that is not on the trust list so the static gate
    // accepts it; the production-mode refusal of the committed dev key
    // (which IS on the trust list as test_only) is exercised separately
    // in firmware-signature.test.js.
    signature_ed25519: 'kgpXnONkJ8YZhazkL4U8NlOiFW1Xwbri37UI6jEOwfAOHzvR/YCxZ4m6NKJypOdvya8khHFjrw6rHSMaSu//Aw==',
    signature_key_id: 'unit-test-fixture-key',
    source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    file_size: 524288,
    // Hand-authored changelog; the synth-detection pattern must NOT match it,
    // otherwise the fixture would block install on its own.
    changelog: ['Stable v2.0.0 rollout for Sense360 Ceiling-POE-VentIQ-RoomIQ; supersedes v1.0.0 as the recommended build.'],
    parts: [{ path: 'firmware/configurations/Sense360-Ceiling-POE-VentIQ-RoomIQ-v2.0.0-stable.bin', offset: 0 }],
    deprecated: false,
    deprecation_reason: null
});

function withoutField(build, field) {
    const clone = { ...build };
    delete clone[field];
    return clone;
}

function valueless(build, field, value) {
    return { ...build, [field]: value };
}

function findCheck(report, id) {
    return report.checks.find(check => check.id === id);
}

describe('validateFirmwareProvenance — required fields', () => {
    test('valid stable build passes with no missing fields and an upbeat summary', () => {
        const report = validateFirmwareProvenance(VALID_STABLE_BUILD);
        expect(report.ok).toBe(true);
        expect(report.status).toBe('pass');
        expect(report.blocking).toBe(false);
        expect(report.missingRequired).toEqual([]);
        expect(report.failures).toEqual([]);
        expect(report.warnings).toEqual([]);
        expect(report.summary).toMatch(/provenance metadata verified/i);
        expect(report.verifiedFields).toEqual(
            expect.arrayContaining([...REQUIRED_PROVENANCE_FIELDS, 'file_size_plausible'])
        );
    });

    test('stable build missing signature is blocked from install', () => {
        const report = validateFirmwareProvenance(withoutField(VALID_STABLE_BUILD, 'signature'));
        expect(report.ok).toBe(false);
        expect(report.status).toBe('fail');
        expect(report.blocking).toBe(true);
        expect(report.missingRequired).toContain('signature');
        expect(report.blockingReasons.join(' ')).toMatch(/signature metadata/i);
    });

    test('stable build missing sha256 is blocked from install', () => {
        const report = validateFirmwareProvenance(valueless(VALID_STABLE_BUILD, 'sha256', ''));
        expect(report.ok).toBe(false);
        expect(report.missingRequired).toContain('sha256');
        expect(report.blockingReasons.join(' ')).toMatch(/sha-256/i);
    });

    test('stable build missing source_commit is blocked from install', () => {
        const report = validateFirmwareProvenance(valueless(VALID_STABLE_BUILD, 'source_commit', null));
        expect(report.ok).toBe(false);
        expect(report.missingRequired).toContain('source_commit');
        expect(report.blockingReasons.join(' ')).toMatch(/source commit/i);
    });

    test('stable build missing changelog is blocked with the human-authored requirement message', () => {
        const report = validateFirmwareProvenance(valueless(VALID_STABLE_BUILD, 'changelog', []));
        expect(report.ok).toBe(false);
        expect(report.missingRequired).toContain('changelog');
        expect(report.changelogSeverity).toBe('fail');
        expect(report.blockingReasons.join(' ')).toMatch(/human-authored changelog/i);
    });

    test('stable build missing file_size is blocked from install', () => {
        const report = validateFirmwareProvenance(valueless(VALID_STABLE_BUILD, 'file_size', 0));
        expect(report.ok).toBe(false);
        expect(report.missingRequired).toContain('file_size');
    });

    test('beta build missing critical primitive (source_commit) blocks install', () => {
        const betaBuild = { ...VALID_STABLE_BUILD, channel: 'beta' };
        const report = validateFirmwareProvenance(withoutField(betaBuild, 'source_commit'));
        // Critical primitives are blocking on ANY remotely flashable channel,
        // not just stable. This is the change introduced by the provenance
        // hardening pass.
        expect(report.ok).toBe(false);
        expect(report.status).toBe('fail');
        expect(report.blockingReasons.join(' ')).toMatch(/source commit/i);
    });

    test('beta build missing sha256 blocks install (not just warns)', () => {
        const betaBuild = { ...VALID_STABLE_BUILD, channel: 'beta' };
        const report = validateFirmwareProvenance(withoutField(betaBuild, 'sha256'));
        expect(report.ok).toBe(false);
        expect(report.blockingReasons.join(' ')).toMatch(/sha-256/i);
    });

    test('rescue build missing sha256 blocks install', () => {
        const rescueBuild = { ...VALID_STABLE_BUILD, channel: 'rescue' };
        const report = validateFirmwareProvenance(withoutField(rescueBuild, 'sha256'));
        expect(report.ok).toBe(false);
        expect(report.blockingReasons.join(' ')).toMatch(/sha-256/i);
    });

    test('REQUIRED_PROVENANCE_FIELDS includes the documented set', () => {
        expect(REQUIRED_PROVENANCE_FIELDS).toEqual([
            'sha256',
            'signature',
            'source_commit',
            'file_size',
            'changelog'
        ]);
    });
});

describe('validateFirmwareProvenance — file size sanity', () => {
    test('placeholder fixture sizes are tolerated in development/test mode (matches gen-manifests.py --mode development)', () => {
        const placeholderBuild = { ...VALID_STABLE_BUILD, file_size: 18 };
        const report = validateFirmwareProvenance(placeholderBuild, { mode: 'development' });
        expect(report.sizeClassification).toBe('placeholder');
        expect(report.ok).toBe(true);
    });

    test('placeholder stable firmware is REFUSED by the production-mode static gate', () => {
        // The 18-byte fixtures committed to the repo are not real firmware
        // images. The production install gate must refuse them so end users
        // never see a placeholder advertised as installable.
        const placeholderBuild = { ...VALID_STABLE_BUILD, file_size: 18 };
        const report = validateFirmwareProvenance(placeholderBuild, { mode: 'production' });
        expect(report.sizeClassification).toBe('placeholder');
        expect(report.ok).toBe(false);
        expect(report.status).toBe('fail');
        expect(report.blockingReasons.join(' ')).toMatch(/placeholder fixture/i);
        expect(report.blockingReasons.join(' ')).toMatch(/cannot be installed by the production WebFlash app/i);
        const sizeCheck = findCheck(report, CHECK_IDS.FILE_SIZE_PLAUSIBLE);
        expect(sizeCheck.status).toBe('fail');
        expect(sizeCheck.severity).toBe('block');
    });

    test('placeholder firmware passes when artifact_type is test_fixture even in production mode', () => {
        const fixture = {
            ...VALID_STABLE_BUILD,
            artifact_type: ARTIFACT_TYPES.TEST_FIXTURE,
            file_size: 18
        };
        const report = validateFirmwareProvenance(fixture, { mode: 'production' });
        // test_fixture artifacts are exempt from the placeholder check —
        // their whole purpose is to be tiny stubs.
        const sizeCheck = findCheck(report, CHECK_IDS.FILE_SIZE_PLAUSIBLE);
        expect(sizeCheck.status).toBe('pass');
    });

    test('explicit allowPlaceholderSize:true override re-allows placeholders in production mode', () => {
        const placeholderBuild = { ...VALID_STABLE_BUILD, file_size: 18 };
        const report = validateFirmwareProvenance(
            placeholderBuild,
            { mode: 'production', allowPlaceholderSize: true }
        );
        const sizeCheck = findCheck(report, CHECK_IDS.FILE_SIZE_PLAUSIBLE);
        expect(sizeCheck.status).toBe('pass');
        expect(sizeCheck.detail).toMatch(/placeholder fixture/i);
    });

    test('suspiciously small application binaries trigger a blocking warning', () => {
        const truncatedBuild = { ...VALID_STABLE_BUILD, file_size: 4096 };
        const report = validateFirmwareProvenance(truncatedBuild);
        expect(report.ok).toBe(false);
        expect(report.status).toBe('fail');
        expect(report.sizeClassification).toBe('suspicious');
        expect(report.blockingReasons.join(' ')).toMatch(
            /below the 102400-byte plausible threshold|below the .* plausible threshold/i
        );
    });

    test('plausible-sized binaries surface as verified', () => {
        const report = validateFirmwareProvenance({ ...VALID_STABLE_BUILD, file_size: MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES });
        expect(report.sizeClassification).toBe('plausible');
        expect(report.verifiedFields).toContain('file_size_plausible');
    });

    test('explicit allowPlaceholderSize:false rejects placeholders even in development mode', () => {
        const report = validateFirmwareProvenance(
            { ...VALID_STABLE_BUILD, file_size: 18 },
            { mode: 'development', allowPlaceholderSize: false }
        );
        // Production-grade rejection: placeholder firmware fails closed
        // with a blocking severity, not just a soft warning.
        expect(report.ok).toBe(false);
        expect(report.blockingReasons.join(' ')).toMatch(/placeholder fixture/i);
    });

    test('PLACEHOLDER_FIRMWARE_SIZE_BYTES is the documented sentinel', () => {
        expect(PLACEHOLDER_FIRMWARE_SIZE_BYTES).toBe(64);
    });
});

describe('validateFirmwareProvenance — artifact-type-aware size validation', () => {
    test('rescue artifact accepts a smaller plausible threshold than application', () => {
        const rescueBuild = {
            ...VALID_STABLE_BUILD,
            channel: 'rescue',
            artifact_type: ARTIFACT_TYPES.RESCUE,
            file_size: 60 * 1024  // below application threshold but above rescue threshold
        };
        const report = validateFirmwareProvenance(rescueBuild);
        // For rescue, 60 KB > 50 KB minimum is plausible.
        expect(report.sizeClassification).toBe('plausible');
        expect(report.ok).toBe(true);
    });

    test('test_fixture artifact is exempt from size sanity in test mode', () => {
        const fixture = {
            ...VALID_STABLE_BUILD,
            channel: 'test',
            artifact_type: ARTIFACT_TYPES.TEST_FIXTURE,
            file_size: 18
        };
        const report = validateFirmwareProvenance(fixture, { mode: 'test' });
        expect(report.ok).toBe(true);
        const sizeCheck = findCheck(report, CHECK_IDS.FILE_SIZE_PLAUSIBLE);
        expect(sizeCheck.detail).toMatch(/test fixture/i);
    });

    test('partition_table allows tiny sizes', () => {
        const partition = {
            ...VALID_STABLE_BUILD,
            artifact_type: ARTIFACT_TYPES.PARTITION_TABLE,
            file_size: 3072
        };
        const report = validateFirmwareProvenance(partition);
        expect(report.sizeClassification).toBe('plausible');
        expect(report.ok).toBe(true);
    });
});

describe('validateFirmwareProvenance — channel modes', () => {
    test('dev channel build is blocked in production mode', () => {
        const devBuild = { ...VALID_STABLE_BUILD, channel: 'dev' };
        const report = validateFirmwareProvenance(devBuild, { mode: 'production' });
        expect(report.ok).toBe(false);
        const channelCheck = findCheck(report, CHECK_IDS.CHANNEL_ALLOWED_FOR_MODE);
        expect(channelCheck.status).toBe('fail');
        expect(channelCheck.severity).toBe('block');
        expect(report.blockingReasons.join(' ')).toMatch(/development\/test mode/i);
    });

    test('dev channel build is permitted in development mode', () => {
        const devBuild = { ...VALID_STABLE_BUILD, channel: 'dev' };
        const report = validateFirmwareProvenance(devBuild, { mode: 'development' });
        expect(report.ok).toBe(true);
        const channelCheck = findCheck(report, CHECK_IDS.CHANNEL_ALLOWED_FOR_MODE);
        expect(channelCheck.status).toBe('pass');
    });

    test('test channel build still requires critical primitives in development mode', () => {
        const testBuild = { ...VALID_STABLE_BUILD, channel: 'test', sha256: '' };
        const report = validateFirmwareProvenance(testBuild, { mode: 'development' });
        expect(report.ok).toBe(false);
        expect(report.missingRequired).toContain('sha256');
    });
});

describe('validateFirmwareProvenance — source_url immutability', () => {
    test('valid commit-pinned URL passes', () => {
        const report = validateFirmwareProvenance(VALID_STABLE_BUILD);
        const check = findCheck(report, CHECK_IDS.SOURCE_URL_IMMUTABLE);
        expect(check.status).toBe('pass');
    });

    test('source_url with /tree/main fails in production mode', () => {
        const build = {
            ...VALID_STABLE_BUILD,
            source_url: 'https://github.com/sense360store/WebFlash/tree/main/firmware'
        };
        const report = validateFirmwareProvenance(build, { mode: 'production' });
        expect(report.ok).toBe(false);
        const check = findCheck(report, CHECK_IDS.SOURCE_URL_IMMUTABLE);
        expect(check.status).toBe('fail');
        expect(check.severity).toBe('block');
    });

    test('source_url with /blob/main fails in production mode', () => {
        const build = {
            ...VALID_STABLE_BUILD,
            source_url: 'https://github.com/sense360store/WebFlash/blob/main/manifest.json'
        };
        const report = validateFirmwareProvenance(build, { mode: 'production' });
        expect(report.ok).toBe(false);
    });

    test('source_url with /releases/latest fails in production mode', () => {
        const build = {
            ...VALID_STABLE_BUILD,
            source_url: 'https://github.com/sense360store/WebFlash/releases/latest'
        };
        const report = validateFirmwareProvenance(build, { mode: 'production' });
        expect(report.ok).toBe(false);
    });

    test('mutable source_url downgrades to warning in development mode', () => {
        const build = {
            ...VALID_STABLE_BUILD,
            source_url: 'https://github.com/sense360store/WebFlash/tree/main/firmware'
        };
        const report = validateFirmwareProvenance(build, { mode: 'development' });
        // Critical primitives still pass; mutable URL only warns.
        const check = findCheck(report, CHECK_IDS.SOURCE_URL_IMMUTABLE);
        expect(check.status).toBe('fail');
        expect(check.severity).toBe('warn');
        expect(report.ok).toBe(true);
    });

    test('source_url that does not include source_commit fails in production', () => {
        const build = {
            ...VALID_STABLE_BUILD,
            source_url: 'https://example.com/builds/some-tag'
        };
        const report = validateFirmwareProvenance(build, { mode: 'production' });
        expect(report.ok).toBe(false);
        const check = findCheck(report, CHECK_IDS.SOURCE_URL_IMMUTABLE);
        expect(check.detail).toMatch(/source_commit/i);
    });

    test('isMutableSourceUrl helper detects branch and latest references', () => {
        expect(isMutableSourceUrl('https://github.com/x/y/tree/main')).toBe(true);
        expect(isMutableSourceUrl('https://github.com/x/y/blob/master/file')).toBe(true);
        expect(isMutableSourceUrl('https://github.com/x/y/releases/latest')).toBe(true);
        expect(isMutableSourceUrl('https://github.com/x/y/raw/develop/path')).toBe(true);
        expect(isMutableSourceUrl('https://github.com/x/y/commit/abcdef')).toBe(false);
        expect(isMutableSourceUrl('https://github.com/x/y/tree/abcdef1')).toBe(false);
        expect(isMutableSourceUrl('')).toBe(false);
        expect(isMutableSourceUrl(null)).toBe(false);
    });

    test('sourceUrlMatchesCommit accepts both full and short SHA', () => {
        expect(sourceUrlMatchesCommit(
            'https://github.com/x/y/commit/abcdef1234567890',
            'abcdef1234567890'
        )).toBe(true);
        expect(sourceUrlMatchesCommit(
            'https://github.com/x/y/commit/abcdef1',
            'abcdef1234567890'
        )).toBe(true);
        expect(sourceUrlMatchesCommit('', 'abc')).toBe(false);
        expect(sourceUrlMatchesCommit('https://x/y', '')).toBe(false);
    });
});

describe('validateFirmwareProvenance — signature verification claim', () => {
    test('signature_verified is reported as pending until runtime verification runs', () => {
        // Static-gate verdict for a build that DOES carry signature_ed25519:
        // metadata is good, but the cryptographic check itself can only run
        // after the binary is downloaded. The check therefore enters
        // 'pending' state — and the runtime layer flips it to pass/fail via
        // applySignatureVerificationResult().
        const report = validateFirmwareProvenance(VALID_STABLE_BUILD);
        const check = findCheck(report, CHECK_IDS.SIGNATURE_VERIFIED);
        expect(check.status).toBe('pending');
        // Pending copy: explicit that authenticity has NOT been verified yet
        // and will be verified before flashing. Must not claim authenticity
        // has passed.
        expect(check.detail).toMatch(/authenticity will be verified before flashing/i);
        expect(check.detail).not.toMatch(/authenticity verified with/i);
        expect(report.pending).toBe(true);
    });

    test('signature_verified fails closed when no Ed25519 signature is present', () => {
        const build = { ...VALID_STABLE_BUILD };
        delete build.signature_ed25519;
        delete build.signature_key_id;
        const report = validateFirmwareProvenance(build);
        const check = findCheck(report, CHECK_IDS.SIGNATURE_VERIFIED);
        expect(check.status).toBe('fail');
        expect(check.severity).toBe('block');
        expect(report.ok).toBe(false);
    });

    test('signature_metadata_present is distinct from signature_verified', () => {
        const report = validateFirmwareProvenance(VALID_STABLE_BUILD);
        const meta = findCheck(report, CHECK_IDS.SIGNATURE_METADATA_PRESENT);
        const verified = findCheck(report, CHECK_IDS.SIGNATURE_VERIFIED);
        expect(meta.status).toBe('pass');
        // pending — metadata is present, but the actual verification call
        // has not been executed yet.
        expect(verified.status).toBe('pending');
        // The metadata-present check should not claim cryptographic
        // verification — its detail is purely about field presence.
        expect(meta.detail.toLowerCase()).not.toContain('cryptograph');
    });

    test('stable build with missing signature_ed25519 is blocked from install', () => {
        const build = { ...VALID_STABLE_BUILD };
        delete build.signature_ed25519;
        delete build.signature_key_id;
        const report = validateFirmwareProvenance(build);
        expect(report.ok).toBe(false);
        const ed25519Check = findCheck(report, CHECK_IDS.SIGNATURE_ED25519_METADATA_PRESENT);
        expect(ed25519Check.status).toBe('fail');
        expect(ed25519Check.severity).toBe('block');
        expect(report.blockingReasons.join(' ')).toMatch(/signature_ed25519/i);
    });

    test('stable build with signature_ed25519 but missing key id is blocked', () => {
        const build = { ...VALID_STABLE_BUILD, signature_key_id: '' };
        const report = validateFirmwareProvenance(build);
        expect(report.ok).toBe(false);
        const ed25519Check = findCheck(report, CHECK_IDS.SIGNATURE_ED25519_METADATA_PRESENT);
        expect(ed25519Check.status).toBe('fail');
        expect(ed25519Check.detail).toMatch(/signature_key_id/i);
    });
});

describe('validateFirmwareProvenance — deprecated firmware', () => {
    test('deprecated builds with a reason surface a warning but do not block install', () => {
        const deprecatedBuild = {
            ...VALID_STABLE_BUILD,
            deprecated: true,
            deprecation_reason: 'Superseded by v2.0.0.'
        };
        const report = validateFirmwareProvenance(deprecatedBuild);
        expect(report.deprecated).toBe(true);
        expect(report.status).toBe('warn');
        expect(report.ok).toBe(true);
        expect(report.warnings.join(' ')).toMatch(/deprecated/i);
        expect(report.warnings.join(' ')).toMatch(/Superseded by v2\.0\.0\./);
    });

    test('deprecated build WITHOUT a reason is flagged as a content failure (still non-blocking)', () => {
        const deprecatedBuild = {
            ...VALID_STABLE_BUILD,
            deprecated: true,
            deprecation_reason: null
        };
        const report = validateFirmwareProvenance(deprecatedBuild);
        const lifecycle = findCheck(report, CHECK_IDS.LIFECYCLE_STATUS);
        expect(lifecycle.status).toBe('fail');
        expect(lifecycle.severity).toBe('warn');
        expect(report.warnings.join(' ')).toMatch(/deprecation_reason/i);
    });

    test('pickDefaultEligibleBuilds removes deprecated entries while keeping order', () => {
        const builds = [
            { firmwareId: 'a', deprecated: true },
            { firmwareId: 'b', deprecated: false },
            { firmwareId: 'c' }
        ];
        const eligible = pickDefaultEligibleBuilds(builds);
        expect(eligible.map(b => b.firmwareId)).toEqual(['b', 'c']);
    });

    test('pickDefaultEligibleBuilds tolerates non-array inputs', () => {
        expect(pickDefaultEligibleBuilds(null)).toEqual([]);
        expect(pickDefaultEligibleBuilds(undefined)).toEqual([]);
    });
});

describe('describeVerificationChecks — UI surface', () => {
    test('produces an entry per legacy key with a pass/fail flag', () => {
        const { entries } = describeVerificationChecks(VALID_STABLE_BUILD);
        const labels = entries.map(entry => entry.key);
        expect(labels).toEqual(
            expect.arrayContaining([
                'sha256',
                'signature',
                'signature_ed25519',
                'source_commit',
                'file_size',
                'changelog',
                'file_size_plausible',
                'deprecated'
            ])
        );
        // Every check on a valid build either passes outright, is skipped
        // (informational checks that don't apply), or is in 'pending' state
        // (signature_verified — runtime verification has not been called
        // yet from the static-only test path). None should fail.
        for (const entry of entries) {
            const acceptable = entry.ok || entry.pending === true;
            expect(acceptable).toBe(true);
        }
    });

    test('signature missing flips that entry to a failure but keeps the others passing', () => {
        const { entries } = describeVerificationChecks(withoutField(VALID_STABLE_BUILD, 'signature'));
        const sig = entries.find(entry => entry.key === 'signature');
        const sha = entries.find(entry => entry.key === 'sha256');
        expect(sig.ok).toBe(false);
        expect(sha.ok).toBe(true);
    });
});

describe('manifest.json — provenance integration', () => {
    const manifestPath = path.join(process.cwd(), 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    test('every stable build in manifest.json passes the provenance gate UNDER TEST MODE', () => {
        // Test mode accepts both `active` production keys and the committed
        // `test_only` dev key, so this assertion just confirms the rest of
        // each stable build's metadata is well-formed regardless of which
        // key signed it. The production-mode outcome (active accepted,
        // test_only refused) is partitioned and asserted in the next test.
        const stableBuilds = manifest.builds.filter(build => build.channel === 'stable');
        expect(stableBuilds.length).toBeGreaterThan(0);
        for (const build of stableBuilds) {
            const report = validateFirmwareProvenance(build, { mode: 'test' });
            if (!report.ok) {
                throw new Error(
                    `Stable build ${build?.parts?.[0]?.path || build?.config_string} failed provenance: ${report.summary}`
                );
            }
            expect(report.ok).toBe(true);
        }
    });

    test('every stable build in manifest.json gets the correct production-mode static-gate outcome for its signing key', () => {
        // Backstop check, partitioned by the trust-list status of each
        // build's signing key. Case (a) below has now happened: the trust
        // list contains an ACTIVE production key (sense360-prod-2026-02)
        // whose private half lives only in CI secrets, and the flagship
        // 1.0.4 stable build is signed by it, so it is LEGITIMATELY accepted
        // by the production-mode static gate. The security invariant that
        // must NOT regress is case (b): a build signed by a `test_only` key
        // (its private half is in the public repo) must still be REFUSED
        // with a test_only blocking reason. We assert the right outcome for
        // each partition instead of a blanket refusal.
        //
        // The test_only static-gate refusal is also exercised directly,
        // independent of the manifest, with a synthetic dev-2026-01 build in
        // firmware-signature.test.js ('production mode static gate REFUSES
        // test_only-signed stable build before runtime check').
        const stableBuilds = manifest.builds.filter(build => build.channel === 'stable');
        expect(stableBuilds.length).toBeGreaterThan(0);
        for (const build of stableBuilds) {
            const trusted = findTrustedKey(build.signature_key_id);
            const report = validateFirmwareProvenance(build);  // mode defaults to 'production'
            if (trusted && trusted.status === 'test_only') {
                expect(report.ok).toBe(false);
                // The blocking reason should mention test_only so support and
                // operators can quickly identify the cause.
                expect(report.blockingReasons.join(' ')).toMatch(/test_only/i);
            } else {
                // Active production key (or any non-test_only trusted key):
                // the static gate must not block on key status.
                if (!report.ok) {
                    throw new Error(
                        `Stable build ${build?.config_string} (key=${build.signature_key_id}) ` +
                        `was unexpectedly REFUSED by the production static gate: ${report.summary}`
                    );
                }
                expect(report.ok).toBe(true);
            }
        }
    });

    test('every build entry carries source_commit, deprecated and changelog fields', () => {
        for (const build of manifest.builds) {
            expect(typeof build.source_commit === 'string' || build.source_commit === null).toBe(true);
            expect(['boolean'].includes(typeof build.deprecated)).toBe(true);
            expect(Array.isArray(build.changelog)).toBe(true);
        }
    });

    // WF-DEPLOY-001 — the previous "at least one build is marked
    // deprecated" assertion was a stale historical artifact from the
    // 16-build legacy manifest, where shadowed older AirIQ/PWR stable
    // versions carried `deprecated: true`. After WF-CLEANUP-005 the real
    // manifest legitimately has zero deprecated builds (Release-One
    // stable, LED preview, Rescue — all `deprecated: false`), so that
    // assertion blocked the CI test job on every push to main and
    // therefore blocked the build → deploy chain. The wizard's
    // deprecated-build skip behavior is covered by synthetic-fixture
    // tests elsewhere in this file (see `validateFirmwareProvenance`
    // tests against `VALID_STABLE_BUILD` with `deprecated: true`); it is
    // not a contract the production manifest needs to satisfy.

    test('every stable build ships a hand-authored (non-synthesised) changelog', () => {
        const stableBuilds = manifest.builds.filter(build => build.channel === 'stable');
        expect(stableBuilds.length).toBeGreaterThan(0);
        for (const build of stableBuilds) {
            expect(Array.isArray(build.changelog)).toBe(true);
            expect(build.changelog.length).toBeGreaterThan(0);
            expect(changelogLooksSynthesised(build.changelog)).toBe(false);
        }
    });

    test('every flashable build has a commit-pinned source_url', () => {
        for (const build of manifest.builds) {
            if (!build.source_url) continue;
            expect(isMutableSourceUrl(build.source_url)).toBe(false);
            if (build.source_commit) {
                expect(sourceUrlMatchesCommit(build.source_url, build.source_commit)).toBe(true);
            }
        }
    });

    test('every flashable build declares an artifact_type', () => {
        for (const build of manifest.builds) {
            expect(typeof build.artifact_type).toBe('string');
            expect(build.artifact_type.length).toBeGreaterThan(0);
        }
    });
});

describe('changelog policy — channel severity ladder', () => {
    test('stable channels treat missing changelog as a fail', () => {
        for (const channel of ['stable', 'general', 'GA', 'production']) {
            expect(changelogSeverityForChannel(channel)).toBe('fail');
        }
    });

    test('beta and preview channels treat missing changelog as a warning', () => {
        for (const channel of ['preview', 'beta', 'rc', 'candidate', 'prerelease']) {
            expect(changelogSeverityForChannel(channel)).toBe('warn');
        }
    });

    test('dev/rescue channels are permissive', () => {
        for (const channel of ['dev', 'nightly', 'experimental', 'rescue', 'test']) {
            expect(changelogSeverityForChannel(channel)).toBe('allow');
        }
    });

    test('beta build with missing changelog warns but does not block install', () => {
        const betaBuild = { ...VALID_STABLE_BUILD, channel: 'beta', changelog: [] };
        const report = validateFirmwareProvenance(betaBuild);
        expect(report.ok).toBe(true);
        expect(report.status).toBe('warn');
        expect(report.changelogSeverity).toBe('warn');
        expect(report.warnings.join(' ')).toMatch(/human-authored changelog/i);
    });

    test('dev build with missing changelog passes silently in development mode', () => {
        const devBuild = { ...VALID_STABLE_BUILD, channel: 'dev', changelog: [] };
        const report = validateFirmwareProvenance(devBuild, { mode: 'development' });
        expect(report.ok).toBe(true);
        expect(report.status).toBe('pass');
        expect(report.warnings).toEqual([]);
        expect(report.changelogSeverity).toBe('allow');
    });

    test('rescue channel does not warn about empty changelog', () => {
        const rescueBuild = { ...VALID_STABLE_BUILD, channel: 'rescue', changelog: [] };
        const report = validateFirmwareProvenance(rescueBuild);
        expect(report.ok).toBe(true);
        expect(report.warnings).toEqual([]);
    });

    test('CRITICAL_PROVENANCE_FIELDS lists the always-block primitives only', () => {
        expect(CRITICAL_PROVENANCE_FIELDS).toEqual([
            'sha256',
            'signature',
            'source_commit',
            'file_size'
        ]);
    });

    test('dev build with missing critical primitive fails (regardless of mode)', () => {
        const devBuild = { ...VALID_STABLE_BUILD, channel: 'dev', signature: '' };
        const report = validateFirmwareProvenance(devBuild, { mode: 'development' });
        expect(report.ok).toBe(false);
        expect(report.missingRequired).toContain('signature');
        expect(report.blockingReasons.join(' ')).toMatch(/signature metadata/i);
    });
});

describe('changelog policy — synthesised changelog detection', () => {
    test.each([
        'Stable build of Sense360 Ceiling-POE-AirIQ v2.0.0.',
        'stable build of sense360 ceiling-usb-fan v1.0.0',
        'Beta build of Sense360 Ceiling-POE-AirIQ v1.0.1.',
        'Rescue build of Sense360 Rescue v1.0.0.'
    ])('detects auto-synth pattern: %s', (entry) => {
        expect(changelogLooksSynthesised([entry])).toBe(true);
    });

    test('does not flag a hand-authored changelog as synthesised', () => {
        expect(changelogLooksSynthesised([
            'Initial tracked stable release for the Sense360 Ceiling-POE-AirIQ configuration; establishes the manifest baseline on this hardware revision.'
        ])).toBe(false);
        expect(changelogLooksSynthesised([
            'Fixes mmWave driver init crash on cold boot.'
        ])).toBe(false);
    });

    test('multi-entry changelog is never treated as synthesised even if one line matches', () => {
        expect(changelogLooksSynthesised([
            'Stable build of Sense360 Ceiling-POE-AirIQ v2.0.0.',
            'Fixes mmWave driver init crash on cold boot.'
        ])).toBe(false);
    });

    test('handles non-array, non-string, and empty inputs gracefully', () => {
        expect(changelogLooksSynthesised(null)).toBe(false);
        expect(changelogLooksSynthesised(undefined)).toBe(false);
        expect(changelogLooksSynthesised([])).toBe(false);
        expect(changelogLooksSynthesised([42])).toBe(false);
    });

    test('synthesised changelog blocks install for stable builds', () => {
        const synthBuild = {
            ...VALID_STABLE_BUILD,
            changelog: ['Stable build of Sense360 Ceiling-POE-AirIQ v2.0.0.']
        };
        const report = validateFirmwareProvenance(synthBuild);
        expect(report.ok).toBe(false);
        expect(report.changelogSynthesised).toBe(true);
        expect(report.missingRequired).toContain('changelog');
        expect(report.blockingReasons.join(' ')).toMatch(/auto-generated/i);
    });

    test('synthesised changelog only warns for beta builds', () => {
        const synthBuild = {
            ...VALID_STABLE_BUILD,
            channel: 'beta',
            changelog: ['Beta build of Sense360 Ceiling-POE-AirIQ v1.0.1.']
        };
        const report = validateFirmwareProvenance(synthBuild);
        expect(report.ok).toBe(true);
        expect(report.status).toBe('warn');
        expect(report.changelogSynthesised).toBe(true);
        expect(report.warnings.join(' ')).toMatch(/auto-generated/i);
    });

    test('describeVerificationChecks marks synthesised changelog as failing for stable', () => {
        const synthBuild = {
            ...VALID_STABLE_BUILD,
            changelog: ['Stable build of Sense360 Ceiling-USB v1.0.0.']
        };
        const { entries } = describeVerificationChecks(synthBuild);
        const changelogEntry = entries.find(e => e.key === 'changelog');
        expect(changelogEntry.ok).toBe(false);
        expect(changelogEntry.detail).toMatch(/auto-generated/i);
    });

    test('describeVerificationChecks tolerates synthesised changelog on dev channel', () => {
        const synthDev = {
            ...VALID_STABLE_BUILD,
            channel: 'dev',
            changelog: ['Dev build of Sense360 Ceiling-USB v9.9.9.']
        };
        const { entries } = describeVerificationChecks(synthDev, { mode: 'development' });
        const changelogEntry = entries.find(e => e.key === 'changelog');
        expect(changelogEntry.ok).toBe(true);
        expect(changelogEntry.detail).toMatch(/tolerated/i);
    });
});

describe('changelog policy — generic-filler detection', () => {
    test.each([
        ['Initial release.'],
        ['First release'],
        ['TBD'],
        ['Placeholder'],
        ['N/A.'],
        ['See release notes.']
    ])('flags generic filler entry %j', (entry) => {
        expect(changelogLooksFiller([entry])).toBe(true);
    });

    test('does not flag substantive entries as filler', () => {
        expect(changelogLooksFiller([
            'Initial tracked stable release for the Sense360 Ceiling-POE-AirIQ configuration.'
        ])).toBe(false);
        expect(changelogLooksFiller([])).toBe(false);
    });

    test('stable build with generic filler changelog blocks install', () => {
        const build = { ...VALID_STABLE_BUILD, changelog: ['Initial release.'] };
        const report = validateFirmwareProvenance(build);
        expect(report.ok).toBe(false);
        expect(report.changelogFiller).toBe(true);
        expect(report.blockingReasons.join(' ')).toMatch(/boilerplate/i);
    });
});

describe('Stable provenance result shape — machine-readable contract', () => {
    test('checks array exposes stable IDs with status and severity', () => {
        const report = validateFirmwareProvenance(VALID_STABLE_BUILD);
        expect(Array.isArray(report.checks)).toBe(true);

        const ids = report.checks.map(c => c.id);
        expect(ids).toEqual(expect.arrayContaining([
            CHECK_IDS.SHA256_METADATA_PRESENT,
            CHECK_IDS.SIGNATURE_METADATA_PRESENT,
            CHECK_IDS.SIGNATURE_ED25519_METADATA_PRESENT,
            CHECK_IDS.SIGNATURE_VERIFIED,
            CHECK_IDS.SOURCE_COMMIT_PRESENT,
            CHECK_IDS.SOURCE_URL_IMMUTABLE,
            CHECK_IDS.FIRMWARE_PATH_PRESENT,
            CHECK_IDS.ARTIFACT_IDENTITY_PRESENT,
            CHECK_IDS.FILE_SIZE_PRESENT,
            CHECK_IDS.FILE_SIZE_PLAUSIBLE,
            CHECK_IDS.CHANGELOG_PRESENT,
            CHECK_IDS.LIFECYCLE_STATUS,
            CHECK_IDS.CHANNEL_ALLOWED_FOR_MODE
        ]));

        for (const check of report.checks) {
            expect(typeof check.id).toBe('string');
            expect(typeof check.label).toBe('string');
            expect(['pass', 'warn', 'fail', 'skip', 'pending']).toContain(check.status);
            expect(['block', 'warn', 'info']).toContain(check.severity);
            expect(typeof check.detail).toBe('string');
        }
    });

    test('failures array is empty for a valid build', () => {
        const report = validateFirmwareProvenance(VALID_STABLE_BUILD);
        expect(report.failures).toEqual([]);
        expect(report.blocking).toBe(false);
    });

    test('failures array enumerates blocked checks for an invalid build', () => {
        const broken = { ...VALID_STABLE_BUILD, sha256: '', source_commit: '' };
        const report = validateFirmwareProvenance(broken);
        const failureIds = report.failures.map(f => f.id);
        expect(failureIds).toEqual(expect.arrayContaining([
            CHECK_IDS.SHA256_METADATA_PRESENT,
            CHECK_IDS.SOURCE_COMMIT_PRESENT
        ]));
        expect(report.blocking).toBe(true);
        // Every failure has a stable id, label, and detail — never just a free string.
        for (const f of report.failures) {
            expect(typeof f.id).toBe('string');
            expect(typeof f.label).toBe('string');
            expect(typeof f.detail).toBe('string');
        }
    });

    test('CHECK_IDS is frozen so consumers can rely on the IDs', () => {
        expect(Object.isFrozen(CHECK_IDS)).toBe(true);
    });
});
