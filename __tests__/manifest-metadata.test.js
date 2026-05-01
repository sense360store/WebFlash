import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.join(process.cwd(), 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

describe('manifest.json metadata', () => {
    test('every build entry has the required ESP Web Tools shape', () => {
        for (const build of manifest.builds) {
            expect(typeof build.version).toBe('string');
            expect(typeof build.chipFamily).toBe('string');
            expect(Array.isArray(build.parts)).toBe(true);
            expect(build.parts.length).toBeGreaterThan(0);
            for (const part of build.parts) {
                expect(typeof part.path).toBe('string');
                expect(typeof part.offset).toBe('number');
            }
        }
    });

    test('configuration builds carry config_string + structured metadata', () => {
        const configBuilds = manifest.builds.filter(b => b.config_string);
        expect(configBuilds.length).toBeGreaterThan(0);
        for (const build of configBuilds) {
            expect(typeof build.config_string).toBe('string');
            expect(build.config_string.length).toBeGreaterThan(0);
            expect(Array.isArray(build.modules)).toBe(true);
        }
    });

    test('every module on a build also appears in its config_string', () => {
        for (const build of manifest.builds) {
            if (!build.config_string || !Array.isArray(build.modules)) {
                continue;
            }
            const cs = build.config_string.toLowerCase();
            for (const mod of build.modules) {
                expect(cs.includes(mod.toLowerCase())).toBe(true);
            }
        }
    });

    test('non-rescue descriptions reference their config_string', () => {
        for (const build of manifest.builds) {
            if (!build.config_string || build.channel === 'rescue') {
                continue;
            }
            if (!build.description) {
                continue;
            }
            expect(build.description.toLowerCase()).toContain(
                build.config_string.toLowerCase()
            );
        }
    });

    test('description does not contradict modules list', () => {
        const minimalPhrases = ['no expansion modules', 'minimal configuration', 'no modules'];
        for (const build of manifest.builds) {
            if (!build.description || !Array.isArray(build.modules) || build.modules.length === 0) {
                continue;
            }
            const desc = build.description.toLowerCase();
            for (const phrase of minimalPhrases) {
                expect(desc.includes(phrase)).toBe(false);
            }
        }
    });
});
