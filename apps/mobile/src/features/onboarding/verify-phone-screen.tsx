import type { ApiErrorResponse } from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiClientError } from '../../api';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { onboardingApi, type OnboardingApi } from './onboarding-api';
import { useOnboardingSession } from './onboarding-session';
import { validateOtpCode } from './onboarding-validation';

interface VerifyPhoneScreenProps {
  readonly api?: Pick<OnboardingApi, 'verifyPhoneOtpAndRegister'>;
}

/**
 * Renders OTP verification step and completes phone-based registration.
 */
export function VerifyPhoneScreen({ api }: VerifyPhoneScreenProps): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const onboardingSession = useOnboardingSession();
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiClient = api ?? onboardingApi;

  if (onboardingSession.state.registrationDraft === null) {
    return (
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('onboarding.verifyPhone.title')}
        </Text>
        <Text style={styles.subtitle}>{t('onboarding.verifyPhone.missingRegistration')}</Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }): object[] => [
            styles.secondaryButton,
            pressed ? styles.buttonPressed : {},
          ]}
          onPress={(): void => {
            router.replace('/onboarding/register');
          }}
        >
          <Text style={styles.secondaryButtonText}>
            {t('onboarding.verifyPhone.actions.backToRegistration')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const registrationDraft = onboardingSession.state.registrationDraft;

  /**
   * Validates OTP and exchanges it for JWT access/refresh tokens.
   */
  const handleVerifyCode = async (): Promise<void> => {
    const validation = validateOtpCode(code);

    if (!validation.isValid) {
      setErrorMessage(t(validation.errorKey));
      return;
    }

    try {
      setErrorMessage(null);
      setIsSubmitting(true);

      const tokenPair = await apiClient.verifyPhoneOtpAndRegister({
        code: validation.data,
        displayName: registrationDraft.displayName,
        email: registrationDraft.email,
        language: registrationDraft.language,
        password: registrationDraft.password,
        phone: registrationDraft.phone,
      });

      onboardingSession.setAuthTokenPair(tokenPair);
      router.push('/onboarding/vehicle');
    } catch (error: unknown) {
      setErrorMessage(
        extractOnboardingErrorMessage(error, t('onboarding.verifyPhone.errors.verifyFailed')),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('onboarding.verifyPhone.title')}
      </Text>
      <Text style={styles.subtitle}>
        {t('onboarding.verifyPhone.subtitle', { phone: registrationDraft.phone })}
      </Text>

      <TextInput
        accessibilityLabel={t('onboarding.verifyPhone.fields.code')}
        keyboardType="number-pad"
        maxLength={6}
        placeholder={t('onboarding.verifyPhone.fields.codePlaceholder')}
        style={styles.input}
        value={code}
        onChangeText={setCode}
      />

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        style={({ pressed }): object[] => [
          styles.primaryButton,
          isSubmitting ? styles.buttonDisabled : {},
          pressed ? styles.buttonPressed : {},
        ]}
        testID="verify-phone-continue"
        onPress={(): void => {
          void handleVerifyCode();
        }}
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting
            ? t('onboarding.verifyPhone.actions.submitting')
            : t('onboarding.verifyPhone.actions.verify')}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Extracts a user-facing onboarding error message from API errors.
 */
function extractOnboardingErrorMessage(error: unknown, fallbackMessage: string): string {
  if (
    error instanceof ApiClientError &&
    typeof error.details === 'object' &&
    error.details !== null
  ) {
    const details = error.details as Partial<ApiErrorResponse>;

    if (typeof details.message === 'string' && details.message.length > 0) {
      return details.message;
    }
  }

  return fallbackMessage;
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  container: {
    backgroundColor: '#FFFFFF',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderColor: '#D1D5DB',
    borderRadius: 10,
    borderWidth: 1,
    color: '#111827',
    fontSize: 20,
    letterSpacing: 4,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#166534',
    borderRadius: 10,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#166534',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 15,
    marginTop: 8,
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '700',
  },
});
