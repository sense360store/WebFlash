import { jest } from '@jest/globals';

const setStepMock = jest.fn();
const getStepMock = jest.fn();
const getTotalStepsMock = jest.fn();
const getMaxReachableStepMock = jest.fn();

async function loadNavigationModule() {
    jest.unstable_mockModule('../scripts/state.js', () => ({
        getStep: getStepMock,
        setStep: setStepMock,
        getTotalSteps: getTotalStepsMock,
        getMaxReachableStep: getMaxReachableStepMock
    }));

    return import('../scripts/navigation.js');
}

describe('wizard navigation interactions', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        document.body.innerHTML = '';
        setStepMock.mockClear();
        getStepMock.mockReset();
        getTotalStepsMock.mockReset();
        getMaxReachableStepMock.mockReset();
    });

    test('clicking a reachable progress step updates the wizard step', async () => {
        document.body.innerHTML = `
            <div class="progress-step" data-step="2"></div>
        `;

        getMaxReachableStepMock.mockReturnValue(3);
        await loadNavigationModule();

        const progressStep = document.querySelector('.progress-step');
        progressStep.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(setStepMock).toHaveBeenCalledWith(2, { animate: true });
    });

    test('next and back buttons resolve to adjacent steps', async () => {
        document.body.innerHTML = `
            <button type="button" id="next" data-next></button>
            <button type="button" id="back" data-back></button>
        `;

        getStepMock.mockReturnValue(2);
        getTotalStepsMock.mockReturnValue(4);

        await loadNavigationModule();

        const nextButton = document.getElementById('next');
        nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(setStepMock).toHaveBeenLastCalledWith(3, { animate: true });

        setStepMock.mockClear();
        const backButton = document.getElementById('back');
        backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(setStepMock).toHaveBeenLastCalledWith(1, { animate: true });
    });

    test('initial wizard step is activated on module load when no step is active', async () => {
        document.body.innerHTML = `
            <div id="step-1" class="wizard-step"></div>
            <div id="step-2" class="wizard-step"></div>
        `;

        getTotalStepsMock.mockReturnValue(4);

        await loadNavigationModule();

        expect(setStepMock).toHaveBeenCalledWith(1, { animate: false, skipUrlUpdate: true });
    });

    test('initial wizard step is not set if a step is already active', async () => {
        document.body.innerHTML = `
            <div id="step-1" class="wizard-step"></div>
            <div id="step-2" class="wizard-step is-active"></div>
        `;

        getTotalStepsMock.mockReturnValue(4);

        await loadNavigationModule();

        expect(setStepMock).not.toHaveBeenCalled();
    });
});
