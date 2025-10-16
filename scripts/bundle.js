import { getState } from './state.js';
import {
    getSerialLogLines,
    isCaptureEnabled,
    subscribeToCapture,
    serialRingBuffer
} from './serial/log-store.js';

const supportBundleSubscribers = new Set();

function notifySupportBundleSubscribers(enabled) {
    supportBundleSubscribers.forEach((listener) => {
        try {
            listener(enabled);
        } catch (error) {
            console.error('support bundle listener error', error);
        }
    });
}

subscribeToCapture((enabled) => {
    notifySupportBundleSubscribers(enabled);
});

export function subscribeToSupportBundleCapture(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }

    supportBundleSubscribers.add(listener);
    listener(isCaptureEnabled());

    return () => {
        supportBundleSubscribers.delete(listener);
    };
}

export function createSupportBundle({ includeSerial = false } = {}) {
    const state = typeof getState === 'function' ? getState() : {};
    const bundle = {
        generatedAt: new Date().toISOString(),
        configuration: state
    };

    if (includeSerial) {
        bundle.serialLogLines = serialRingBuffer.toArray();
    }

    return bundle;
}

export function getSerialLogsSnapshot() {
    return getSerialLogLines();
}
