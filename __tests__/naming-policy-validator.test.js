import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateNamingPolicy } from '../scripts/validate-naming-policy.js';

describe('naming policy validator', () => {
  test('passes with canonical files and stable release notes only', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-policy-pass-'));
    fs.writeFileSync(path.join(tempDir, 'Sense360-Core-Wall-USB-v1.0.0-stable.bin'), '');
    fs.writeFileSync(path.join(tempDir, 'Sense360-Core-Wall-USB-v1.0.0-stable.md'), '');

    const issues = validateNamingPolicy(tempDir);
    expect(issues).toEqual([]);
  });

  test('flags disallowed tokens, preview notes in production directory, and pattern drift', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-policy-fail-'));
    fs.writeFileSync(path.join(tempDir, 'Sense360-Core-Wall-USB-AirIQProv-v1.0.0-stable.bin'), '');
    fs.writeFileSync(path.join(tempDir, 'Sense360-Core-Wall-USB-v1.0.0-preview.md'), '');
    fs.writeFileSync(path.join(tempDir, 'sense360-core-wall-usb-v1.0.0-stable.bin'), '');

    const issues = validateNamingPolicy(tempDir);
    const codes = issues.map((issue) => issue.code);

    expect(codes).toContain('DISALLOWED_TOKEN');
    expect(codes).toContain('CHANNEL_ARTIFACT_PLACEMENT');
    expect(codes).toContain('NON_CANONICAL_PATTERN');
  });
});
