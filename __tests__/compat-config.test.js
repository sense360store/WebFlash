import { jest } from '@jest/globals';

describe('compat-config direct install validation', () => {
  let originalFetch;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="wizard-main">
        <div class="existing-child">Existing</div>
      </div>
    `;
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    window.history.replaceState(null, '', '?power=usb');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    global.fetch = originalFetch;
  });

  test('renders required parameter guidance for malformed links', async () => {
    const module = await import('../scripts/compat-config.js');
    await module.initializeCompatInstall();

    const container = document.getElementById('compat-config-installer');
    expect(container).not.toBeNull();

    const title = container.querySelector('.compat-config-title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('Direct Install');

    const requiredParams = Array.from(
      container.querySelectorAll('.compat-config-required-params li')
    ).map((item) => item.textContent);

    expect(requiredParams).toEqual(expect.arrayContaining(['mount', 'power']));
    expect(container.textContent).toContain('Check mount/power query parameters');
    expect(global.fetch).not.toHaveBeenCalled();

    const wizardMain = document.querySelector('.wizard-main');
    expect(wizardMain.firstElementChild).toBe(container);
  });
});
