import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// WF2-CALLOUT-HIDDEN-FIX-001 — empty install-step callout bars guard.
//
// On the deployed install step two empty amber `.callout--warn` bars rendered
// around the green "Ready to install" verdict on a clean desktop Chrome stable
// install: the service-worker update notice (swNoticeEl) and the
// mobile / unsupported-browser banner (unsupportedBannerEl). Both are created
// in scripts/install.js with `hidden: true` and are only shown by removing the
// attribute. They rendered visible-but-empty because app.css set
// `.callout { display: flex }` with no `[hidden]` reset, so the author rule
// overrode the user-agent `[hidden] { display: none }` rule and defeated the
// attribute. The freshnessControlsEl carries an inline `display: flex`, which
// only an `!important` author rule can re-hide.
//
// jsdom does not compute the CSS cascade, so this guard asserts the fix at the
// source level: the CSS reset exists with the required declaration, and the
// install.js elements still rely on the `hidden` attribute.

const repoRoot = process.cwd();
const appCss = fs.readFileSync(path.join(repoRoot, 'app.css'), 'utf8');
const installJs = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'install.js'),
    'utf8'
);

describe('WF2-CALLOUT-HIDDEN-FIX-001 — hidden-attribute CSS reset', () => {
    test('app.css carries a [hidden] reset to display: none !important', () => {
        // Strip CSS comments so the explanatory comment (which mentions a
        // plain `[hidden] { display: none }`) cannot satisfy the guard.
        const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '');
        // Match the real `[hidden]` rule and require the !important declaration.
        const hiddenRule = /\[hidden\]\s*\{[^}]*\}/.exec(css);
        expect(hiddenRule).not.toBeNull();
        expect(hiddenRule[0]).toMatch(
            /display\s*:\s*none\s*!important/
        );
    });

    test('install.js still creates swNoticeEl with hidden: true', () => {
        expect(installJs).toMatch(
            /const\s+swNoticeEl\s*=\s*h\([^)]*hidden:\s*true/s
        );
    });

    test('install.js still creates unsupportedBannerEl with hidden: true', () => {
        expect(installJs).toMatch(
            /const\s+unsupportedBannerEl\s*=\s*h\([^)]*hidden:\s*true/s
        );
    });
});
