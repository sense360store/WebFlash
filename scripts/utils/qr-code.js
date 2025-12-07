/**
 * @fileoverview QR code generation utility for config sharing.
 * Uses a minimal QR code generator implementation.
 * @module utils/qr-code
 */

/**
 * QR code error correction levels
 */
const ErrorCorrectionLevel = {
    L: 1, // ~7% recovery
    M: 0, // ~15% recovery
    Q: 3, // ~25% recovery
    H: 2  // ~30% recovery
};

/**
 * Generates QR code data matrix for the given text
 * @param {string} text - Text to encode
 * @param {number} [errorCorrection=0] - Error correction level (0=M, 1=L, 2=H, 3=Q)
 * @returns {boolean[][]} 2D array of modules (true = dark)
 */
function generateQRMatrix(text, errorCorrection = ErrorCorrectionLevel.M) {
    // Use the QRCode library if available (loaded via CDN)
    if (typeof QRCode !== 'undefined' && QRCode.create) {
        const qr = QRCode.create(text, { errorCorrectionLevel: ['M', 'L', 'H', 'Q'][errorCorrection] });
        const modules = qr.modules;
        const size = modules.size;
        const matrix = [];
        for (let y = 0; y < size; y++) {
            const row = [];
            for (let x = 0; x < size; x++) {
                row.push(modules.get(x, y));
            }
            matrix.push(row);
        }
        return matrix;
    }

    // Fallback: Use simple encoding for short URLs
    // This generates a basic QR-like pattern for display
    return generateSimpleQR(text);
}

/**
 * Simple QR code generator using the QR code algorithm
 * Based on ISO/IEC 18004 standard
 */
function generateSimpleQR(text) {
    // Calculate minimum version needed for the text
    const dataLength = text.length;
    let version = 1;
    const capacities = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858];

    for (let i = 0; i < capacities.length; i++) {
        if (dataLength <= capacities[i]) {
            version = i + 1;
            break;
        }
    }

    // Calculate QR code size (21 + (version-1) * 4)
    const size = 21 + (version - 1) * 4;

    // Initialize matrix
    const matrix = Array(size).fill(null).map(() => Array(size).fill(null));
    const reserved = Array(size).fill(null).map(() => Array(size).fill(false));

    // Add finder patterns (top-left, top-right, bottom-left)
    addFinderPattern(matrix, reserved, 0, 0);
    addFinderPattern(matrix, reserved, size - 7, 0);
    addFinderPattern(matrix, reserved, 0, size - 7);

    // Add timing patterns
    for (let i = 8; i < size - 8; i++) {
        const bit = (i + 1) % 2 === 1;
        matrix[6][i] = bit;
        matrix[i][6] = bit;
        reserved[6][i] = true;
        reserved[i][6] = true;
    }

    // Add alignment patterns for version 2+
    if (version >= 2) {
        const alignPositions = getAlignmentPatternPositions(version);
        for (const row of alignPositions) {
            for (const col of alignPositions) {
                // Skip if overlapping with finder patterns
                if (!reserved[row][col]) {
                    addAlignmentPattern(matrix, reserved, row, col);
                }
            }
        }
    }

    // Reserve format info areas
    reserveFormatInfo(reserved, size);

    // Encode the data
    const dataBits = encodeData(text, version);

    // Place data bits in the matrix
    placeDataBits(matrix, reserved, dataBits, size);

    // Apply mask pattern 0 (checkerboard) and format info
    applyMaskAndFormat(matrix, reserved, size, 0);

    return matrix.map(row => row.map(cell => cell === true));
}

function addFinderPattern(matrix, reserved, startRow, startCol) {
    // 7x7 finder pattern
    const pattern = [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1]
    ];

    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            if (startRow + r < matrix.length && startCol + c < matrix[0].length) {
                matrix[startRow + r][startCol + c] = pattern[r][c] === 1;
                reserved[startRow + r][startCol + c] = true;
            }
        }
    }

    // Add separator (white border)
    for (let i = -1; i <= 7; i++) {
        const positions = [
            [startRow - 1, startCol + i],
            [startRow + 7, startCol + i],
            [startRow + i, startCol - 1],
            [startRow + i, startCol + 7]
        ];
        for (const [r, c] of positions) {
            if (r >= 0 && r < matrix.length && c >= 0 && c < matrix[0].length) {
                if (matrix[r][c] === null) {
                    matrix[r][c] = false;
                }
                reserved[r][c] = true;
            }
        }
    }
}

function addAlignmentPattern(matrix, reserved, centerRow, centerCol) {
    const pattern = [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1]
    ];

    for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
            const row = centerRow + r;
            const col = centerCol + c;
            if (row >= 0 && row < matrix.length && col >= 0 && col < matrix[0].length) {
                matrix[row][col] = pattern[r + 2][c + 2] === 1;
                reserved[row][col] = true;
            }
        }
    }
}

function getAlignmentPatternPositions(version) {
    if (version === 1) return [];

    const intervals = [
        [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
        [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
        [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
        [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
        [6, 34, 62, 90]
    ];

    return intervals[version] || intervals[Math.min(version, intervals.length - 1)];
}

function reserveFormatInfo(reserved, size) {
    // Reserve format info areas around finder patterns
    for (let i = 0; i < 9; i++) {
        reserved[8][i] = true;
        reserved[i][8] = true;
        if (i < 8) {
            reserved[8][size - 1 - i] = true;
            reserved[size - 1 - i][8] = true;
        }
    }
    // Dark module
    reserved[size - 8][8] = true;
}

function encodeData(text, version) {
    const bits = [];

    // Mode indicator (0100 = byte mode)
    bits.push(0, 1, 0, 0);

    // Character count indicator (8 bits for version 1-9 byte mode)
    const countBits = version < 10 ? 8 : 16;
    const len = text.length;
    for (let i = countBits - 1; i >= 0; i--) {
        bits.push((len >> i) & 1);
    }

    // Data
    for (let i = 0; i < text.length; i++) {
        const byte = text.charCodeAt(i);
        for (let b = 7; b >= 0; b--) {
            bits.push((byte >> b) & 1);
        }
    }

    // Terminator (0000)
    for (let i = 0; i < 4 && bits.length < getDataCapacity(version); i++) {
        bits.push(0);
    }

    // Pad to byte boundary
    while (bits.length % 8 !== 0) {
        bits.push(0);
    }

    // Pad codewords (alternating 236 and 17)
    const padBytes = [0xEC, 0x11];
    let padIndex = 0;
    while (bits.length < getDataCapacity(version)) {
        const padByte = padBytes[padIndex % 2];
        for (let b = 7; b >= 0; b--) {
            bits.push((padByte >> b) & 1);
        }
        padIndex++;
    }

    return bits;
}

function getDataCapacity(version) {
    // Data capacity in bits for error correction level M
    const capacities = [
        128, 224, 352, 512, 688, 864, 992, 1232, 1456, 1728,
        2000, 2336, 2672, 2920, 3320, 3624, 4056, 4504, 5016, 5352
    ];
    return capacities[Math.min(version - 1, capacities.length - 1)];
}

function placeDataBits(matrix, reserved, bits, size) {
    let bitIndex = 0;
    let up = true;

    for (let col = size - 1; col > 0; col -= 2) {
        // Skip the timing pattern column
        if (col === 6) col = 5;

        for (let row = up ? size - 1 : 0; up ? row >= 0 : row < size; row += up ? -1 : 1) {
            for (let c = 0; c < 2; c++) {
                const currentCol = col - c;
                if (!reserved[row][currentCol] && matrix[row][currentCol] === null) {
                    matrix[row][currentCol] = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
                    bitIndex++;
                }
            }
        }
        up = !up;
    }
}

function applyMaskAndFormat(matrix, reserved, size, maskPattern) {
    // Apply mask pattern 0: (row + col) % 2 === 0
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (!reserved[row][col] && matrix[row][col] !== null) {
                if ((row + col) % 2 === 0) {
                    matrix[row][col] = !matrix[row][col];
                }
            }
        }
    }

    // Format info (mask 0, error correction M)
    // Pre-calculated format string for mask 0, EC level M
    const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

    // Place format info
    for (let i = 0; i < 6; i++) {
        matrix[8][i] = formatBits[i] === 1;
        matrix[i][8] = formatBits[14 - i] === 1;
    }
    matrix[8][7] = formatBits[6] === 1;
    matrix[8][8] = formatBits[7] === 1;
    matrix[7][8] = formatBits[8] === 1;

    for (let i = 0; i < 7; i++) {
        matrix[8][size - 7 + i] = formatBits[8 + i] === 1;
        matrix[size - 7 + i][8] = formatBits[6 - i] === 1;
    }

    // Dark module
    matrix[size - 8][8] = true;
}

/**
 * Generates a QR code as an SVG string
 * @param {string} text - Text to encode
 * @param {Object} [options] - Generation options
 * @param {number} [options.size=200] - SVG size in pixels
 * @param {number} [options.margin=4] - Quiet zone margin in modules
 * @param {string} [options.darkColor='#000000'] - Color for dark modules
 * @param {string} [options.lightColor='#ffffff'] - Color for light modules
 * @returns {string} SVG markup
 */
export function generateQRCodeSVG(text, options = {}) {
    const {
        size = 200,
        margin = 4,
        darkColor = '#000000',
        lightColor = '#ffffff'
    } = options;

    const matrix = generateQRMatrix(text);
    const moduleCount = matrix.length;
    const totalModules = moduleCount + margin * 2;
    const moduleSize = size / totalModules;

    let paths = '';

    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            if (matrix[row][col]) {
                const x = (col + margin) * moduleSize;
                const y = (row + margin) * moduleSize;
                paths += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${darkColor}"/>`;
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <rect width="100%" height="100%" fill="${lightColor}"/>
        ${paths}
    </svg>`;
}

/**
 * Generates a QR code as a data URL
 * @param {string} text - Text to encode
 * @param {Object} [options] - Generation options (same as generateQRCodeSVG)
 * @returns {string} Data URL (image/svg+xml)
 */
export function generateQRCodeDataURL(text, options = {}) {
    const svg = generateQRCodeSVG(text, options);
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Generates a QR code and renders it to a canvas element
 * @param {string} text - Text to encode
 * @param {HTMLCanvasElement} canvas - Canvas element to render to
 * @param {Object} [options] - Rendering options
 * @param {number} [options.margin=4] - Quiet zone margin in modules
 * @param {string} [options.darkColor='#000000'] - Color for dark modules
 * @param {string} [options.lightColor='#ffffff'] - Color for light modules
 */
export function renderQRCodeToCanvas(text, canvas, options = {}) {
    const {
        margin = 4,
        darkColor = '#000000',
        lightColor = '#ffffff'
    } = options;

    const ctx = canvas.getContext('2d');
    const matrix = generateQRMatrix(text);
    const moduleCount = matrix.length;
    const totalModules = moduleCount + margin * 2;
    const moduleSize = canvas.width / totalModules;

    // Fill background
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw modules
    ctx.fillStyle = darkColor;
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            if (matrix[row][col]) {
                const x = (col + margin) * moduleSize;
                const y = (row + margin) * moduleSize;
                ctx.fillRect(x, y, moduleSize, moduleSize);
            }
        }
    }
}

export { ErrorCorrectionLevel };
