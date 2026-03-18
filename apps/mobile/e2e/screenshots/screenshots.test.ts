/**
 * Screenshot tests for App Store and Google Play submissions
 * Generates screenshots in all supported locales and device sizes
 */

import { device, element, by, waitFor } from 'detox';
import {
  SCREENS,
  LOCALES,
  getScreenshotOutputDir,
  getScreenshotFilename,
  type Locale,
} from './screenshot-config';
import {
  takeScreenshot,
  setAppLocale,
  wait,
  setupMockData,
  hideSystemUI,
} from './screenshot-utils';

describe('App Store Screenshots', () => {
  beforeAll(async () => {
    await setupMockData();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  /**
   * Generate screenshots for a specific locale
   */
  async function captureScreenshotsForLocale(locale: Locale): Promise<void> {
    const platform = device.getPlatform();
    const outputDir = getScreenshotOutputDir(platform, locale);

    // Set app language
    await setAppLocale(locale);
    await hideSystemUI();

    let screenIndex = 1;

    for (const screen of SCREENS) {
      const filename = getScreenshotFilename(screen.id, screenIndex);

      try {
        switch (screen.id) {
          case 'map':
            await captureMapScreen(filename, outputDir);
            break;

          case 'station-details':
            await captureStationDetailsScreen(filename, outputDir);
            break;

          case 'charging-active':
            await captureChargingActiveScreen(filename, outputDir);
            break;

          case 'payment':
            await capturePaymentScreen(filename, outputDir);
            break;

          case 'profile':
            await captureProfileScreen(filename, outputDir);
            break;

          default:
            console.warn(`Unknown screen: ${screen.id}`);
        }

        if (screen.delay) {
          await wait(screen.delay);
        }

        screenIndex++;
      } catch (error) {
        console.error(`Failed to capture ${screen.name} (${locale}):`, error);
      }
    }
  }

  /**
   * Capture map screen with charging stations
   */
  async function captureMapScreen(filename: string, outputDir: string): Promise<void> {
    // Wait for map to load
    await waitFor(element(by.id('charging-map')))
      .toBeVisible()
      .withTimeout(10000);

    // Wait for markers to render
    await wait(2000);

    await takeScreenshot(filename, outputDir);
  }

  /**
   * Capture station details screen
   */
  async function captureStationDetailsScreen(filename: string, outputDir: string): Promise<void> {
    // Tap on a charging station marker
    await element(by.id('station-marker-1')).tap();

    // Wait for details to appear
    await waitFor(element(by.id('station-details')))
      .toBeVisible()
      .withTimeout(5000);

    await wait(1000);
    await takeScreenshot(filename, outputDir);
  }

  /**
   * Capture active charging session screen
   */
  async function captureChargingActiveScreen(filename: string, outputDir: string): Promise<void> {
    // Navigate to active session (assuming we have mock data)
    await element(by.id('start-charging-button')).tap();

    await waitFor(element(by.id('charging-session-active')))
      .toBeVisible()
      .withTimeout(5000);

    await wait(1500);
    await takeScreenshot(filename, outputDir);
  }

  /**
   * Capture payment screen
   */
  async function capturePaymentScreen(filename: string, outputDir: string): Promise<void> {
    // Navigate to payment methods
    await element(by.id('tab-profile')).tap();
    await element(by.id('payment-methods-button')).tap();

    await waitFor(element(by.id('payment-methods')))
      .toBeVisible()
      .withTimeout(5000);

    await wait(1000);
    await takeScreenshot(filename, outputDir);
  }

  /**
   * Capture user profile screen
   */
  async function captureProfileScreen(filename: string, outputDir: string): Promise<void> {
    await element(by.id('tab-profile')).tap();

    await waitFor(element(by.id('profile-screen')))
      .toBeVisible()
      .withTimeout(5000);

    await wait(1000);
    await takeScreenshot(filename, outputDir);
  }

  // Generate test for each locale
  LOCALES.forEach((locale) => {
    it(`should capture screenshots in ${locale}`, async () => {
      await captureScreenshotsForLocale(locale);
    });
  });
});
