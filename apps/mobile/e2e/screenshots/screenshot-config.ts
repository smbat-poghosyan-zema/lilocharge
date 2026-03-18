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
  setup?: () => Promise<void>;
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
 * Screen definitions for screenshot capture
 */
export const SCREENS: ScreenDefinition[] = [
  {
    id: 'map',
    name: 'Map with Charging Stations',
    delay: 2000,
  },
  {
    id: 'station-details',
    name: 'Station Details',
    delay: 1000,
  },
  {
    id: 'charging-active',
    name: 'Active Charging Session',
    delay: 1500,
  },
  {
    id: 'payment',
    name: 'Payment Screen',
    delay: 1000,
  },
  {
    id: 'profile',
    name: 'User Profile',
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
