/**
 * Screenshot capture utilities for app store submissions
 */

import { device } from 'detox';
import * as fs from 'fs';
import type { Locale } from './screenshot-config';

/**
 * Take a screenshot and save it to the specified path
 * @param filename - Filename for the screenshot
 * @param outputDir - Output directory path
 */
export async function takeScreenshot(filename: string, outputDir: string): Promise<void> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    await device.takeScreenshot(filename.replace('.png', ''));
    // Detox saves screenshots to artifacts directory by default
    // We'll handle moving them in the script
  } catch (error) {
    console.error(`Failed to take screenshot ${filename}:`, error);
    throw error;
  }
}

/**
 * Wait for element to be visible before taking screenshot
 * @param element - Detox element matcher
 * @param filename - Screenshot filename
 * @param outputDir - Output directory
 * @param timeout - Timeout in milliseconds
 */
export async function waitForElementAndScreenshot(
  element: Detox.NativeElement,
  filename: string,
  outputDir: string,
  timeout = 5000,
): Promise<void> {
  await waitFor(element).toBeVisible().withTimeout(timeout);
  await takeScreenshot(filename, outputDir);
}

/**
 * Change app language for screenshot capture
 * @param locale - Target locale (hy, ru, en)
 */
export async function setAppLocale(locale: Locale): Promise<void> {
  // For iOS, we can use device settings
  if (device.getPlatform() === 'ios') {
    await device.setURLBlacklist(['.*']);
    await device.launchApp({
      languageAndLocale: {
        language: locale,
        locale: locale === 'hy' ? 'hy_AM' : locale === 'ru' ? 'ru_RU' : 'en_US',
      },
    });
  } else {
    // For Android, we might need to use app settings
    await device.launchApp({
      languageAndLocale: {
        language: locale,
        locale: locale === 'hy' ? 'hy_AM' : locale === 'ru' ? 'ru_RU' : 'en_US',
      },
    });
  }
}

/**
 * Wait for specified duration
 * @param ms - Duration in milliseconds
 */
export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Setup mock data for consistent screenshots
 */
export async function setupMockData(): Promise<void> {
  // This would normally interact with the app to set up consistent test data
  // For now, we'll just ensure the app is in a clean state
  await device.clearKeychain();
}

/**
 * Hide status bar and UI elements for cleaner screenshots
 */
export async function hideSystemUI(): Promise<void> {
  if (device.getPlatform() === 'ios') {
    // iOS simulators can hide status bar via settings
    try {
      await device.setStatusBar({
        time: '9:41 AM',
        dataNetwork: 'wifi',
        wifiMode: 'active',
        wifiBars: '3',
        cellularMode: 'active',
        cellularBars: '4',
        batteryState: 'charged',
        batteryLevel: '100',
      });
    } catch (error) {
      console.warn('Could not set status bar:', error);
    }
  }
}
