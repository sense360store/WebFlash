import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import {
    REQUIRED_PROVENANCE_FIELDS,
    MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES,
    PLACEHOLDER_FIRMWARE_SIZE_BYTES,
    validateFirmwareProvenance,
    pickDefaultEligibleBuilds,
    describeVerificationChecks
} from '../scripts/utils/firmware-provenance.js';

const VALID_STABLE_BUILD = Object.freeze({
    channel: 'stable',
    version: '2.0.0',
    chipFamily: 'ESP32-S3',
    config_string: 'Ceiling-POE-AirIQ',
    sha256: 'c9674b9df0ab00e3357c5dc526566ac440b32537aaf808a1e12b2f9db9b90397',
    md5: '1eb1fea3994bbbeea11080159dbbe611',
    signature: 'KQvII0GBl7I+lDSWVrq4q+q80Hsy+uZ8vBPL+hhNlyQ=',
    source_commit: 'eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    source_url: 'https://github.com/sense360store/WebFlash/commit/eec461a4f6d85ac3d4920ee2dbd26c3be459aa40',
    file_size: 524288,
    changelog: ['Stable build of Sense360 Ceiling-POE-AirIQ v2.0.0.'],
    parts: [{ path: 'firmware/configurations/Sense360-Ceiling-POE-AirIQ-v2.0.0-stable.bin', offset: 0 }],
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

describe('validateFirmwareProvenance — required fields', () => {
    test('valid stable build passes with no missing fields and an upbeat summary', () => {
        const report = validateFirmwareProvenance(VALID_STABLE_BUILD);
        expect(report.ok).toBe(true);
        expect(report.status).toBe('pass');
        expect(report.missingRequired).toEqual([]);
        expect(report.blockingReasons).toEqual([]);
        expect(report.warnings).toEqual([]);
        expect(report.summary).toMatch(/provenance verified/i);
        expect(report.verifiedFields).toEqual(
            expect.arrayContaining([...REQUIRED_PROVENANCE_FIELDS, 'file_size_plausible'])
        );
    });

    test('stable build missing signature is blocked from install', () => {
        const report = validateFirmwareProvenance(withoutField(VALID_STABLE_BUILD, 'signature'));
        expect(report.ok).toBe(false);
        expect(report.status).toBe('fail');
        expect(report.missingRequired).toContain('signature');
        expect(report.blockingReasons.join(' ')).toMatch(/firmware signature/i);
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

    test('stable build missing changelog is blocked from install', () => {
        const report = validateFirmwareProvenance(valueless(VALID_STABLE_BUILD, 'changelog', []));
        expect(report.ok).toBe(false);
        expect(report.missingRequired).toContain('changelog');
        expect(report.blockingReasons.join(' ')).toMatch(/changelog/i);
    });

    test('stable build missing file_size is blocked from install', () => {
        const report = validateFirmwareProvenance(valueless(VALID_STABLE_BUILD, 'file_size', 0));
        expect(report.ok).toBe(false);
        expect(report.missingRequired).toContain('file_size');
    });

    test('non-stable channel records missing fields as warnings, not blockers', () => {
        const betaBuild = { ...VALID_STABLE_BUILD, channel: 'beta' };
        const report = validateFirmwareProvenance(withoutField(betaBuild, 'source_commit'));
        expect(report.ok).toBe(true);
        expect(report.status).toBe('warn');
        expect(report.blockingReasons).toEqual([]);
        expect(report.warnings.join(' ')).toMatch(/missing provenance metadata/i);
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
    test('placeholder fixture sizes are tolerated by default (matches gen-manifests.py)', () => {
        const placeholderBuild = { ...VALID_STABLE_BUILD, file_size: 18 };
        const report = validateFirmwareProvenance(placeholderBuild);
        expect(report.sizeClassification).toBe('placeholder');
        expect(report.ok).toBe(true);
    });

    test('suspiciously small binaries trigger a blocking warning', () => {
        const truncatedBuild = { ...VALID_STABLE_BUILD, file_size: 4096 };
        const report = validateFirmwareProvenance(truncatedBuild);
        expect(report.ok).toBe(false);
        expect(report.status).toBe('fail');
        expect(report.sizeClassification).toBe('suspicious');
        expect(report.blockingReasons.join(' ')).toMatch(
            /below the plausible-firmware threshold/i
        );
    });

    test('plausible-sized binaries surface as verified', () => {
        const report = validateFirmwareProvenance({ ...VALID_STABLE_BUILD, file_size: MIN_PLAUSIBLE_FIRMWARE_SIZE_BYTES });
        expect(report.sizeClassification).toBe('plausible');
        expect(report.verifiedFields).toContain('file_size_plausible');
    });

    test('non-default placeholder threshold can be tightened via options', () => {
        const report = validateFirmwareProvenance(
            { ...VALID_STABLE_BUILD, file_size: 18 },
            { allowPlaceholderSize: false }
        );
        expect(report.warnings.join(' ')).toMatch(/placeholder/i);
    });

    test('PLACEHOLDER_FIRMWARE_SIZE_BYTES is the documented sentinel', () => {
        expect(PLACEHOLDER_FIRMWARE_SIZE_BYTES).toBe(64);
    });
});

describe('validateFirmwareProvenance — deprecated firmware', () => {
    test('deprecated builds surface a warning but do not block install', () => {
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
    test('produces an entry per required field with a pass/fail flag', () => {
        const { entries } = describeVerificationChecks(VALID_STABLE_BUILD);
        const labels = entries.map(entry => entry.key);
        expect(labels).toEqual(
            expect.arrayContaining([
                'sha256',
                'signature',
                'source_commit',
                'file_size',
                'changelog',
                'file_size_plausible',
                'deprecated'
            ])
        );
        for (const entry of entries) {
            expect(entry.ok).toBe(true);
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

    test('every stable build in manifest.json passes the provenance gate', () => {
        const stableBuilds = manifest.builds.filter(build => build.channel === 'stable');
        expect(stableBuilds.length).toBeGreaterThan(0);
        for (const build of stableBuilds) {
            const report = validateFirmwareProvenance(build);
            if (!report.ok) {
                throw new Error(
                    `Stable build ${build?.parts?.[0]?.path || build?.config_string} failed provenance: ${report.summary}`
                );
            }
            expect(report.ok).toBe(true);
        }
    });

    test('every build entry carries source_commit, deprecated and changelog fields', () => {
        for (const build of manifest.builds) {
            expect(typeof build.source_commit === 'string' || build.source_commit === null).toBe(true);
            expect(['boolean'].includes(typeof build.deprecated)).toBe(true);
            expect(Array.isArray(build.changelog)).toBe(true);
        }
    });

    test('at least one build is marked deprecated to exercise the dropdown skip', () => {
        const deprecated = manifest.builds.filter(build => build.deprecated === true);
        expect(deprecated.length).toBeGreaterThan(0);
    });
});
