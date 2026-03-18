import { ConnectorType } from '@lilocharge/shared-types';

import {
  normalizePhoneInput,
  validateOtpCode,
  validateRegistrationForm,
  validateVehicleSetupForm,
} from './onboarding-validation';

describe('onboarding validation', () => {
  describe('normalizePhoneInput', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizePhoneInput('  +37477123456  ')).toBe('+37477123456');
    });
  });

  describe('validateRegistrationForm', () => {
    it('returns parsed registration values when all fields are valid', () => {
      const result = validateRegistrationForm({
        displayName: '  Անի Սարգսյան ',
        email: ' Ani@Example.com ',
        password: 'Password123!',
        phone: ' +37477123456 ',
      });

      expect(result).toEqual({
        data: {
          displayName: 'Անի Սարգսյան',
          email: 'ani@example.com',
          password: 'Password123!',
          phone: '+37477123456',
        },
        isValid: true,
      });
    });

    it('returns invalid when phone is not E.164', () => {
      const result = validateRegistrationForm({
        displayName: 'Անի Սարգսյան',
        email: 'ani@example.com',
        password: 'Password123!',
        phone: '077123456',
      });

      expect(result).toEqual({
        errorKey: 'onboarding.registration.errors.invalidPhone',
        isValid: false,
      });
    });
  });

  describe('validateOtpCode', () => {
    it('returns valid for a 6 digit numeric OTP', () => {
      expect(validateOtpCode('123456')).toEqual({
        data: '123456',
        isValid: true,
      });
    });

    it('returns invalid for a non-numeric OTP code', () => {
      expect(validateOtpCode('12AB56')).toEqual({
        errorKey: 'onboarding.verifyPhone.errors.invalidCode',
        isValid: false,
      });
    });
  });

  describe('validateVehicleSetupForm', () => {
    it('returns parsed vehicle payload for valid form values', () => {
      const result = validateVehicleSetupForm({
        batteryCapacity: '64',
        connectorType: ConnectorType.CCS,
        make: '  Kia ',
        maxChargePower: '240',
        model: ' EV6 ',
        year: '2024',
      });

      expect(result).toEqual({
        data: {
          batteryCapacity: 64,
          connectorType: ConnectorType.CCS,
          make: 'Kia',
          maxChargePower: 240,
          model: 'EV6',
          year: 2024,
        },
        isValid: true,
      });
    });

    it('returns invalid when year cannot be parsed to a valid range', () => {
      const result = validateVehicleSetupForm({
        batteryCapacity: '64',
        connectorType: undefined,
        make: 'Kia',
        maxChargePower: '240',
        model: 'EV6',
        year: '1900',
      });

      expect(result).toEqual({
        errorKey: 'onboarding.vehicle.errors.invalidYear',
        isValid: false,
      });
    });
  });
});
