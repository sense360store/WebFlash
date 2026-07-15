/**
 * @fileoverview Nearest-build matcher for the "firmware not available" UI.
 *
 * Given a target config_string (e.g. `Ceiling-POE-VentIQ-FanTRIAC-RoomIQ`)
 * and a list of available config_strings parsed out of the manifest, return
 * up to N nearby published builds. The matcher is informational only — the
 * frontend never auto-selects a "nearby" build, never treats one as a safe
 * replacement for the user's actual hardware, and the install gate keeps
 * doing exact-match lookup. See the no-compatible-firmware section in the
 * Step 4 wizard renderer.
 *
 * Ranking heuristic (higher score = closer to the target):
 *
 *   1. Same mounting (Ceiling).                                  required
 *   2. Same power (USB / POE / PWR).                             required
 *   3. Same air-quality family (AirIQ near AirIQ, VentIQ near
 *      VentIQ); penalise the cross-family pairing.              +5/-3
 *   4. Same fan variant (FanRelay/FanPWM/FanDAC/FanTRIAC).        +3
 *   5. Same RoomIQ presence.                                      +2
 *   6. Same Voice flag.                                            +1
 *   7. Same LED flag.                                              +1
 *   8. Tie-break by configuration similarity (#shared tokens)
 *      and by alphabetical config_string for determinism.
 *
 * @module firmware-nearest
 */

const SEGMENT_BUCKETS = Object.freeze({
    mounting: ['ceiling', 'wall'],
    power: ['USB', 'POE', 'PWR'],
    airFamily: ['AirIQ', 'VentIQ'],
    fan: ['FanRelay', 'FanPWM', 'FanDAC', 'FanTRIAC', 'FanAnalog'],
    presence: ['RoomIQ'],
    voice: ['Voice'],
    led: ['LED']
});

function tokensFromConfigString(configString) {
    if (typeof configString !== 'string') {
        return [];
    }
    return configString
        .split('-')
        .map(segment => segment.trim())
        .filter(Boolean);
}

function findBucketToken(tokens, bucket) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return null;
    }
    for (const token of tokens) {
        for (const candidate of bucket) {
            if (token === candidate) {
                return candidate;
            }
            if (candidate === 'AirIQ' && token.startsWith('AirIQ')) {
                return 'AirIQ';
            }
            if (candidate === 'VentIQ' && token.startsWith('VentIQ')) {
                return 'VentIQ';
            }
        }
    }
    return null;
}

function findFanToken(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return null;
    }
    for (const token of tokens) {
        if (token.startsWith('Fan') && token.length > 3) {
            return token;
        }
    }
    return null;
}

function findMountingToken(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return null;
    }
    const first = tokens[0]?.toLowerCase?.() || '';
    if (first === 'core' || first === 'corevoice') {
        return tokens[1]?.toLowerCase?.() || null;
    }
    return first;
}

function findPowerToken(tokens) {
    if (!Array.isArray(tokens)) {
        return null;
    }
    for (const token of tokens) {
        const upper = token.toUpperCase();
        if (SEGMENT_BUCKETS.power.includes(upper)) {
            return upper;
        }
    }
    return null;
}

function describeConfig(configString) {
    const tokens = tokensFromConfigString(configString);
    const mounting = findMountingToken(tokens);
    const power = findPowerToken(tokens);
    const airFamily = findBucketToken(tokens, SEGMENT_BUCKETS.airFamily);
    const fan = findFanToken(tokens);
    const presence = findBucketToken(tokens, SEGMENT_BUCKETS.presence);
    const voice = findBucketToken(tokens, SEGMENT_BUCKETS.voice);
    const led = findBucketToken(tokens, SEGMENT_BUCKETS.led);

    return {
        configString,
        tokens,
        mounting,
        power,
        airFamily,
        fan,
        presence,
        voice,
        led
    };
}

function scoreCandidate(target, candidate) {
    if (target.mounting && candidate.mounting && target.mounting !== candidate.mounting) {
        return null;
    }
    if (target.power && candidate.power && target.power !== candidate.power) {
        return null;
    }

    let score = 0;

    if (target.airFamily && candidate.airFamily) {
        if (target.airFamily === candidate.airFamily) {
            score += 5;
        } else {
            score -= 3;
        }
    } else if (target.airFamily && !candidate.airFamily) {
        score -= 1;
    } else if (!target.airFamily && candidate.airFamily) {
        score -= 1;
    }

    if (target.fan && candidate.fan) {
        if (target.fan === candidate.fan) {
            score += 3;
        } else {
            score -= 1;
        }
    } else if (target.fan && !candidate.fan) {
        score -= 1;
    }

    if (target.presence === candidate.presence) {
        if (target.presence) {
            score += 2;
        }
    } else if (target.presence && !candidate.presence) {
        score -= 1;
    }

    if (target.voice === candidate.voice) {
        if (target.voice) {
            score += 1;
        }
    }

    if (target.led === candidate.led) {
        if (target.led) {
            score += 1;
        }
    }

    const targetSet = new Set(target.tokens);
    let shared = 0;
    candidate.tokens.forEach(token => {
        if (targetSet.has(token)) {
            shared += 1;
        }
    });
    score += shared * 0.1;

    return score;
}

/**
 * Find up to `limit` config_strings from `availableConfigStrings` that are
 * "nearby" the requested `targetConfigString`. Same mounting and same
 * power are required — a Ceiling-POE-* request never returns a Wall-USB-*
 * candidate. Beyond that, candidates are ranked by how many module
 * decisions match.
 *
 * The result excludes the special `Rescue` build (which has no real
 * config-string structure) and the target itself, even if it happens to
 * match (defensive — the caller should already know the target is missing).
 *
 * @param {string} targetConfigString
 * @param {Array<string>} availableConfigStrings
 * @param {{ limit?: number }} [options]
 * @returns {Array<string>}
 */
export function findNearbyConfigStrings(targetConfigString, availableConfigStrings, options = {}) {
    const limit = Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : 3;

    if (!targetConfigString || !Array.isArray(availableConfigStrings) || availableConfigStrings.length === 0) {
        return [];
    }

    const target = describeConfig(targetConfigString);
    if (!target.mounting || !target.power) {
        return [];
    }

    const scored = [];
    const seen = new Set();
    availableConfigStrings.forEach(candidate => {
        if (typeof candidate !== 'string' || !candidate) {
            return;
        }
        if (candidate === targetConfigString) {
            return;
        }
        if (candidate === 'Rescue') {
            return;
        }
        if (seen.has(candidate)) {
            return;
        }
        seen.add(candidate);

        const candidateInfo = describeConfig(candidate);
        const score = scoreCandidate(target, candidateInfo);
        if (score === null) {
            return;
        }
        scored.push({ candidate, score });
    });

    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return a.candidate.localeCompare(b.candidate);
    });

    return scored.slice(0, limit).map(entry => entry.candidate);
}

/**
 * Build a list of human-readable mismatch hints for the user. Returns a
 * de-duplicated, ordered list of selected modules to double-check based on
 * the segments that appear in the target config but never appear in the
 * matching nearby builds. Used purely for the on-screen guidance — not for
 * gating logic.
 *
 * @param {string} targetConfigString
 * @param {Array<string>} nearbyConfigStrings
 * @returns {Array<{ key: string, label: string }>}
 */
export function getMismatchHighlights(targetConfigString, nearbyConfigStrings) {
    const target = describeConfig(targetConfigString);
    const highlights = [];
    const pushed = new Set();

    const addHighlight = (key, label) => {
        if (!label || pushed.has(key)) {
            return;
        }
        pushed.add(key);
        highlights.push({ key, label });
    };

    const nearbyDescriptors = (Array.isArray(nearbyConfigStrings) ? nearbyConfigStrings : [])
        .map(describeConfig);

    if (target.presence) {
        const matched = nearbyDescriptors.some(desc => desc.presence === target.presence);
        if (!matched) {
            addHighlight('presence', 'RoomIQ');
        }
    }

    if (target.airFamily) {
        const matched = nearbyDescriptors.some(desc => desc.airFamily === target.airFamily);
        if (!matched) {
            addHighlight('airFamily', target.airFamily);
        }
    }

    if (target.fan) {
        const matched = nearbyDescriptors.some(desc => desc.fan === target.fan);
        if (!matched) {
            addHighlight('fan', formatFanLabel(target.fan));
        }
    }

    if (target.voice) {
        const matched = nearbyDescriptors.some(desc => desc.voice === target.voice);
        if (!matched) {
            addHighlight('voice', 'Voice');
        }
    }

    if (target.led) {
        const matched = nearbyDescriptors.some(desc => desc.led === target.led);
        if (!matched) {
            addHighlight('led', 'LED');
        }
    }

    return highlights;
}

function formatFanLabel(fanToken) {
    switch (fanToken) {
        case 'FanRelay': return 'Fan / Switching: Relay';
        case 'FanPWM': return 'Fan / Switching: PWM';
        case 'FanDAC':
        case 'FanAnalog': return 'Fan / Switching: DAC';
        case 'FanTRIAC': return 'Fan / Switching: TRIAC';
        default: return fanToken ? `Fan / Switching: ${fanToken.replace(/^Fan/, '')}` : 'Fan / Switching';
    }
}

export const __testHooks = Object.freeze({
    describeConfig,
    scoreCandidate,
    formatFanLabel
});
