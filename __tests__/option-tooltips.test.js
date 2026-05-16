/**
 * WF-UX-007 — Option tooltip catalogue hygiene.
 *
 * Pins the two orphan entries that the WF-UX-007 jargon cleanup removed
 * (`airiq.base` / `airiq.pro`) and asserts that no remaining tooltip
 * title surfaces customer-facing "Base" / "Pro" wording, which is the
 * deprecated Model/Variant nomenclature called out in CLAUDE.md:131-132.
 */
import { describe, expect, test } from '@jest/globals';
import { optionTooltips, getOptionTooltip } from '../scripts/content/option-tooltips.js';

describe('WF-UX-007 — option-tooltips orphan cleanup', () => {
    test('airiq.base and airiq.pro orphan entries are removed', () => {
        expect(optionTooltips).toHaveProperty('airiq');
        expect(optionTooltips.airiq).not.toHaveProperty('base');
        expect(optionTooltips.airiq).not.toHaveProperty('pro');
    });

    test('getOptionTooltip("airiq", "base"|"pro") returns null', () => {
        // The popover renderer falls through to null and silently closes
        // when a tooltip key is missing, so removing the orphans should
        // not surface a runtime error for any callers that still look
        // them up.
        expect(getOptionTooltip('airiq', 'base')).toBeNull();
        expect(getOptionTooltip('airiq', 'pro')).toBeNull();
    });

    test('airiq.none and other current popover targets still resolve', () => {
        // Sanity: the cleanup must not have dropped tooltip entries that
        // the live wizard still reaches via data-option-info buttons.
        expect(optionTooltips.airiq.none?.title).toBe('No AirIQ Module');
        expect(optionTooltips.core?.standard?.title).toBe('Core (Standard)');
        expect(optionTooltips.power?.poe?.title).toBe('Sense360 PoE PSU');
        expect(optionTooltips.fan?.triac?.title).toBe('Sense360 TRIAC');
    });

    test('no remaining customer-facing tooltip title contains "Base" or "Pro" tier wording', () => {
        // CLAUDE.md:131-132 forbids Model/Variant Base/Pro tier nomenclature
        // in customer-facing surfaces. Walk every tooltip entry and verify
        // the title (the headline a customer reads) is free of those tokens
        // as standalone words.
        const offenders = [];
        for (const [groupKey, group] of Object.entries(optionTooltips)) {
            for (const [valueKey, entry] of Object.entries(group)) {
                const title = entry?.title || '';
                if (/\bBase\b/.test(title) || /\bPro\b/.test(title)) {
                    offenders.push(`${groupKey}.${valueKey} → "${title}"`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test('every tooltip group is a plain object (no array leakage)', () => {
        // Defence-in-depth: ensures the object shape stays as
        // `{ group: { value: {...} } }` so the popover lookup contract
        // in option-info-popover.js keeps working.
        const malformed = Object.entries(optionTooltips).filter(([, group]) => {
            return !group || typeof group !== 'object' || Array.isArray(group);
        });
        expect(malformed).toEqual([]);
    });
});
