const ISSUE_URL = 'https://github.com/sense360store/WebFlash/issues/new';
const ISSUE_TEMPLATE = 'webflash_bug.yml';
const ISSUE_LABELS = 'bug,webflash';

function normaliseCrashId(value) {
    if (!value && value !== 0) {
        return '';
    }

    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-f0-9]/g, '')
        .slice(0, 8);
}

function normaliseText(value) {
    if (!value && value !== 0) {
        return '';
    }

    return String(value).trim();
}

function buildCrashIssueUrl({ crashId, deviceId, channel } = {}) {
    const normalisedCrashId = normaliseCrashId(crashId) || 'unknown';
    const normalisedDevice = normaliseText(deviceId);
    const normalisedChannel = normaliseText(channel);

    const params = [
        `template=${ISSUE_TEMPLATE}`,
        `title=[Crash%20${normalisedCrashId}]`,
        `labels=${ISSUE_LABELS}`,
        `webflash_crash_id=${encodeURIComponent(normalisedCrashId)}`,
        `device=${encodeURIComponent(normalisedDevice)}`,
        `channel=${encodeURIComponent(normalisedChannel)}`
    ];

    return `${ISSUE_URL}?${params.join('&')}`;
}

function openCrashIssue(details = {}) {
    const issueUrl = buildCrashIssueUrl(details);

    if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(issueUrl, '_blank', 'noopener,noreferrer');
    }

    return issueUrl;
}

const api = { buildCrashIssueUrl, openCrashIssue };

if (typeof window !== 'undefined') {
    window.webflashCrashReporter = api;
}

export { buildCrashIssueUrl, openCrashIssue };
export default api;
