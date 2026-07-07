/**
 * Screenshot configuration for app store submissions
 * Defines device sizes and locales for screenshot generation
 */

export interface DeviceConfig {
  name: string;
  type: 'ios' | 'android';
  width: number;
  height: number;
  scale: number;
  deviceName: string;
}

export interface ScreenshotConfig {
  locale: string;
  screens: ScreenDefinition[];
  outputDir: string;
}

export interface ScreenDefinition {
  id: string;
  name: string;
  /**
   * testID that must be visible before the screenshot is taken. Every id
   * listed here must exist in the app source tree (guarded by
   * src/testing/e2e-testid-guard.spec.ts).
   */
  readyTestId: string;
  delay?: number;
}

/**
 * iOS device configurations for App Store screenshots
 */
export const IOS_DEVICES: DeviceConfig[] = [
  {
    name: 'iPhone 15 Pro Max',
    type: 'ios',
    width: 1290,
    height: 2796,
    scale: 3,
    deviceName: 'iPhone 15 Pro Max',
  },
  {
    name: 'iPhone 15 Pro',
    type: 'ios',
    width: 1179,
    height: 2556,
    scale: 3,
    deviceName: 'iPhone 15 Pro',
  },
  {
    name: 'iPad Pro 12.9"',
    type: 'ios',
    width: 2048,
    height: 2732,
    scale: 2,
    deviceName: 'iPad Pro (12.9-inch) (6th generation)',
  },
];

/**
 * Android device configurations for Google Play screenshots
 */
export const ANDROID_DEVICES: DeviceConfig[] = [
  {
    name: 'Pixel 8 Pro',
    type: 'android',
    width: 1344,
    height: 2992,
    scale: 3,
    deviceName: 'Pixel_8_Pro_API_34',
  },
  {
    name: 'Pixel Tablet',
    type: 'android',
    width: 2560,
    height: 1600,
    scale: 2,
    deviceName: 'Pixel_Tablet_API_34',
  },
];

/**
 * Supported locales for screenshots
 */
export const LOCALES = ['hy', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Screen definitions for screenshot capture.
 *
 * These map onto screens that are reachable without a backend: the tab
 * screens plus the payment methods screen pushed from the profile tab.
 * The `payment` entry must stay last — it leaves the tab navigator and the
 * test suite navigates back after capturing it.
 */
export const SCREENS: ScreenDefinition[] = [
  {
    id: 'map',
    name: 'Map with Charging Stations',
    readyTestId: 'stations-screen',
    delay: 2000,
  },
  {
    id: 'charge',
    name: 'Scan to Charge',
    readyTestId: 'scan-screen',
    delay: 1000,
  },
  {
    id: 'favorites',
    name: 'Favorite Stations',
    readyTestId: 'favorites-screen',
    delay: 1000,
  },
  {
    id: 'profile',
    name: 'User Profile',
    readyTestId: 'profile-screen',
    delay: 1000,
  },
  {
    id: 'payment',
    name: 'Payment Methods',
    // Screenshot runs bootstrap a signed-out session, so the signed-out
    // state of the payment methods screen is the anchor element.
    readyTestId: 'payment-methods-signed-out',
    delay: 1000,
  },
];

/**
 * Get output directory for screenshots
 * @param platform - Platform type (ios or android)
 * @param locale - Screenshot locale
 * @returns Output directory path
 */
export function getScreenshotOutputDir(platform: 'ios' | 'android', locale: Locale): string {
  return `store-assets/screenshots/${platform}/${locale}`;
}

/**
 * Get screenshot filename
 * @param screenId - Screen identifier
 * @param index - Screenshot index (1-based)
 * @returns Filename for screenshot
 */
export function getScreenshotFilename(screenId: string, index: number): string {
  return `${index}_${screenId}.png`;
}
