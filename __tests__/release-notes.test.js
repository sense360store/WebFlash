import fs from 'node:fs';
import path from 'node:path';

describe('release notes availability', () => {
    test('stable Wall-USB release notes exist using stable suffix', () => {
        const notesPath = path.join('firmware', 'configurations', 'Sense360-Wall-USB-v1.0.0-stable.md');
        expect(fs.existsSync(notesPath)).toBe(true);
    });
});
