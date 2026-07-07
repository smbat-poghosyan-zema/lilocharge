/**
 * Tests for screenshot configuration
 */

import {
  IOS_DEVICES,
  ANDROID_DEVICES,
  LOCALES,
  SCREENS,
  getScreenshotOutputDir,
  getScreenshotFilename,
  type Locale,
} from './screenshot-config';

describe('Screenshot Configuration', () => {
  describe('Device Configurations', () => {
    it('should have valid iOS device configurations', () => {
      expect(IOS_DEVICES.length).toBeGreaterThan(0);

      IOS_DEVICES.forEach((device) => {
        expect(device.name).toBeTruthy();
        expect(device.type).toBe('ios');
        expect(device.width).toBeGreaterThan(0);
        expect(device.height).toBeGreaterThan(0);
        expect(device.scale).toBeGreaterThan(0);
        expect(device.deviceName).toBeTruthy();
      });
    });

    it('should have valid Android device configurations', () => {
      expect(ANDROID_DEVICES.length).toBeGreaterThan(0);

      ANDROID_DEVICES.forEach((device) => {
        expect(device.name).toBeTruthy();
        expect(device.type).toBe('android');
        expect(device.width).toBeGreaterThan(0);
        expect(device.height).toBeGreaterThan(0);
        expect(device.scale).toBeGreaterThan(0);
        expect(device.deviceName).toBeTruthy();
      });
    });

    it('should include required iOS devices for App Store', () => {
      const deviceNames = IOS_DEVICES.map((d) => d.name);
      expect(deviceNames).toContain('iPhone 15 Pro Max');
    });

    it('should include required Android devices for Google Play', () => {
      const deviceNames = ANDROID_DEVICES.map((d) => d.name);
      expect(deviceNames).toContain('Pixel 8 Pro');
    });
  });

  describe('Locales', () => {
    it('should support all required locales', () => {
      expect(LOCALES).toContain('hy');
      expect(LOCALES).toContain('ru');
      expect(LOCALES).toContain('en');
    });

    it('should have exactly 3 locales', () => {
      expect(LOCALES.length).toBe(3);
    });
  });

  describe('Screen Definitions', () => {
    it('should have at least 5 screens defined', () => {
      expect(SCREENS.length).toBeGreaterThanOrEqual(5);
    });

    it('should have all required screens', () => {
      const screenIds = SCREENS.map((s) => s.id);
      expect(screenIds).toContain('map');
      expect(screenIds).toContain('charge');
      expect(screenIds).toContain('favorites');
      expect(screenIds).toContain('payment');
      expect(screenIds).toContain('profile');
    });

    it('should keep the payment screen last (it leaves the tab navigator)', () => {
      expect(SCREENS[SCREENS.length - 1]?.id).toBe('payment');
    });

    it('should have valid screen definitions', () => {
      SCREENS.forEach((screen) => {
        expect(screen.id).toBeTruthy();
        expect(screen.name).toBeTruthy();
        expect(screen.readyTestId).toBeTruthy();
        expect(typeof screen.id).toBe('string');
        expect(typeof screen.name).toBe('string');
        expect(typeof screen.readyTestId).toBe('string');

        if (screen.delay !== undefined) {
          expect(screen.delay).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('getScreenshotOutputDir', () => {
    it('should generate correct iOS output directory', () => {
      const result = getScreenshotOutputDir('ios', 'hy');
      expect(result).toBe('store-assets/screenshots/ios/hy');
    });

    it('should generate correct Android output directory', () => {
      const result = getScreenshotOutputDir('android', 'ru');
      expect(result).toBe('store-assets/screenshots/android/ru');
    });

    it('should work for all locales', () => {
      LOCALES.forEach((locale: Locale) => {
        const iosDir = getScreenshotOutputDir('ios', locale);
        const androidDir = getScreenshotOutputDir('android', locale);

        expect(iosDir).toContain(locale);
        expect(androidDir).toContain(locale);
      });
    });
  });

  describe('getScreenshotFilename', () => {
    it('should generate correct filename format', () => {
      const result = getScreenshotFilename('map', 1);
      expect(result).toBe('1_map.png');
    });

    it('should handle different screen IDs', () => {
      const result = getScreenshotFilename('station-details', 2);
      expect(result).toBe('2_station-details.png');
    });

    it('should always use .png extension', () => {
      const result = getScreenshotFilename('test', 3);
      expect(result.endsWith('.png')).toBe(true);
    });

    it('should include index in filename', () => {
      for (let i = 1; i <= 5; i++) {
        const result = getScreenshotFilename('test', i);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        expect(result).toMatch(new RegExp(`^${i.toString()}_`));
      }
    });
  });
});
