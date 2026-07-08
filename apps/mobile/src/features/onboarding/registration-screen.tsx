import type { ApiErrorResponse } from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ApiClientError } from '../../api';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { ScreenContainer } from '../../components/ui/screen-container';
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
    <ScreenContainer keyboardAvoiding testID="registration-screen">
      <View className="flex-1 justify-center px-6">
        <Text accessibilityRole="header" className="text-[28px] font-bold text-text">
          {t('onboarding.registration.title')}
        </Text>
        <Text className="mt-2 text-[15px] text-text-muted">
          {t('onboarding.registration.subtitle')}
        </Text>

        <View className="mt-6 gap-3">
          <FormField
            accessibilityLabel={t('onboarding.registration.fields.displayName')}
            autoCapitalize="words"
            label={t('onboarding.registration.fields.displayName')}
            onChangeText={setDisplayName}
            placeholder={t('onboarding.registration.fields.displayName')}
            testID="registration-display-name-input"
            value={displayName}
          />
          <FormField
            accessibilityLabel={t('onboarding.registration.fields.email')}
            autoCapitalize="none"
            keyboardType="email-address"
            label={t('onboarding.registration.fields.email')}
            onChangeText={setEmail}
            placeholder={t('onboarding.registration.fields.email')}
            testID="registration-email-input"
            value={email}
          />
          <FormField
            accessibilityLabel={t('onboarding.registration.fields.phone')}
            autoCapitalize="none"
            keyboardType="phone-pad"
            label={t('onboarding.registration.fields.phone')}
            onChangeText={setPhone}
            placeholder={t('onboarding.registration.fields.phonePlaceholder')}
            testID="registration-phone-input"
            value={phone}
          />
          <FormField
            accessibilityLabel={t('onboarding.registration.fields.password')}
            autoCapitalize="none"
            label={t('onboarding.registration.fields.password')}
            onChangeText={setPassword}
            placeholder={t('onboarding.registration.fields.password')}
            secureTextEntry
            testID="registration-password-input"
            value={password}
          />

          {errorMessage ? (
            <Text className="text-sm font-semibold text-danger" testID="registration-error">
              {errorMessage}
            </Text>
          ) : null}

          <Button
            disabled={isSubmitting}
            onPress={(): void => {
              void handleContinue();
            }}
            testID="registration-continue"
            title={
              isSubmitting
                ? t('onboarding.registration.actions.submitting')
                : t('onboarding.registration.actions.continue')
            }
          />

          <Button
            onPress={(): void => {
              router.push('/onboarding/login');
            }}
            testID="registration-go-to-login"
            title={t('onboarding.registration.actions.goToLogin')}
            variant="link"
          />
        </View>
      </View>
    </ScreenContainer>
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
