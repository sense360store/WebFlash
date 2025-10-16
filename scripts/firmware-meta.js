(function () {
    const VERSION_PATTERN = /-v([^/]+)\.bin$/i;
    const cache = new Map();

    function parseVersionFromPath(path) {
        if (typeof path !== 'string') {
            return null;
        }
        const match = path.match(VERSION_PATTERN);
        if (match && match[1]) {
            return `v${match[1]}`;
        }
        return null;
    }

    function toHex(value) {
        return value.toString(16).padStart(2, '0');
    }

    class Md5 {
        constructor() {
            this._state = new Uint32Array(4);
            this._buffer = new Uint8Array(64);
            this._bufferLength = 0;
            this._messageLength = 0;
            this.reset();
        }

        reset() {
            this._state[0] = 0x67452301;
            this._state[1] = 0xefcdab89;
            this._state[2] = 0x98badcfe;
            this._state[3] = 0x10325476;
            this._bufferLength = 0;
            this._messageLength = 0;
        }

        append(chunk) {
            if (!(chunk instanceof Uint8Array)) {
                chunk = new Uint8Array(chunk);
            }

            this._messageLength += chunk.length;

            let offset = 0;
            while (offset < chunk.length) {
                const space = 64 - this._bufferLength;
                const inputPortion = chunk.subarray(offset, offset + space);
                this._buffer.set(inputPortion, this._bufferLength);
                this._bufferLength += inputPortion.length;
                offset += inputPortion.length;

                if (this._bufferLength === 64) {
                    this._processBlock(this._buffer);
                    this._bufferLength = 0;
                }
            }
        }

        finish() {
            const buffer = this._buffer;
            let bufferLength = this._bufferLength;

            buffer[bufferLength++] = 0x80;

            if (bufferLength > 56) {
                buffer.fill(0, bufferLength, 64);
                this._processBlock(buffer);
                bufferLength = 0;
            }

            buffer.fill(0, bufferLength, 56);

            const messageBits = this._messageLength * 8;
            const view = new DataView(buffer.buffer);
            view.setUint32(56, messageBits & 0xffffffff, true);
            view.setUint32(60, Math.floor(messageBits / 0x100000000), true);

            this._processBlock(buffer);

            const digest = new Uint8Array(16);
            const digestView = new DataView(digest.buffer);
            digestView.setUint32(0, this._state[0], true);
            digestView.setUint32(4, this._state[1], true);
            digestView.setUint32(8, this._state[2], true);
            digestView.setUint32(12, this._state[3], true);

            this.reset();

            return digest;
        }

        finishHex() {
            const digest = this.finish();
            let hex = '';
            for (let i = 0; i < digest.length; i += 1) {
                hex += toHex(digest[i]);
            }
            return hex;
        }

        _processBlock(chunk) {
            const x = new Uint32Array(16);
            const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            for (let i = 0; i < 16; i += 1) {
                x[i] = view.getUint32(i * 4, true);
            }

            let [a, b, c, d] = this._state;

            const add = (u, v) => (u + v) >>> 0;
            const rotateLeft = (value, amount) => ((value << amount) | (value >>> (32 - amount))) >>> 0;
            const F = (u, v, w) => (u & v) | (~u & w);
            const G = (u, v, w) => (u & w) | (v & ~w);
            const H = (u, v, w) => u ^ v ^ w;
            const I = (u, v, w) => v ^ (u | ~w);

            const FF = (aa, bb, cc, dd, xk, s, ti) => {
                aa = add(aa, add(add(F(bb, cc, dd), xk), ti));
                return add(rotateLeft(aa, s), bb);
            };

            const GG = (aa, bb, cc, dd, xk, s, ti) => {
                aa = add(aa, add(add(G(bb, cc, dd), xk), ti));
                return add(rotateLeft(aa, s), bb);
            };

            const HH = (aa, bb, cc, dd, xk, s, ti) => {
                aa = add(aa, add(add(H(bb, cc, dd), xk), ti));
                return add(rotateLeft(aa, s), bb);
            };

            const II = (aa, bb, cc, dd, xk, s, ti) => {
                aa = add(aa, add(add(I(bb, cc, dd), xk), ti));
                return add(rotateLeft(aa, s), bb);
            };

            // Round 1
            a = FF(a, b, c, d, x[0], 7, 0xd76aa478);
            d = FF(d, a, b, c, x[1], 12, 0xe8c7b756);
            c = FF(c, d, a, b, x[2], 17, 0x242070db);
            b = FF(b, c, d, a, x[3], 22, 0xc1bdceee);
            a = FF(a, b, c, d, x[4], 7, 0xf57c0faf);
            d = FF(d, a, b, c, x[5], 12, 0x4787c62a);
            c = FF(c, d, a, b, x[6], 17, 0xa8304613);
            b = FF(b, c, d, a, x[7], 22, 0xfd469501);
            a = FF(a, b, c, d, x[8], 7, 0x698098d8);
            d = FF(d, a, b, c, x[9], 12, 0x8b44f7af);
            c = FF(c, d, a, b, x[10], 17, 0xffff5bb1);
            b = FF(b, c, d, a, x[11], 22, 0x895cd7be);
            a = FF(a, b, c, d, x[12], 7, 0x6b901122);
            d = FF(d, a, b, c, x[13], 12, 0xfd987193);
            c = FF(c, d, a, b, x[14], 17, 0xa679438e);
            b = FF(b, c, d, a, x[15], 22, 0x49b40821);

            // Round 2
            a = GG(a, b, c, d, x[1], 5, 0xf61e2562);
            d = GG(d, a, b, c, x[6], 9, 0xc040b340);
            c = GG(c, d, a, b, x[11], 14, 0x265e5a51);
            b = GG(b, c, d, a, x[0], 20, 0xe9b6c7aa);
            a = GG(a, b, c, d, x[5], 5, 0xd62f105d);
            d = GG(d, a, b, c, x[10], 9, 0x02441453);
            c = GG(c, d, a, b, x[15], 14, 0xd8a1e681);
            b = GG(b, c, d, a, x[4], 20, 0xe7d3fbc8);
            a = GG(a, b, c, d, x[9], 5, 0x21e1cde6);
            d = GG(d, a, b, c, x[14], 9, 0xc33707d6);
            c = GG(c, d, a, b, x[3], 14, 0xf4d50d87);
            b = GG(b, c, d, a, x[8], 20, 0x455a14ed);
            a = GG(a, b, c, d, x[13], 5, 0xa9e3e905);
            d = GG(d, a, b, c, x[2], 9, 0xfcefa3f8);
            c = GG(c, d, a, b, x[7], 14, 0x676f02d9);
            b = GG(b, c, d, a, x[12], 20, 0x8d2a4c8a);

            // Round 3
            a = HH(a, b, c, d, x[5], 4, 0xfffa3942);
            d = HH(d, a, b, c, x[8], 11, 0x8771f681);
            c = HH(c, d, a, b, x[11], 16, 0x6d9d6122);
            b = HH(b, c, d, a, x[14], 23, 0xfde5380c);
            a = HH(a, b, c, d, x[1], 4, 0xa4beea44);
            d = HH(d, a, b, c, x[4], 11, 0x4bdecfa9);
            c = HH(c, d, a, b, x[7], 16, 0xf6bb4b60);
            b = HH(b, c, d, a, x[10], 23, 0xbebfbc70);
            a = HH(a, b, c, d, x[13], 4, 0x289b7ec6);
            d = HH(d, a, b, c, x[0], 11, 0xeaa127fa);
            c = HH(c, d, a, b, x[3], 16, 0xd4ef3085);
            b = HH(b, c, d, a, x[6], 23, 0x04881d05);
            a = HH(a, b, c, d, x[9], 4, 0xd9d4d039);
            d = HH(d, a, b, c, x[12], 11, 0xe6db99e5);
            c = HH(c, d, a, b, x[15], 16, 0x1fa27cf8);
            b = HH(b, c, d, a, x[2], 23, 0xc4ac5665);

            // Round 4
            a = II(a, b, c, d, x[0], 6, 0xf4292244);
            d = II(d, a, b, c, x[7], 10, 0x432aff97);
            c = II(c, d, a, b, x[14], 15, 0xab9423a7);
            b = II(b, c, d, a, x[5], 21, 0xfc93a039);
            a = II(a, b, c, d, x[12], 6, 0x655b59c3);
            d = II(d, a, b, c, x[3], 10, 0x8f0ccc92);
            c = II(c, d, a, b, x[10], 15, 0xffeff47d);
            b = II(b, c, d, a, x[1], 21, 0x85845dd1);
            a = II(a, b, c, d, x[8], 6, 0x6fa87e4f);
            d = II(d, a, b, c, x[15], 10, 0xfe2ce6e0);
            c = II(c, d, a, b, x[6], 15, 0xa3014314);
            b = II(b, c, d, a, x[13], 21, 0x4e0811a1);
            a = II(a, b, c, d, x[4], 6, 0xf7537e82);
            d = II(d, a, b, c, x[11], 10, 0xbd3af235);
            c = II(c, d, a, b, x[2], 15, 0x2ad7d2bb);
            b = II(b, c, d, a, x[9], 21, 0xeb86d391);

            this._state[0] = add(this._state[0], a);
            this._state[1] = add(this._state[1], b);
            this._state[2] = add(this._state[2], c);
            this._state[3] = add(this._state[3], d);
        }
    }

    async function readStreamToHash(response) {
        const reader = response.body && response.body.getReader ? response.body.getReader() : null;
        const hasher = new Md5();
        let totalBytes = 0;

        if (!reader) {
            const buffer = await response.arrayBuffer();
            const view = new Uint8Array(buffer);
            hasher.append(view);
            totalBytes = view.byteLength;
            return { md5: hasher.finishHex(), sizeBytes: totalBytes };
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (value) {
                hasher.append(value);
                totalBytes += value.length;
            }
        }

        return { md5: hasher.finishHex(), sizeBytes: totalBytes };
    }

    async function fetchFirmwareMeta(assetUrl) {
        if (!assetUrl || typeof assetUrl !== 'string') {
            return { version: null, date: null, sizeBytes: null, md5: null };
        }

        if (cache.has(assetUrl)) {
            return { ...cache.get(assetUrl) };
        }

        const version = parseVersionFromPath(assetUrl);
        let sizeBytes = null;
        let date = null;

        try {
            const headResponse = await fetch(assetUrl, { method: 'HEAD' });
            if (headResponse.ok) {
                const lengthHeader = headResponse.headers.get('content-length');
                if (lengthHeader) {
                    const parsedLength = Number(lengthHeader);
                    if (!Number.isNaN(parsedLength)) {
                        sizeBytes = parsedLength;
                    }
                }
                const lastModified = headResponse.headers.get('last-modified');
                if (lastModified) {
                    const modifiedDate = new Date(lastModified);
                    if (!Number.isNaN(modifiedDate.getTime())) {
                        date = modifiedDate;
                    }
                }
            }
        } catch (error) {
            console.warn('Unable to fetch firmware metadata via HEAD request:', error);
        }

        let md5 = null;
        try {
            const response = await fetch(assetUrl);
            if (!response.ok) {
                throw new Error(`Unexpected response ${response.status}`);
            }
            const { md5: digest, sizeBytes: streamedSize } = await readStreamToHash(response);
            md5 = digest;
            if (sizeBytes == null) {
                sizeBytes = streamedSize;
            }
        } catch (error) {
            console.warn('Unable to compute firmware MD5 hash:', error);
        }

        const result = { version, date, sizeBytes, md5 };
        cache.set(assetUrl, result);
        return { ...result };
    }

    window.fetchFirmwareMeta = fetchFirmwareMeta;
    window.parseFirmwareVersionFromPath = parseVersionFromPath;
})();
