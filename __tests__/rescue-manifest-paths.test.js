import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// ESP Web Tools resolves `parts[].path` relative to the manifest URL, not the
// page URL. The standalone rescue manifest lives at
// `firmware/rescue/manifest.json`, so a part path like
// `firmware/rescue/Sense360-Rescue-...bin` resolves to
// `firmware/rescue/firmware/rescue/Sense360-Rescue-...bin` and 404s. This
// test catches that regression by resolving every part path against the
// manifest's directory and asserting the file exists on disk.
const RESCUE_MANIFEST_PATH = path.join(process.cwd(), 'firmware', 'rescue', 'manifest.json');

describe('firmware/rescue/manifest.json part paths', () => {
    const manifest = JSON.parse(fs.readFileSync(RESCUE_MANIFEST_PATH, 'utf8'));
    const manifestDir = path.dirname(RESCUE_MANIFEST_PATH);

    test('manifest declares at least one build with parts', () => {
        expect(Array.isArray(manifest.builds)).toBe(true);
        expect(manifest.builds.length).toBeGreaterThan(0);
        for (const build of manifest.builds) {
            expect(Array.isArray(build.parts)).toBe(true);
            expect(build.parts.length).toBeGreaterThan(0);
        }
    });

    test('every part path resolves to an existing file relative to the manifest directory', () => {
        for (const build of manifest.builds) {
            for (const part of build.parts) {
                expect(typeof part.path).toBe('string');
                expect(part.path.length).toBeGreaterThan(0);

                const resolved = path.resolve(manifestDir, part.path);
                expect(fs.existsSync(resolved)).toBe(true);
            }
        }
    });

    test('no part path duplicates the manifest directory prefix', () => {
        // Catches the specific regression where a path is written as
        // "firmware/rescue/<file>" while the manifest itself sits in
        // firmware/rescue/, which ESP Web Tools would resolve to
        // firmware/rescue/firmware/rescue/<file>.
        for (const build of manifest.builds) {
            for (const part of build.parts) {
                expect(part.path.startsWith('firmware/rescue/')).toBe(false);
                expect(part.path.startsWith('./firmware/rescue/')).toBe(false);
            }
        }
    });
});
