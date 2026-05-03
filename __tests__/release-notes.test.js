import fs from 'node:fs';
import path from 'node:path';

describe('release notes channel placement', () => {
    test('every .md file in firmware/configurations is a stable release note', () => {
        const configDir = path.join('firmware', 'configurations');
        const notes = fs.existsSync(configDir)
            ? fs.readdirSync(configDir).filter(name => name.endsWith('.md'))
            : [];
        const offenders = notes.filter(name => !/-stable\.md$/.test(name));
        expect(offenders).toEqual([]);
    });

    test('preview/beta/dev release notes never live under firmware/configurations', () => {
        const configDir = path.join('firmware', 'configurations');
        const notes = fs.existsSync(configDir)
            ? fs.readdirSync(configDir).filter(name => name.endsWith('.md'))
            : [];
        const offenders = notes.filter(name => /-(preview|beta|dev)\.md$/.test(name));
        expect(offenders).toEqual([]);
    });
});
