/**
 * Screenshot suite for App Store and Google Play submissions.
 *
 * Captures every screen defined in screenshot-config.ts in all supported
 * locales. Only screens that are reachable without a backend are captured:
 * the run bootstraps a signed-out session by skipping onboarding locally and
 * switches languages through the real in-app language switcher.
 */

import { by, device, element } from 'detox';

import {
  completeOnboardingViaSkip,
  openProfileTab,
  returnToProfileTab,
  waitForVisibleById,
} from '../flows/helpers';
import {
  COLOR_SCHEMES,
  getScreenshotFilename,
  LOCALES,
  SCREENS,
  type Locale,
  type ScreenshotColorScheme,
  type ScreenDefinition,
} from './screenshot-config';
import { hideSystemUI, takeScreenshot, wait } from './screenshot-utils';

describe('App store screenshots', () => {
  beforeAll(async () => {
    await completeOnboardingViaSkip();
    await hideSystemUI();
  });

  // UX-P2-04: capture the full color-scheme × locale matrix so both light and dark mode
  // (UX-P2-02) are covered for every locale. Filenames are namespaced `<scheme>_<locale>_…`
  // so the two schemes never overwrite each other.
  COLOR_SCHEMES.forEach((colorScheme) => {
    LOCALES.forEach((locale) => {
      it(`captures screenshots in ${colorScheme} ${locale}`, async () => {
        await setColorScheme(colorScheme);
        await setAppLocale(locale);

        let screenIndex = 1;

        for (const screen of SCREENS) {
          await navigateToScreen(screen);
          await waitForVisibleById(screen.readyTestId);

          if (screen.delay !== undefined) {
            await wait(screen.delay);
          }

          await takeScreenshot(
            `${colorScheme}_${locale}_${getScreenshotFilename(screen.id, screenIndex)}`,
          );

          if (screen.id === 'payment') {
            // The payment methods screen is pushed over the tab navigator.
            await returnToProfileTab();
          }

          screenIndex++;
        }
      });
    });
  });
});

/**
 * Forces the device UI appearance so dark-mode assets can be captured. `setAppearance` is
 * supported on iOS 13+ simulators and Android emulators by Detox; it is guarded so a
 * runner on an unsupported platform still produces the (default light) light-mode pass.
 */
async function setColorScheme(colorScheme: ScreenshotColorScheme): Promise<void> {
  // `setAppearance` exists on the Detox runtime device but is not in the pinned type
  // defs, so it is accessed through a narrowed shape.
  const appearanceDevice = device as unknown as {
    readonly setAppearance?: (scheme: ScreenshotColorScheme) => Promise<void>;
  };

  if (typeof appearanceDevice.setAppearance !== 'function') {
    return;
  }

  try {
    await appearanceDevice.setAppearance(colorScheme);
  } catch (error) {
    console.warn(`Could not set appearance to ${colorScheme}:`, error);
  }
}

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
