export async function copyTextToClipboard(text) {
    const value = text == null ? '' : String(text);

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch (error) {
            // Fallback to execCommand below
        }
    }

    fallbackCopy(value);
}

function fallbackCopy(text) {
    if (typeof document === 'undefined') {
        throw new Error('Clipboard API not available');
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';

    document.body.appendChild(textarea);

    try {
        textarea.select();
        const successful = document.execCommand('copy');
        if (!successful) {
            throw new Error('Unable to copy text using execCommand');
        }
    } finally {
        document.body.removeChild(textarea);
    }
}
