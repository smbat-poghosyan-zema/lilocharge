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
      <ScreenContainer>
        <View className="flex-1 justify-center px-6">
          <Text accessibilityRole="header" className="text-[28px] font-bold text-text">
            {t('onboarding.verifyPhone.title')}
          </Text>
          <Text className="mt-2 text-[15px] text-text-muted">
            {t('onboarding.verifyPhone.missingRegistration')}
          </Text>
          <Button
            className="mt-5"
            onPress={(): void => {
              router.replace('/onboarding/register');
            }}
            title={t('onboarding.verifyPhone.actions.backToRegistration')}
            variant="secondary"
          />
        </View>
      </ScreenContainer>
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
    <ScreenContainer keyboardAvoiding testID="verify-phone-screen">
      <View className="flex-1 justify-center px-6">
        <Text accessibilityRole="header" className="text-[28px] font-bold text-text">
          {t('onboarding.verifyPhone.title')}
        </Text>
        <Text className="mt-2 text-[15px] text-text-muted">
          {t('onboarding.verifyPhone.subtitle', { phone: registrationDraft.phone })}
        </Text>

        <FormField
          accessibilityLabel={t('onboarding.verifyPhone.fields.code')}
          className="mt-5"
          keyboardType="number-pad"
          label={t('onboarding.verifyPhone.fields.code')}
          maxLength={6}
          onChangeText={setCode}
          placeholder={t('onboarding.verifyPhone.fields.codePlaceholder')}
          testID="verify-phone-code-input"
          value={code}
        />

        {errorMessage ? (
          <Text className="mt-2 text-sm font-semibold text-danger" testID="verify-phone-error">
            {errorMessage}
          </Text>
        ) : null}

        <Button
          className="mt-4"
          disabled={isSubmitting}
          onPress={(): void => {
            void handleVerifyCode();
          }}
          testID="verify-phone-continue"
          title={
            isSubmitting
              ? t('onboarding.verifyPhone.actions.submitting')
              : t('onboarding.verifyPhone.actions.verify')
          }
        />
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
