import { detectCapabilities } from './capabilities.js';
import { renderCapabilityBar } from './ui-capability-bar.js';

function createCapabilityNote(stepHeading) {
    const note = document.createElement('div');
    note.className = 'capability-note';
    note.setAttribute('role', 'alert');
    note.setAttribute('aria-live', 'assertive');

    const message = document.createElement('p');
    message.innerHTML = `Web Serial is not available in this browser. For the best experience, switch to <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">Google Chrome</a> or <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer">Microsoft Edge</a>.`;

    const actions = document.createElement('div');
    actions.className = 'capability-note__actions';

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'capability-note__dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss browser support guidance');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', () => {
        note.remove();
        if (stepHeading) {
            stepHeading.focus();
        }
    });

    actions.appendChild(dismissBtn);

    note.appendChild(message);
    note.appendChild(actions);

    return note;
}

document.addEventListener('DOMContentLoaded', () => {
    const step = document.getElementById('step-4');
    if (!step) {
        return;
    }

    const capabilities = detectCapabilities();
    const heading = step.querySelector('h2');

    const capabilityBar = renderCapabilityBar(capabilities);

    if (heading) {
        if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
            heading.addEventListener('blur', () => {
                heading.removeAttribute('tabindex');
            }, { once: true });
        }
        step.insertBefore(capabilityBar, heading.nextSibling);
    } else {
        step.insertBefore(capabilityBar, step.firstChild);
    }

    if (!capabilities.webSerial) {
        const warning = createCapabilityNote(heading);
        step.insertBefore(warning, capabilityBar.nextSibling);
    }
});
