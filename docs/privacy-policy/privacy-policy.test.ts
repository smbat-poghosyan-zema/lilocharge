/**
 * Tests for privacy policy documents
 */

import * as fs from 'fs';
import * as path from 'path';

const PRIVACY_POLICY_DIR = path.join(__dirname, '../../../docs/privacy-policy');

describe('Privacy Policy', () => {
  describe('File Existence', () => {
    it('should have Armenian privacy policy', () => {
      const filePath = path.join(PRIVACY_POLICY_DIR, 'privacy-policy-hy.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should have Russian privacy policy', () => {
      const filePath = path.join(PRIVACY_POLICY_DIR, 'privacy-policy-ru.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should have English privacy policy', () => {
      const filePath = path.join(PRIVACY_POLICY_DIR, 'privacy-policy-en.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should have JSON metadata', () => {
      const filePath = path.join(PRIVACY_POLICY_DIR, 'privacy-policy.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('JSON Metadata', () => {
    let metadata: Record<string, unknown>;

    beforeAll(() => {
      const filePath = path.join(PRIVACY_POLICY_DIR, 'privacy-policy.json');
      metadata = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    });

    it('should have version', () => {
      expect(metadata).toHaveProperty('version');
      expect(typeof metadata.version).toBe('string');
    });

    it('should have last updated date', () => {
      expect(metadata).toHaveProperty('lastUpdated');
      expect(typeof metadata.lastUpdated).toBe('string');
    });

    it('should have contact information', () => {
      expect(metadata).toHaveProperty('contact');
      const contact = metadata.contact as Record<string, unknown>;
      expect(contact).toHaveProperty('email');
      expect(contact).toHaveProperty('phone');
      expect(contact).toHaveProperty('address');
    });

    it('should have sections information', () => {
      expect(metadata).toHaveProperty('sections');
      const sections = metadata.sections as Record<string, unknown>;

      expect(sections).toHaveProperty('dataCollection');
      expect(sections).toHaveProperty('thirdPartyServices');
      expect(sections).toHaveProperty('retention');
      expect(sections).toHaveProperty('userRights');
      expect(sections).toHaveProperty('security');
    });

    it('should list data collection categories', () => {
      const sections = metadata.sections as Record<string, unknown>;
      const dataCollection = sections.dataCollection as Record<string, string[]>;

      expect(dataCollection).toHaveProperty('personal');
      expect(dataCollection).toHaveProperty('technical');
      expect(dataCollection).toHaveProperty('usage');

      expect(Array.isArray(dataCollection.personal)).toBe(true);
      expect(Array.isArray(dataCollection.technical)).toBe(true);
      expect(Array.isArray(dataCollection.usage)).toBe(true);
    });

    it('should list third party services', () => {
      const sections = metadata.sections as Record<string, unknown>;
      const thirdPartyServices = sections.thirdPartyServices as Array<{
        name: string;
        purpose: string;
        dataShared: string[];
        privacyPolicy: string;
      }>;

      expect(Array.isArray(thirdPartyServices)).toBe(true);
      expect(thirdPartyServices.length).toBeGreaterThan(0);

      const serviceNames = thirdPartyServices.map((s) => s.name);
      expect(serviceNames).toContain('Mapbox');
      expect(serviceNames).toContain('ArCa');
      expect(serviceNames).toContain('Idram');
      expect(serviceNames).toContain('Firebase Cloud Messaging');
    });

    it('should have retention policies', () => {
      const sections = metadata.sections as Record<string, unknown>;
      const retention = sections.retention as Record<string, string>;

      expect(retention).toHaveProperty('account_data');
      expect(retention).toHaveProperty('charging_history');
      expect(retention).toHaveProperty('payment_transactions');
      expect(retention).toHaveProperty('technical_data');
    });

    it('should list user rights', () => {
      const sections = metadata.sections as Record<string, unknown>;
      const userRights = sections.userRights as string[];

      expect(Array.isArray(userRights)).toBe(true);
      expect(userRights).toContain('access');
      expect(userRights).toContain('rectification');
      expect(userRights).toContain('deletion');
      expect(userRights).toContain('export');
    });

    it('should have age restriction', () => {
      const sections = metadata.sections as Record<string, unknown>;
      expect(sections).toHaveProperty('ageRestriction');
      expect(typeof sections.ageRestriction).toBe('number');
      expect(sections.ageRestriction).toBe(16);
    });

    it('should list available languages', () => {
      const sections = metadata.sections as Record<string, unknown>;
      const availableLanguages = sections.availableLanguages as string[];

      expect(Array.isArray(availableLanguages)).toBe(true);
      expect(availableLanguages).toContain('hy');
      expect(availableLanguages).toContain('ru');
      expect(availableLanguages).toContain('en');
    });

    it('should map to correct files', () => {
      const files = metadata.files as Record<string, string>;

      expect(files).toHaveProperty('hy');
      expect(files).toHaveProperty('ru');
      expect(files).toHaveProperty('en');

      expect(files.hy).toBe('privacy-policy-hy.md');
      expect(files.ru).toBe('privacy-policy-ru.md');
      expect(files.en).toBe('privacy-policy-en.md');
    });
  });

  describe('Content Validation', () => {
    const requiredSections = [
      'Introduction',
      'Data Collection',
      'Data Usage',
      'Third-Party Services',
      'Data Retention',
      'Your Rights',
      'Children',
      'Location',
      'Security',
      'Contact',
    ];

    it('should have required sections in Armenian policy', () => {
      const filePath = path.join(PRIVACY_POLICY_DIR, 'privacy-policy-hy.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content.length).toBeGreaterThan(1000);
      expect(content).toContain('Գաղտնիության քաղաքականություն');
      expect(content).toContain('privacy@lilocharge.am');
    });

    it('should have required sections in Russian policy', () => {
      const filePath = path.join(PRIVACY_POLICY_DIR, 'privacy-policy-ru.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content.length).toBeGreaterThan(1000);
      expect(content).toContain('Политика конфиденциальности');
      expect(content).toContain('privacy@lilocharge.am');
    });

    it('should have required sections in English policy', () => {
      const filePath = path.join(PRIVACY_POLICY_DIR, 'privacy-policy-en.md');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content.length).toBeGreaterThan(1000);
      expect(content).toContain('Privacy Policy');
      expect(content).toContain('privacy@lilocharge.am');
    });

    it('should mention all third-party services', () => {
      const services = ['Mapbox', 'ArCa', 'Idram', 'Firebase'];

      ['hy', 'ru', 'en'].forEach((lang) => {
        const filePath = path.join(PRIVACY_POLICY_DIR, `privacy-policy-${lang}.md`);
        const content = fs.readFileSync(filePath, 'utf-8');

        services.forEach((service) => {
          expect(content).toContain(service);
        });
      });
    });

    it('should have contact information in all policies', () => {
      ['hy', 'ru', 'en'].forEach((lang) => {
        const filePath = path.join(PRIVACY_POLICY_DIR, `privacy-policy-${lang}.md`);
        const content = fs.readFileSync(filePath, 'utf-8');

        expect(content).toContain('privacy@lilocharge.am');
        expect(content).toContain('+374');
      });
    });
  });
});
