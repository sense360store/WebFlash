import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('firmware canonical naming', () => {
  test('rejects legacy BathroomAirIQ tokens in configuration filenames', () => {
    const dir = path.join(__dirname, '..', 'firmware', 'configurations');
    const legacyTokenPattern = /BathroomAirIQ(Base|Pro)?/;
    const offenders = fs.readdirSync(dir).filter((name) => legacyTokenPattern.test(name));
    expect(offenders).toEqual([]);
  });
});
