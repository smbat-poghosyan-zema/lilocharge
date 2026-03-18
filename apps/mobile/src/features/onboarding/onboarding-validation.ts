import type { ConnectorType, CreateVehicleRequest } from '@lilocharge/shared-types';

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_CODE_REGEX = /^\d{6}$/;
const MIN_VEHICLE_YEAR = 1995;

/**
 * Represents a registration form payload prior to API submission.
 */
export interface RegistrationFormValues {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly phone: string;
}

/**
 * Represents the raw user input for vehicle onboarding form fields.
 */
export interface VehicleSetupFormValues {
  readonly batteryCapacity: string;
  readonly connectorType: ConnectorType | undefined;
  readonly make: string;
  readonly maxChargePower: string;
  readonly model: string;
  readonly year: string;
}

/**
 * Represents a successful form validation with parsed typed data.
 */
interface ValidationSuccess<TData> {
  readonly data: TData;
  readonly isValid: true;
}

/**
 * Represents a failed form validation with a translation error key.
 */
interface ValidationFailure {
  readonly errorKey: string;
  readonly isValid: false;
}

/**
 * Union describing either a successful or failed validation result.
 */
export type ValidationResult<TData> = ValidationFailure | ValidationSuccess<TData>;

/**
 * Normalizes user-entered phone input by trimming and removing internal spaces.
 */
export function normalizePhoneInput(phone: string): string {
  return phone.trim().replace(/\s+/g, '');
}

/**
 * Validates and normalizes registration form values for onboarding.
 */
export function validateRegistrationForm(
  values: RegistrationFormValues,
): ValidationResult<RegistrationFormValues> {
  const displayName = values.displayName.trim();
  const email = values.email.trim().toLowerCase();
  const phone = normalizePhoneInput(values.phone);

  if (displayName.length === 0) {
    return {
      errorKey: 'onboarding.registration.errors.displayNameRequired',
      isValid: false,
    };
  }

  if (!EMAIL_REGEX.test(email)) {
    return {
      errorKey: 'onboarding.registration.errors.invalidEmail',
      isValid: false,
    };
  }

  if (!E164_PHONE_REGEX.test(phone)) {
    return {
      errorKey: 'onboarding.registration.errors.invalidPhone',
      isValid: false,
    };
  }

  if (values.password.length < 8) {
    return {
      errorKey: 'onboarding.registration.errors.passwordTooShort',
      isValid: false,
    };
  }

  return {
    data: {
      displayName,
      email,
      password: values.password,
      phone,
    },
    isValid: true,
  };
}

/**
 * Validates a six-digit phone OTP code.
 */
export function validateOtpCode(code: string): ValidationResult<string> {
  const normalized = code.trim();

  if (!OTP_CODE_REGEX.test(normalized)) {
    return {
      errorKey: 'onboarding.verifyPhone.errors.invalidCode',
      isValid: false,
    };
  }

  return {
    data: normalized,
    isValid: true,
  };
}

/**
 * Validates and parses vehicle setup form values into CreateVehicleRequest payload.
 */
export function validateVehicleSetupForm(
  values: VehicleSetupFormValues,
): ValidationResult<CreateVehicleRequest> {
  const make = values.make.trim();
  const model = values.model.trim();
  const year = Number(values.year.trim());
  const batteryCapacity = Number(values.batteryCapacity.trim());
  const maxChargePower = Number(values.maxChargePower.trim());
  const maxYear = new Date().getFullYear() + 1;

  if (make.length === 0) {
    return {
      errorKey: 'onboarding.vehicle.errors.makeRequired',
      isValid: false,
    };
  }

  if (model.length === 0) {
    return {
      errorKey: 'onboarding.vehicle.errors.modelRequired',
      isValid: false,
    };
  }

  if (!Number.isInteger(year) || year < MIN_VEHICLE_YEAR || year > maxYear) {
    return {
      errorKey: 'onboarding.vehicle.errors.invalidYear',
      isValid: false,
    };
  }

  if (!Number.isFinite(batteryCapacity) || batteryCapacity <= 0) {
    return {
      errorKey: 'onboarding.vehicle.errors.invalidBatteryCapacity',
      isValid: false,
    };
  }

  if (!Number.isFinite(maxChargePower) || maxChargePower <= 0) {
    return {
      errorKey: 'onboarding.vehicle.errors.invalidMaxChargePower',
      isValid: false,
    };
  }

  return {
    data: {
      batteryCapacity,
      connectorType: values.connectorType,
      make,
      maxChargePower,
      model,
      year,
    },
    isValid: true,
  };
}
