import type { ApiErrorResponse } from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiClientError } from '../../api';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { onboardingApi, type OnboardingApi } from './onboarding-api';
import { resolveSupportedLanguage } from './onboarding-language';
import { useOnboardingSession } from './onboarding-session';
import { validateRegistrationForm } from './onboarding-validation';

interface RegistrationScreenProps {
  readonly api?: Pick<OnboardingApi, 'requestPhoneOtp'>;
}

/**
 * Renders the first onboarding step for account registration details.
 */
export function RegistrationScreen({ api }: RegistrationScreenProps): JSX.Element {
  const { i18n, t } = useAppTranslation();
  const router = useRouter();
  const onboardingSession = useOnboardingSession();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiClient = api ?? onboardingApi;

  /**
   * Validates registration input and requests an OTP for phone verification.
   */
  const handleContinue = async (): Promise<void> => {
    const validation = validateRegistrationForm({
      displayName,
      email,
      password,
      phone,
    });

    if (!validation.isValid) {
      setErrorMessage(t(validation.errorKey));
      return;
    }

    try {
      setErrorMessage(null);
      setIsSubmitting(true);
      await apiClient.requestPhoneOtp({ phone: validation.data.phone });

      onboardingSession.setRegistrationDraft({
        displayName: validation.data.displayName,
        email: validation.data.email,
        language: resolveSupportedLanguage(i18n.language),
        password: validation.data.password,
        phone: validation.data.phone,
      });

      router.push('/onboarding/verify-phone');
    } catch (error: unknown) {
      setErrorMessage(
        extractOnboardingErrorMessage(error, t('onboarding.registration.errors.requestFailed')),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container} testID="registration-screen">
      <Text accessibilityRole="header" style={styles.title}>
        {t('onboarding.registration.title')}
      </Text>
      <Text style={styles.subtitle}>{t('onboarding.registration.subtitle')}</Text>

      <View style={styles.form}>
        <TextInput
          accessibilityLabel={t('onboarding.registration.fields.displayName')}
          autoCapitalize="words"
          placeholder={t('onboarding.registration.fields.displayName')}
          style={styles.input}
          testID="registration-display-name-input"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          accessibilityLabel={t('onboarding.registration.fields.email')}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t('onboarding.registration.fields.email')}
          style={styles.input}
          testID="registration-email-input"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          accessibilityLabel={t('onboarding.registration.fields.phone')}
          autoCapitalize="none"
          keyboardType="phone-pad"
          placeholder={t('onboarding.registration.fields.phonePlaceholder')}
          style={styles.input}
          testID="registration-phone-input"
          value={phone}
          onChangeText={setPhone}
        />
        <TextInput
          accessibilityLabel={t('onboarding.registration.fields.password')}
          autoCapitalize="none"
          placeholder={t('onboarding.registration.fields.password')}
          secureTextEntry
          style={styles.input}
          testID="registration-password-input"
          value={password}
          onChangeText={setPassword}
        />

        {errorMessage ? (
          <Text style={styles.errorText} testID="registration-error">
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          style={({ pressed }): object[] => [
            styles.primaryButton,
            isSubmitting ? styles.buttonDisabled : {},
            pressed ? styles.buttonPressed : {},
          ]}
          testID="registration-continue"
          onPress={(): void => {
            void handleContinue();
          }}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting
              ? t('onboarding.registration.actions.submitting')
              : t('onboarding.registration.actions.continue')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="link"
          style={styles.secondaryButton}
          testID="registration-go-to-login"
          onPress={(): void => {
            router.push('/onboarding/login');
          }}
        >
          <Text style={styles.secondaryButtonText}>
            {t('onboarding.registration.actions.goToLogin')}
          </Text>
        </Pressable>
      </View>
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
  },
  form: {
    marginTop: 24,
  },
  input: {
    borderColor: '#D1D5DB',
    borderRadius: 10,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#166534',
    borderRadius: 10,
    marginTop: 8,
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
    marginTop: 16,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#166534',
    fontSize: 15,
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
