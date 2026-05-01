#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = path.join('firmware', 'configurations');
const CANONICAL_PATTERN = /^Sense360-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*-v\d+\.\d+\.\d+-(stable|preview|beta)\.(bin|md)$/;

const DISALLOWED_TOKEN_MIGRATIONS = {
  AirIQProv: 'AirIQ',
  AirIQPro: 'AirIQ',
  AirIQBase: 'AirIQ',
  BathroomAirIQ: 'VentIQ',
  BathroomAirIQBase: 'VentIQ',
  BathroomAirIQPro: 'VentIQ',
  FanPWM: 'Fan',
  FanAnalog: 'Fan'
};

function validateFileName(name, baseDir = DEFAULT_DIR) {
  const issues = [];

  if (!CANONICAL_PATTERN.test(name)) {
    issues.push({
      file: path.join(baseDir, name),
      code: 'NON_CANONICAL_PATTERN',
      message: `Non-canonical filename pattern: ${name}`
    });
    return issues;
  }

  const [, rest] = name.split('Sense360-');
  const [prefix] = rest.split('-v');
  const tokens = prefix.split('-');
  for (const token of tokens) {
    if (Object.hasOwn(DISALLOWED_TOKEN_MIGRATIONS, token)) {
      issues.push({
        file: path.join(baseDir, name),
        code: 'DISALLOWED_TOKEN',
        message: `Disallowed token "${token}" found. Use "${DISALLOWED_TOKEN_MIGRATIONS[token]}" instead.`
      });
    }
  }

  const channel = name.match(/-(stable|preview|beta)\.(bin|md)$/)?.[1];
  const extension = path.extname(name);
  if (extension === '.md' && channel !== 'stable') {
    issues.push({
      file: path.join(baseDir, name),
      code: 'CHANNEL_ARTIFACT_PLACEMENT',
      message: `${channel} release notes must not be placed in ${baseDir}; only stable notes are allowed there.`
    });
  }

  return issues;
}

export function validateNamingPolicy(configDir = DEFAULT_DIR) {
  if (!fs.existsSync(configDir)) {
    return [{ file: configDir, code: 'MISSING_DIRECTORY', message: `Directory not found: ${configDir}` }];
  }

  const issues = [];
  const entries = fs.readdirSync(configDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    issues.push(...validateFileName(entry.name, configDir));
  }

  return issues;
}

function formatIssues(issues) {
  return issues.map((i) => `- [${i.code}] ${i.message} (${i.file})`).join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const configDir = process.argv[2] || DEFAULT_DIR;
  const issues = validateNamingPolicy(configDir);

  if (issues.length > 0) {
    console.error('❌ Naming policy violations found:\n' + formatIssues(issues));
    process.exit(1);
  }

  console.log(`✅ Naming policy validation passed for ${configDir}`);
}

export { DISALLOWED_TOKEN_MIGRATIONS, CANONICAL_PATTERN, DEFAULT_DIR };
