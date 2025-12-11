import { jest } from '@jest/globals';

describe('compat-config direct install validation', () => {
  let originalFetch;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="wizard-main">
        <div class="existing-child">Existing</div>
      </div>
    `;
    originalFetch = global.fetch;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    global.fetch = jest.fn();
    URL.createObjectURL = jest.fn(() => 'blob:mock-manifest');
    URL.revokeObjectURL = jest.fn();
    window.history.replaceState(null, '', '?');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  test('does not render direct install UI when no parameters provided', async () => {
    window.history.replaceState(null, '', '/');

    const module = await import('../scripts/compat-config.js');
    await module.initializeCompatInstall();

    expect(document.getElementById('compat-config-installer')).toBeNull();
  });

  test('renders required parameter guidance for malformed links', async () => {
    window.history.replaceState(null, '', '?power=usb');
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

    expect(requiredParams).toEqual(expect.arrayContaining(['core', 'mount', 'power']));

    const errorMessages = Array.from(
      container.querySelectorAll('.compat-config-error-messages li')
    ).map((item) => item.textContent.trim());

    expect(errorMessages).toEqual(
      expect.arrayContaining([
        'Missing required parameter: core',
        'Missing required parameter: mount'
      ])
    );

    expect(container.textContent).toContain('Check mount/power query parameters');
    expect(global.fetch).not.toHaveBeenCalled();

    const wizardMain = document.querySelector('.wizard-main');
    expect(wizardMain.firstElementChild).toBe(container);
  });

  test('renders install UI for valid configuration lookup', async () => {
    window.history.replaceState(null, '', '?core=core&mount=wall&power=usb');

    const manifest = {
      builds: [
        {
          config_string: 'Core-Wall-USB',
          core_type: 'Core',
          channel: 'stable',
          file_size: 2048,
          build_date: '2024-01-01T00:00:00Z',
          description: 'Test firmware build',
          parts: [
            {
              path: './firmware/test.bin',
              type: 'firmware'
            }
          ]
        }
      ]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => manifest
    });

    const module = await import('../scripts/compat-config.js');
    await module.initializeCompatInstall();

    expect(global.fetch).toHaveBeenCalledWith('./manifest.json', { cache: 'no-store' });

    const container = document.getElementById('compat-config-installer');
    expect(container).not.toBeNull();
    expect(container.querySelector('.firmware-item')).not.toBeNull();
    expect(container.textContent).toContain('Install Firmware');

    const wizardMain = document.querySelector('.wizard-main');
    expect(wizardMain.firstElementChild).toBe(container);
  });
});
