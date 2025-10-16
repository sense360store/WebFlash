(function (global) {
    const scope = global || {};
    const stepState = new WeakMap();

    function ensureSupportBundleApi() {
        scope.supportBundle = scope.supportBundle || {};
        if (typeof scope.supportBundle.create === 'function') {
            return scope.supportBundle.create;
        }

        const createSupportBundle = function createSupportBundle(context = {}) {
            const doc = scope.document;
            if (!doc || typeof doc.createElement !== 'function' || !doc.body) {
                return;
            }

            const errorsApi = scope.supportErrors;
            const wizardApi = scope.wizardState;

            const payload = {
                generatedAt: new Date().toISOString(),
                context: {
                    reason: context.reason || 'wizard-step-error',
                    stepId: context.stepId || null,
                    stepNumber: context.stepNumber || null,
                    stepLabel: context.stepLabel || null,
                    location: scope.location ? scope.location.href : null
                },
                wizardState: wizardApi && typeof wizardApi.getState === 'function'
                    ? wizardApi.getState()
                    : null,
                errors: errorsApi && typeof errorsApi.getErrors === 'function'
                    ? errorsApi.getErrors()
                    : []
            };

            if (context.errorEntry) {
                payload.context.error = context.errorEntry;
            }

            if (scope.navigator && scope.navigator.userAgent) {
                payload.userAgent = scope.navigator.userAgent;
            }

            if (typeof Blob === 'undefined' || !scope.URL || typeof scope.URL.createObjectURL !== 'function') {
                return;
            }

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = scope.URL.createObjectURL(blob);
            const link = doc.createElement('a');
            const filename = `support-bundle-${Date.now()}.json`;
            link.href = url;
            link.download = filename;

            doc.body.appendChild(link);
            link.click();
            doc.body.removeChild(link);

            setTimeout(() => scope.URL.revokeObjectURL(url), 0);
        };

        scope.supportBundle.create = createSupportBundle;
        return scope.supportBundle.create;
    }

    function ensureStepContainers(stepElement) {
        if (!stepElement) {
            return null;
        }

        let state = stepState.get(stepElement);
        if (state) {
            return state;
        }

        const doc = scope.document || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.createElement !== 'function') {
            return null;
        }

        const existingContent = stepElement.querySelector('[data-step-content="true"]');
        const existingError = stepElement.querySelector('[data-step-error="true"]');

        if (existingContent && existingError) {
            state = { contentWrapper: existingContent, errorWrapper: existingError };
            stepState.set(stepElement, state);
            return state;
        }

        const contentWrapper = doc.createElement('div');
        contentWrapper.dataset.stepContent = 'true';
        contentWrapper.className = 'wizard-step__content';
        contentWrapper.style.display = 'contents';

        const children = Array.from(stepElement.childNodes);
        children.forEach((child) => {
            if (child === contentWrapper) {
                return;
            }
            contentWrapper.appendChild(child);
        });

        const errorWrapper = doc.createElement('div');
        errorWrapper.dataset.stepError = 'true';
        errorWrapper.className = 'wizard-step__error';
        errorWrapper.hidden = true;
        errorWrapper.setAttribute('role', 'alert');
        errorWrapper.setAttribute('aria-live', 'assertive');

        stepElement.appendChild(contentWrapper);
        stepElement.appendChild(errorWrapper);

        state = { contentWrapper, errorWrapper };
        stepState.set(stepElement, state);
        return state;
    }

    function escapeHtml(value) {
        if (value == null) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getStepLabel(stepElement, stepNumber) {
        const heading = stepElement ? stepElement.querySelector('h2') : null;
        if (heading && heading.textContent) {
            return heading.textContent.trim();
        }
        if (typeof stepNumber === 'number' && Number.isFinite(stepNumber)) {
            return `Step ${stepNumber}`;
        }
        return 'this step';
    }

    function showError(state, context) {
        const { stepElement, stepNumber } = context;
        const stepLabel = getStepLabel(stepElement, stepNumber);
        const errorEntry = context.errorEntry || {};
        const message = errorEntry.message || 'Unexpected error';
        const stack = errorEntry.stack || '';

        state.contentWrapper.hidden = true;
        state.contentWrapper.setAttribute('aria-hidden', 'true');

        state.errorWrapper.hidden = false;
        state.errorWrapper.innerHTML = `
            <div class="firmware-error" data-boundary-error>
                <h4>We hit a snag</h4>
                <p>Something went wrong while loading <strong>${escapeHtml(stepLabel)}</strong>. Try refreshing the page. If the problem continues, create a support bundle and share it with our team.</p>
                <button type="button" class="btn btn-primary" data-action="create-support-bundle">Create Support Bundle</button>
                <details class="error-details">
                    <summary>Technical details</summary>
                    <pre class="error-stack">${escapeHtml(stack ? `${message}\n${stack}` : message)}</pre>
                </details>
            </div>
        `;

        const actionButton = state.errorWrapper.querySelector('[data-action="create-support-bundle"]');
        if (actionButton) {
            const createBundle = ensureSupportBundleApi();
            actionButton.addEventListener('click', () => {
                createBundle({
                    reason: 'wizard-step-error',
                    stepId: context.stepId,
                    stepNumber: context.stepNumber,
                    stepLabel,
                    errorEntry
                });
            });
        }
    }

    function hideError(state) {
        if (!state) {
            return;
        }
        state.contentWrapper.hidden = false;
        state.contentWrapper.setAttribute('aria-hidden', 'false');
        state.errorWrapper.hidden = true;
        state.errorWrapper.innerHTML = '';
    }

    function normaliseError(error) {
        if (!error) {
            return {
                message: 'Unexpected error',
                stack: ''
            };
        }

        const message = typeof error.message === 'string' && error.message.trim().length
            ? error.message
            : String(error);

        const stack = typeof error.stack === 'string' ? error.stack : '';

        return { message, stack };
    }

    function render(stepElement, options = {}) {
        const renderFn = typeof options.render === 'function' ? options.render : null;
        const stepId = options.stepId || (stepElement && stepElement.id) || null;
        const stepNumber = options.stepNumber != null ? Number(options.stepNumber) : null;

        const state = ensureStepContainers(stepElement);
        if (!state) {
            if (renderFn) {
                try {
                    renderFn();
                } catch (error) {
                    console.error('[wizard] Step render failed', error);
                }
            }
            return { ok: false, skipped: true };
        }

        hideError(state);

        if (!renderFn) {
            return { ok: true };
        }

        try {
            renderFn(state.contentWrapper, stepElement);
            return { ok: true };
        } catch (error) {
            console.error('[wizard] Step render failed', error);
            const info = normaliseError(error);
            if (scope.supportErrors && typeof scope.supportErrors.logError === 'function') {
                info.stepId = stepId;
                if (stepNumber != null) {
                    info.stepNumber = stepNumber;
                }
                const entry = scope.supportErrors.logError(info);
                showError(state, { stepElement, stepNumber, stepId, errorEntry: entry });
                return { ok: false, error };
            }

            showError(state, { stepElement, stepNumber, stepId, errorEntry: info });
            return { ok: false, error };
        }
    }

    scope.supportBoundary = scope.supportBoundary || {};
    scope.supportBoundary.render = render;
})(typeof window !== 'undefined' ? window : globalThis);
