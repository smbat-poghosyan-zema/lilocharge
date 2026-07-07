import { by, element, expect as detoxExpect } from 'detox';

import enCommon from '../../src/i18n/locales/en/common.json';
import hyCommon from '../../src/i18n/locales/hy/common.json';
import {
  completeOnboardingViaSkip,
  isVisibleById,
  openProfileTab,
  returnToProfileTab,
  waitForVisibleById,
} from './helpers';

describe('Profile flow', () => {
  beforeAll(async () => {
    await completeOnboardingViaSkip();
  });

  it('opens the profile tab with the language switcher', async () => {
    await openProfileTab();

    await detoxExpect(element(by.id('profile-language-hy'))).toBeVisible();
    await detoxExpect(element(by.id('profile-language-ru'))).toBeVisible();
    await detoxExpect(element(by.id('profile-language-en'))).toBeVisible();
  });

  it('navigates to payment methods from the profile row', async () => {
    await openProfileTab();
    await element(by.id('profile-payment-methods')).tap();

    // Signed-out bootstrap renders the explicit signed-out state; a
    // signed-in run renders the full payment methods screen.
    const signedOutVisible = await isVisibleById('payment-methods-signed-out');

    if (!signedOutVisible) {
      await waitForVisibleById('payment-methods-screen');
    }

    await returnToProfileTab();
  });

  it('navigates to the wallet from the profile row', async () => {
    await openProfileTab();
    await element(by.id('profile-wallet')).tap();

    const signedOutVisible = await isVisibleById('wallet-signed-out');

    if (!signedOutVisible) {
      await waitForVisibleById('wallet-screen');
    }

    await returnToProfileTab();
  });

  it('switches the UI language and updates visible strings', async () => {
    await openProfileTab();

    // Default language is Armenian.
    await detoxExpect(element(by.text(hyCommon.profile.title))).toBeVisible();

    await element(by.id('profile-language-en')).tap();
    await waitForVisibleById('profile-screen');
    await detoxExpect(element(by.text(enCommon.profile.title))).toBeVisible();
    await detoxExpect(element(by.text(enCommon.profile.language.title))).toBeVisible();

    // Restore the default language so later suites see Armenian strings.
    await element(by.id('profile-language-hy')).tap();
    await detoxExpect(element(by.text(hyCommon.profile.title))).toBeVisible();
  });
});
