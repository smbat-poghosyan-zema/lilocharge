/**
 * Tests for store metadata utilities
 */

import * as fs from 'fs';
import * as path from 'path';

const METADATA_DIR = path.join(__dirname, '../../store-assets/metadata');

describe('Store Metadata', () => {
  describe('App Description', () => {
    let appDescription: {
      [key: string]: { hy: string; ru: string; en: string } | Record<string, unknown>;
    };

    beforeAll(() => {
      const filePath = path.join(METADATA_DIR, 'app-description.json');
      expect(fs.existsSync(filePath)).toBe(true);
      appDescription = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        [key: string]: { hy: string; ru: string; en: string } | Record<string, unknown>;
      };
    });

    it('should have all required fields', () => {
      expect(appDescription).toHaveProperty('appName');
      expect(appDescription).toHaveProperty('subtitle');
      expect(appDescription).toHaveProperty('shortDescription');
      expect(appDescription).toHaveProperty('fullDescription');
      expect(appDescription).toHaveProperty('promotionalText');
      expect(appDescription).toHaveProperty('whatsNew');
    });

    it('should have all three locales for each field', () => {
      const fields = [
        'appName',
        'subtitle',
        'shortDescription',
        'fullDescription',
        'promotionalText',
      ];

      fields.forEach((field) => {
        const fieldData = appDescription[field] as Record<string, string>;
        expect(fieldData).toHaveProperty('hy');
        expect(fieldData).toHaveProperty('ru');
        expect(fieldData).toHaveProperty('en');
      });
    });

    it('should have non-empty descriptions', () => {
      const fields = ['appName', 'subtitle', 'shortDescription', 'fullDescription'];

      fields.forEach((field) => {
        const fieldData = appDescription[field] as Record<string, string>;
        expect(fieldData.hy.length).toBeGreaterThan(0);
        expect(fieldData.ru.length).toBeGreaterThan(0);
        expect(fieldData.en.length).toBeGreaterThan(0);
      });
    });

    it('should have short description under 170 characters for iOS', () => {
      const shortDesc = appDescription.shortDescription as Record<string, string>;
      expect(shortDesc.hy.length).toBeLessThanOrEqual(170);
      expect(shortDesc.ru.length).toBeLessThanOrEqual(170);
      expect(shortDesc.en.length).toBeLessThanOrEqual(170);
    });

    it('should have full description under 4000 characters', () => {
      const fullDesc = appDescription.fullDescription as Record<string, string>;
      expect(fullDesc.hy.length).toBeLessThanOrEqual(4000);
      expect(fullDesc.ru.length).toBeLessThanOrEqual(4000);
      expect(fullDesc.en.length).toBeLessThanOrEqual(4000);
    });
  });

  describe('Keywords', () => {
    let keywords: {
      iosKeywords: { hy: string; ru: string; en: string };
      androidKeywords: { hy: string; ru: string; en: string };
      category: Record<string, string>;
      contentRating: Record<string, string>;
    };

    beforeAll(() => {
      const filePath = path.join(METADATA_DIR, 'keywords.json');
      expect(fs.existsSync(filePath)).toBe(true);
      keywords = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        iosKeywords: { hy: string; ru: string; en: string };
        androidKeywords: { hy: string; ru: string; en: string };
        category: Record<string, string>;
        contentRating: Record<string, string>;
      };
    });

    it('should have iOS and Android keywords', () => {
      expect(keywords).toHaveProperty('iosKeywords');
      expect(keywords).toHaveProperty('androidKeywords');
    });

    it('should have all three locales for iOS keywords', () => {
      const iosKeywords = keywords.iosKeywords as Record<string, string>;
      expect(iosKeywords).toHaveProperty('hy');
      expect(iosKeywords).toHaveProperty('ru');
      expect(iosKeywords).toHaveProperty('en');
    });

    it('should have all three locales for Android keywords', () => {
      const androidKeywords = keywords.androidKeywords as Record<string, string>;
      expect(androidKeywords).toHaveProperty('hy');
      expect(androidKeywords).toHaveProperty('ru');
      expect(androidKeywords).toHaveProperty('en');
    });

    it('should have iOS keywords under 100 characters', () => {
      expect(keywords.iosKeywords.hy.length).toBeLessThanOrEqual(100);
      expect(keywords.iosKeywords.ru.length).toBeLessThanOrEqual(100);
      expect(keywords.iosKeywords.en.length).toBeLessThanOrEqual(100);
    });

    it('should have category information', () => {
      expect(keywords.category).toBeTruthy();
      expect(keywords.category.ios).toBeTruthy();
      expect(keywords.category.android).toBeTruthy();
    });

    it('should have content rating', () => {
      expect(keywords.contentRating).toBeTruthy();
      expect(keywords.contentRating.ios).toBeTruthy();
      expect(keywords.contentRating.android).toBeTruthy();
    });
  });

  describe('Whats New', () => {
    let whatsNew: {
      template: { hy: string; ru: string; en: string };
      examples: Record<string, unknown>;
      releases: Record<string, { hy: string; ru: string; en: string }>;
    };

    beforeAll(() => {
      const filePath = path.join(METADATA_DIR, 'whats-new.json');
      expect(fs.existsSync(filePath)).toBe(true);
      whatsNew = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        template: { hy: string; ru: string; en: string };
        examples: Record<string, unknown>;
        releases: Record<string, { hy: string; ru: string; en: string }>;
      };
    });

    it('should have template field', () => {
      expect(whatsNew).toHaveProperty('template');
    });

    it('should have examples field', () => {
      expect(whatsNew).toHaveProperty('examples');
    });

    it('should have releases field', () => {
      expect(whatsNew).toHaveProperty('releases');
    });

    it('should have template for all locales', () => {
      const template = whatsNew.template as Record<string, string>;
      expect(template).toHaveProperty('hy');
      expect(template).toHaveProperty('ru');
      expect(template).toHaveProperty('en');
    });

    it('should have version 1.0.0 release notes', () => {
      const releases = whatsNew.releases as Record<string, Record<string, string>>;
      expect(releases).toHaveProperty('1.0.0');

      const release = releases['1.0.0'];
      expect(release).toHaveProperty('hy');
      expect(release).toHaveProperty('ru');
      expect(release).toHaveProperty('en');
    });

    it('should have non-empty release notes', () => {
      const releases = whatsNew.releases as Record<string, Record<string, string>>;
      const release = releases['1.0.0'];

      expect(release.hy.length).toBeGreaterThan(0);
      expect(release.ru.length).toBeGreaterThan(0);
      expect(release.en.length).toBeGreaterThan(0);
    });
  });
});
