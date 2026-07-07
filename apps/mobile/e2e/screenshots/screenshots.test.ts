/**
 * Screenshot suite for App Store and Google Play submissions.
 *
 * Captures every screen defined in screenshot-config.ts in all supported
 * locales. Only screens that are reachable without a backend are captured:
 * the run bootstraps a signed-out session by skipping onboarding locally and
 * switches languages through the real in-app language switcher.
 */

import { by, element } from 'detox';

import {
  completeOnboardingViaSkip,
  openProfileTab,
  returnToProfileTab,
  waitForVisibleById,
} from '../flows/helpers';
import {
  getScreenshotFilename,
  LOCALES,
  SCREENS,
  type Locale,
  type ScreenDefinition,
} from './screenshot-config';
import { hideSystemUI, takeScreenshot, wait } from './screenshot-utils';

describe('App store screenshots', () => {
  beforeAll(async () => {
    await completeOnboardingViaSkip();
    await hideSystemUI();
  });

  LOCALES.forEach((locale) => {
    it(`captures screenshots in ${locale}`, async () => {
      await setAppLocale(locale);

      let screenIndex = 1;

      for (const screen of SCREENS) {
        await navigateToScreen(screen);
        await waitForVisibleById(screen.readyTestId);

        if (screen.delay !== undefined) {
          await wait(screen.delay);
        }

        await takeScreenshot(`${locale}_${getScreenshotFilename(screen.id, screenIndex)}`);

        if (screen.id === 'payment') {
          // The payment methods screen is pushed over the tab navigator.
          await returnToProfileTab();
        }

        screenIndex++;
      }
    });
  });
});

/**
 * Switches the app UI language through the profile language switcher.
 */
async function setAppLocale(locale: Locale): Promise<void> {
  await openProfileTab();
  await element(by.id(`profile-language-${locale}`)).tap();
}

/**
 * Navigates to the target screenshot screen using real tab bar buttons and
 * profile navigation rows.
 */
async function navigateToScreen(screen: ScreenDefinition): Promise<void> {
  switch (screen.id) {
    case 'map':
      await element(by.id('tab-stations')).tap();
      break;

    case 'charge':
      await element(by.id('tab-charge')).tap();
      break;

    case 'favorites':
      await element(by.id('tab-favorites')).tap();
      break;

    case 'profile':
      await element(by.id('tab-profile')).tap();
      break;

    case 'payment':
      await openProfileTab();
      await element(by.id('profile-payment-methods')).tap();
      break;

    default:
      throw new Error(`Unknown screenshot screen: ${screen.id}`);
  }
}
