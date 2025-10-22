const USB_SIGNATURES = [
    { usbVendorId: 0x303A, usbProductId: 0x1001, chipFamily: 'ESP32-S3', chipName: 'Espressif ESP32-S3 (USB-CDC)', identifier: 'esp32-s3-usb' },
    { usbVendorId: 0x303A, usbProductId: 0x1002, chipFamily: 'ESP32-S3', chipName: 'Espressif ESP32-S3 (WebUSB)', identifier: 'esp32-s3-webusb' },
    { usbVendorId: 0x303A, usbProductId: 0x0002, chipFamily: 'ESP32-S2', chipName: 'Espressif ESP32-S2', identifier: 'esp32-s2' },
    { usbVendorId: 0x303A, usbProductId: 0x0003, chipFamily: 'ESP32-S3', chipName: 'Espressif ESP32-S3', identifier: 'esp32-s3' },
    { usbVendorId: 0x303A, usbProductId: 0x4001, chipFamily: 'ESP32-C3', chipName: 'Espressif ESP32-C3', identifier: 'esp32-c3' },
    { usbVendorId: 0x303A, usbProductId: 0x4000, chipFamily: 'ESP32-C3', chipName: 'Espressif ESP32-C3 (CDC)', identifier: 'esp32-c3-usb' },
    { usbVendorId: 0x303A, usbProductId: 0x7000, chipFamily: 'ESP32-C6', chipName: 'Espressif ESP32-C6', identifier: 'esp32-c6' },
    { usbVendorId: 0x303A, usbProductId: 0x8000, chipFamily: 'ESP32-H2', chipName: 'Espressif ESP32-H2', identifier: 'esp32-h2' },
    { usbVendorId: 0x303A, usbProductId: 0xC000, chipFamily: 'ESP32-P4', chipName: 'Espressif ESP32-P4', identifier: 'esp32-p4' }
];

const VENDOR_FALLBACKS = [
    { usbVendorId: 0x303A, chipFamily: 'ESP32', chipName: 'Espressif Systems' }
];

function normalizeUsbId(value) {
    if (typeof value !== 'number') {
        return null;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
        return null;
    }

    return numeric;
}

function formatUsbHex(value) {
    const numeric = normalizeUsbId(value);
    if (numeric === null) {
        return null;
    }

    return `0x${numeric.toString(16).padStart(4, '0').toUpperCase()}`;
}

function matchUsbSignature(usbVendorId, usbProductId) {
    const vendor = normalizeUsbId(usbVendorId);
    const product = normalizeUsbId(usbProductId);

    if (vendor === null) {
        return null;
    }

    if (product !== null) {
        const exact = USB_SIGNATURES.find(signature => signature.usbVendorId === vendor && signature.usbProductId === product);
        if (exact) {
            return exact;
        }
    }

    const fallback = VENDOR_FALLBACKS.find(signature => signature.usbVendorId === vendor);
    return fallback || null;
}

function describePort(port, index) {
    let info = {};
    try {
        if (typeof port.getInfo === 'function') {
            info = port.getInfo() || {};
        }
    } catch (error) {
        console.warn('serial-detection: unable to read port info', error);
    }

    const usbVendorId = normalizeUsbId(info.usbVendorId);
    const usbProductId = normalizeUsbId(info.usbProductId);

    const signature = matchUsbSignature(usbVendorId, usbProductId);

    const chipFamily = signature?.chipFamily || null;
    const chipName = signature?.chipName || chipFamily || null;
    const identifier = signature?.identifier || null;

    return {
        index,
        usbVendorId,
        usbProductId,
        usbVendorIdHex: formatUsbHex(usbVendorId),
        usbProductIdHex: formatUsbHex(usbProductId),
        chipFamily,
        chipName,
        identifier
    };
}

function buildDetectionSummary(ports) {
    const families = ports
        .map(port => port.chipFamily)
        .filter(Boolean);

    const uniqueFamilies = [...new Set(families.map(family => family.trim()))];
    const primaryFamily = uniqueFamilies[0] || null;

    return {
        primaryFamily,
        uniqueFamilies
    };
}

export async function detectSerialDevices({ promptUser = false } = {}) {
    const support = typeof navigator !== 'undefined' && navigator && 'serial' in navigator;
    if (!support) {
        return {
            supported: false,
            ports: [],
            chipFamily: null,
            chipFamilies: [],
            error: 'Web Serial API is not available in this browser.'
        };
    }

    const { serial } = navigator;
    let ports = [];
    let requestError = null;
    let requestedPort = null;

    try {
        if (typeof serial.getPorts === 'function') {
            ports = await serial.getPorts();
        }
    } catch (error) {
        console.error('serial-detection: getPorts failed', error);
        return {
            supported: true,
            ports: [],
            chipFamily: null,
            chipFamilies: [],
            error: error instanceof Error ? error.message : String(error)
        };
    }

    if (ports.length === 0 && promptUser && typeof serial.requestPort === 'function') {
        try {
            requestedPort = await serial.requestPort();
            if (requestedPort) {
                ports = [requestedPort];
            }
        } catch (error) {
            requestError = error instanceof Error ? error.message : String(error);
        }
    }

    const portDetails = Array.isArray(ports)
        ? ports.map((port, index) => describePort(port, index))
        : [];

    const { primaryFamily, uniqueFamilies } = buildDetectionSummary(portDetails);

    return {
        supported: true,
        ports: portDetails,
        requestedPort: Boolean(requestedPort),
        requestError,
        chipFamily: primaryFamily,
        chipFamilies: uniqueFamilies,
        error: null,
        timestamp: Date.now()
    };
}

export function formatPortSummary(portDetail) {
    if (!portDetail) {
        return '';
    }

    const parts = [];

    if (portDetail.chipName) {
        parts.push(portDetail.chipName);
    } else if (portDetail.chipFamily) {
        parts.push(portDetail.chipFamily);
    }

    if (portDetail.usbVendorIdHex || portDetail.usbProductIdHex) {
        const usbParts = [];
        if (portDetail.usbVendorIdHex) {
            usbParts.push(`VID ${portDetail.usbVendorIdHex}`);
        }
        if (portDetail.usbProductIdHex) {
            usbParts.push(`PID ${portDetail.usbProductIdHex}`);
        }
        if (usbParts.length) {
            parts.push(usbParts.join(' / '));
        }
    }

    if (!parts.length) {
        if (portDetail.usbVendorIdHex || portDetail.usbProductIdHex) {
            return [portDetail.usbVendorIdHex, portDetail.usbProductIdHex].filter(Boolean).join(' • ');
        }
        return 'Unknown device';
    }

    return parts.join(' • ');
}

export function normalizeChipFamilyLabel(label) {
    if (!label) {
        return '';
    }

    return label
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

export function isChipFamilyCompatible(detectedFamily, expectedFamily) {
    const detected = normalizeChipFamilyLabel(detectedFamily);
    const expected = normalizeChipFamilyLabel(expectedFamily);

    if (!detected || !expected) {
        return true;
    }

    if (detected === expected) {
        return true;
    }

    if (detected === 'esp32' && expected.startsWith('esp32')) {
        return true;
    }

    if (expected === 'esp32' && detected.startsWith('esp32')) {
        return true;
    }

    return false;
}
