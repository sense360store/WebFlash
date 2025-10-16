const TROUBLESHOOT_FAQS = [
    {
        id: 'no-ports-listed',
        title: 'No ports listed',
        items: [
            'Use a known-good USB-C data cable. Charge-only cables will not expose the serial port.',
            'Close other serial or flashing tools (Arduino IDE, esptool, screen, etc.) before scanning for devices.',
            'On Linux, add your user to the <code>dialout</code> group or run your browser with the needed permissions.'
        ]
    },
    {
        id: 'enter-boot-mode',
        title: 'Enter boot mode',
        items: [
            'Hold the <strong>BOOT</strong> button, press and release <strong>RESET</strong>, then release <strong>BOOT</strong> to place the hub into flashing mode.'
        ]
    },
    {
        id: 'flashing-errors',
        title: 'Flashing errors',
        items: [
            'Erase the device first if flashing fails repeatedly, then try the install again.',
            'Use a short, stable USB cable and avoid hubs or long extenders.',
            'If the download stalls with a CORS error, refresh the page and ensure no extensions are blocking the request.'
        ]
    }
];

function createAccordionItem({ id, title, items }) {
    const item = document.createElement('div');
    item.className = 'accordion-item';

    const buttonId = `accordion-trigger-${id}`;
    const panelId = `accordion-panel-${id}`;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'accordion-trigger';
    trigger.id = buttonId;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panelId);
    trigger.textContent = title;

    const panel = document.createElement('div');
    panel.className = 'accordion-panel';
    panel.id = panelId;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', buttonId);
    panel.hidden = true;

    const list = document.createElement('ul');
    items.forEach(itemText => {
        const listItem = document.createElement('li');
        listItem.innerHTML = itemText;
        list.appendChild(listItem);
    });

    panel.appendChild(list);

    trigger.addEventListener('click', () => {
        const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', String(!isExpanded));
        panel.hidden = isExpanded;
    });

    item.appendChild(trigger);
    item.appendChild(panel);

    return item;
}

function renderTroubleshootAccordion() {
    const checklist = document.querySelector('.pre-flash-checklist');
    if (!checklist) {
        return;
    }

    const accordion = document.createElement('section');
    accordion.className = 'troubleshoot-accordion';
    accordion.setAttribute('aria-label', 'Troubleshooting FAQs');

    const heading = document.createElement('h4');
    heading.className = 'troubleshoot-accordion__title';
    heading.textContent = 'Troubleshooting FAQs';
    accordion.appendChild(heading);

    TROUBLESHOOT_FAQS.forEach(item => {
        accordion.appendChild(createAccordionItem(item));
    });

    checklist.insertAdjacentElement('afterend', accordion);
}

document.addEventListener('DOMContentLoaded', renderTroubleshootAccordion);
