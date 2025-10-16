import {
    addSerialLine,
    isCaptureEnabled,
    setCaptureEnabled,
    subscribeToCapture,
    subscribeToLines
} from './log-store.js';

function appendLineToElement(element, line) {
    if (!element) {
        return;
    }

    if (element.tagName === 'TEXTAREA') {
        const currentValue = element.value ? `${element.value}\n` : '';
        element.value = `${currentValue}${line}`;
        if (typeof element.scrollTop === 'number') {
            element.scrollTop = element.scrollHeight;
        }
        return;
    }

    const doc = element.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.createElement !== 'function') {
        return;
    }

    const paragraph = doc.createElement('div');
    paragraph.textContent = line;
    element.appendChild(paragraph);
    if (typeof element.scrollTop === 'number') {
        element.scrollTop = element.scrollHeight;
    }
}

export function initialiseSerialConsole({ outputElement, captureToggle } = {}) {
    if (captureToggle) {
        captureToggle.checked = isCaptureEnabled();
        captureToggle.addEventListener('change', (event) => {
            setCaptureEnabled(event.target.checked);
        });
    }

    let lineUnsubscribe = () => {};

    if (outputElement) {
        lineUnsubscribe = subscribeToLines((line) => {
            appendLineToElement(outputElement, line);
        });
    }

    const captureUnsubscribe = subscribeToCapture((enabled) => {
        if (captureToggle) {
            captureToggle.checked = enabled;
        }
    });

    return {
        dispose() {
            lineUnsubscribe();
            captureUnsubscribe();
        },
        handleDecodedLine(decodedLine) {
            addSerialLine(decodedLine);
        }
    };
}
