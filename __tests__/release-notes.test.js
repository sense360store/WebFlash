import fs from 'node:fs';
import path from 'node:path';

describe('release notes availability', () => {
    test('stable Wall-USB release notes exist using stable suffix', () => {
        const notesPath = path.join('firmware', 'configurations', 'Sense360-Wall-USB-v1.0.0-stable.md');
        expect(fs.existsSync(notesPath)).toBe(true);
    });

    test('preview release notes are stored outside production configuration directory', () => {
        const previewNotesPath = path.join('firmware', 'previews', 'Sense360-Wall-USB-v1.0.0-preview.md');
        const legacyProductionPath = path.join('firmware', 'configurations', 'Sense360-Wall-USB-v1.0.0-preview.md');
        expect(fs.existsSync(previewNotesPath)).toBe(true);
        expect(fs.existsSync(legacyProductionPath)).toBe(false);
    });
});
