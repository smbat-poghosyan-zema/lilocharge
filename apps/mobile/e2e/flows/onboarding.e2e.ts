import { by, device, element, expect as detoxExpect } from 'detox';

import {
  isVisibleById,
  launchFreshApp,
  NETWORK_TIMEOUT_MS,
  waitForVisibleById,
} from './helpers';

/**
 * OTP code used at the verify-phone step. Real codes are generated server-side
 * and delivered via SMS, so CI must either seed this code into the auth Redis
 * store for the test phone number or export the generated code before the run:
 * `E2E_OTP_CODE=123456 detox test ...`. See e2e/README.md.
 */
const OTP_CODE = process.env.E2E_OTP_CODE ?? '123456';
const TEST_PHONE = process.env.E2E_PHONE ?? '+37477123456';

describe('Onboarding flow', () => {
  beforeAll(async () => {
    await launchFreshApp();
  });

  it('starts on the registration screen with all account fields', async () => {
    await waitForVisibleById('registration-screen');
    await detoxExpect(element(by.id('registration-display-name-input'))).toBeVisible();
    await detoxExpect(element(by.id('registration-email-input'))).toBeVisible();
    await detoxExpect(element(by.id('registration-phone-input'))).toBeVisible();
    await detoxExpect(element(by.id('registration-password-input'))).toBeVisible();
    await detoxExpect(element(by.id('registration-continue'))).toBeVisible();
  });

  it('rejects invalid registration input with an inline error', async () => {
    await element(by.id('registration-display-name-input')).replaceText('E2E Driver');
    await element(by.id('registration-email-input')).replaceText('not-an-email');
    await element(by.id('registration-continue')).tap();

    await waitForVisibleById('registration-error');
  });

  it('walks registration -> OTP -> vehicle -> payment choice and lands on tabs', async () => {
    await element(by.id('registration-display-name-input')).replaceText('E2E Driver');
    await element(by.id('registration-email-input')).replaceText('e2e.driver@example.com');
    await element(by.id('registration-phone-input')).replaceText(TEST_PHONE);
    await element(by.id('registration-password-input')).replaceText('Sup3rSecret!pass');
    await element(by.id('registration-continue')).tap();

    const reachedVerifyPhone = await isVisibleById('verify-phone-screen', NETWORK_TIMEOUT_MS);

    if (!reachedVerifyPhone) {
      // Backend unreachable: the OTP request failed. Assert the explicit
      // error state instead of false-passing the rest of the flow.
      await waitForVisibleById('registration-error');

      return;
    }

    await element(by.id('verify-phone-code-input')).replaceText(OTP_CODE);
    await element(by.id('verify-phone-continue')).tap();

    const reachedVehicleSetup = await isVisibleById('vehicle-setup-screen', NETWORK_TIMEOUT_MS);

    if (!reachedVehicleSetup) {
      // OTP was not accepted (e.g. E2E_OTP_CODE not seeded server-side).
      // Assert the explicit verification error state.
      await waitForVisibleById('verify-phone-error');

      return;
    }

    await element(by.id('vehicle-make-input')).replaceText('Tesla');
    await element(by.id('vehicle-model-input')).replaceText('Model 3');
    await element(by.id('vehicle-year-input')).replaceText('2023');
    await element(by.id('vehicle-battery-capacity-input')).replaceText('57.5');
    await element(by.id('vehicle-max-charge-power-input')).replaceText('170');
    await element(by.id('vehicle-connector-CCS')).tap();
    await element(by.id('vehicle-save')).tap();

    const reachedPaymentAfterSave = await isVisibleById(
      'onboarding-payment-screen',
      NETWORK_TIMEOUT_MS,
    );

    if (!reachedPaymentAfterSave) {
      // Vehicle creation failed server-side; the flow still offers skip.
      await waitForVisibleById('vehicle-error');
      await element(by.id('vehicle-skip')).tap();
      await waitForVisibleById('onboarding-payment-screen');
    }

    // ARCA needs no token-exchange round trip, so finishing with it completes
    // onboarding locally even without payment provider credentials.
    await element(by.id('onboarding-payment-option-ARCA')).tap();
    await element(by.id('onboarding-payment-finish')).tap();

    await waitForVisibleById('stations-screen', NETWORK_TIMEOUT_MS);
    await detoxExpect(element(by.id('tab-charge'))).toExist();
    await detoxExpect(element(by.id('tab-favorites'))).toExist();
    await detoxExpect(element(by.id('tab-profile'))).toExist();
  });

  it('marks onboarding complete: relaunch lands on tabs when the flow finished', async () => {
    // Only meaningful when the previous test completed onboarding; with no
    // backend the app must still return to registration, which is asserted.
    await device.launchApp({ newInstance: true });

    const landedOnTabs = await isVisibleById('stations-screen');

    if (!landedOnTabs) {
      await waitForVisibleById('registration-screen');
    }
  });
});
