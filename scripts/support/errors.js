const MAX_ERRORS = 50;
const DEDUPE_WINDOW_MS = 5000;

const errorBuffer = [];
const dedupeMap = new Map();

function pushError(entry) {
    const key = `${entry.message}::${entry.stack ?? ''}`;
    const now = Date.now();
    const lastTimestamp = dedupeMap.get(key) ?? 0;

    if (now - lastTimestamp < DEDUPE_WINDOW_MS) {
        return;
    }

    dedupeMap.set(key, now);
    errorBuffer.push(entry);

    if (errorBuffer.length > MAX_ERRORS) {
        errorBuffer.splice(0, errorBuffer.length - MAX_ERRORS);
    }
}

function normaliseError(error, fallbackMessage) {
    if (!error || typeof error !== 'object') {
        return {
            message: fallbackMessage ?? String(error ?? 'Unknown error'),
            stack: undefined,
            cause: undefined
        };
    }

    const message = typeof error.message === 'string' && error.message
        ? error.message
        : fallbackMessage ?? 'Unknown error';

    return {
        message,
        stack: typeof error.stack === 'string' ? error.stack : undefined,
        cause: error.cause ? String(error.cause) : undefined
    };
}

function recordGlobalError(event) {
    const { message, error, lineno, colno, filename } = event ?? {};
    const normalised = normaliseError(error, typeof message === 'string' ? message : 'Unhandled error');

    const location = filename ? `${filename}${typeof lineno === 'number' ? `:${lineno}` : ''}${typeof colno === 'number' ? `:${colno}` : ''}` : '';
    const stackWithLocation = normalised.stack || location || undefined;

    pushError({
        ts: new Date().toISOString(),
        type: 'error',
        message: normalised.message,
        stack: stackWithLocation,
        cause: normalised.cause
    });
}

function recordUnhandledRejection(event) {
    let reason = event?.reason;
    if (reason && typeof reason === 'object' && 'reason' in reason && reason.reason !== reason) {
        reason = reason.reason;
    }

    const normalised = normaliseError(reason, 'Unhandled promise rejection');

    pushError({
        ts: new Date().toISOString(),
        type: 'rejection',
        message: normalised.message,
        stack: normalised.stack,
        cause: normalised.cause
    });
}

const previousOnError = typeof window !== 'undefined' ? window.onerror : null;
const previousOnUnhandled = typeof window !== 'undefined' ? window.onunhandledrejection : null;

if (typeof window !== 'undefined') {
    window.onerror = function onWindowError(message, source, lineno, colno, error) {
        recordGlobalError({ message, filename: source, lineno, colno, error });

        if (typeof previousOnError === 'function') {
            try {
                return previousOnError.apply(this, arguments); // eslint-disable-line prefer-rest-params
            } catch (handlerError) {
                pushError({
                    ts: new Date().toISOString(),
                    type: 'error',
                    message: `Error in previous window.onerror handler: ${handlerError.message || handlerError}`,
                    stack: typeof handlerError.stack === 'string' ? handlerError.stack : undefined,
                    cause: handlerError.cause ? String(handlerError.cause) : undefined
                });
            }
        }

        return false;
    };

    window.onunhandledrejection = function onWindowUnhandledRejection(event) {
        recordUnhandledRejection(event);

        if (typeof previousOnUnhandled === 'function') {
            try {
                return previousOnUnhandled.apply(this, arguments); // eslint-disable-line prefer-rest-params
            } catch (handlerError) {
                pushError({
                    ts: new Date().toISOString(),
                    type: 'error',
                    message: `Error in previous onunhandledrejection handler: ${handlerError.message || handlerError}`,
                    stack: typeof handlerError.stack === 'string' ? handlerError.stack : undefined,
                    cause: handlerError.cause ? String(handlerError.cause) : undefined
                });
            }
        }

        return undefined;
    };
}

function getErrors() {
    return errorBuffer.slice();
}

export { getErrors };
