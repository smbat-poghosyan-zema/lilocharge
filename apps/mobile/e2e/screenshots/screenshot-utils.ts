/**
 * Screenshot capture utilities for app store submissions.
 */

import { device } from 'detox';

/**
 * Takes a device screenshot. Detox writes the image into its artifacts
 * directory; scripts/generate-screenshots.sh organizes the output afterwards.
 * @param name - Screenshot name (without extension)
 */
export async function takeScreenshot(name: string): Promise<void> {
  await device.takeScreenshot(name.replace(/\.png$/, ''));
}

/**
 * Wait for the specified duration (used to let map tiles/animations settle).
 * @param ms - Duration in milliseconds
 */
export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalizes the iOS simulator status bar for cleaner screenshots.
 * No-op on Android.
 */
export async function hideSystemUI(): Promise<void> {
  if (device.getPlatform() !== 'ios') {
    return;
  }

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
