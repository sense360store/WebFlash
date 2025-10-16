import { createRingBuffer } from './ringbuf.js';

const serialRingBuffer = createRingBuffer();
let captureEnabled = false;

const captureListeners = new Set();
const lineListeners = new Set();

function notifyCaptureListeners() {
    captureListeners.forEach((listener) => {
        try {
            listener(captureEnabled);
        } catch (error) {
            console.error('serial capture listener error', error);
        }
    });
}

function notifyLineListeners(line) {
    lineListeners.forEach((listener) => {
        try {
            listener(line);
        } catch (error) {
            console.error('serial line listener error', error);
        }
    });
}

function setCaptureEnabled(enabled) {
    const nextValue = Boolean(enabled);
    if (captureEnabled === nextValue) {
        return;
    }

    captureEnabled = nextValue;
    notifyCaptureListeners();
}

function isCaptureEnabled() {
    return captureEnabled;
}

function addSerialLine(line) {
    const stringLine = line === undefined || line === null ? '' : String(line);
    notifyLineListeners(stringLine);

    if (!captureEnabled || !stringLine) {
        return;
    }

    serialRingBuffer.push(stringLine);
}

function subscribeToCapture(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }

    captureListeners.add(listener);
    listener(captureEnabled);

    return () => {
        captureListeners.delete(listener);
    };
}

function subscribeToLines(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }

    lineListeners.add(listener);

    return () => {
        lineListeners.delete(listener);
    };
}

function getSerialLogLines() {
    return serialRingBuffer.toArray();
}

function clearSerialLogLines() {
    serialRingBuffer.clear();
}

export {
    addSerialLine,
    clearSerialLogLines,
    getSerialLogLines,
    isCaptureEnabled,
    serialRingBuffer,
    setCaptureEnabled,
    subscribeToCapture,
    subscribeToLines
};
