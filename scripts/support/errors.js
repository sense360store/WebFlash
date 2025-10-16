(function (global) {
    const scope = global || {};
    const errorLog = [];

    function normaliseString(value, fallback = '') {
        if (typeof value === 'string' && value.trim().length) {
            return value;
        }
        if (value == null) {
            return fallback;
        }
        try {
            return String(value);
        } catch (_) {
            return fallback;
        }
    }

    function normaliseStepId(stepId) {
        if (typeof stepId === 'string' && stepId.trim().length) {
            return stepId;
        }
        if (typeof stepId === 'number' && Number.isFinite(stepId)) {
            return `step-${stepId}`;
        }
        return null;
    }

    function logError(details = {}) {
        const message = normaliseString(details.message, 'Unexpected error');
        const stack = normaliseString(details.stack, '');
        const stepId = normaliseStepId(details.stepId ?? details.step);
        const timestamp = new Date().toISOString();

        const entry = { message, stack, stepId, timestamp };
        errorLog.push(entry);
        return entry;
    }

    function getErrors() {
        return errorLog.slice();
    }

    function clearErrors() {
        errorLog.length = 0;
    }

    const api = {
        logError,
        getErrors,
        clearErrors
    };

    scope.supportErrors = scope.supportErrors || api;
    if (!scope.supportErrors.logError) {
        scope.supportErrors.logError = api.logError;
    }
    if (!scope.supportErrors.getErrors) {
        scope.supportErrors.getErrors = api.getErrors;
    }
    if (!scope.supportErrors.clearErrors) {
        scope.supportErrors.clearErrors = api.clearErrors;
    }
})(typeof window !== 'undefined' ? window : globalThis);
