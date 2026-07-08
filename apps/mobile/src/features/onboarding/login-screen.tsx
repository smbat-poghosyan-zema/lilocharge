import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { ScreenContainer } from '../../components/ui/screen-container';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { onboardingApi, type OnboardingApi } from './onboarding-api';
import { useOnboardingSession } from './onboarding-session';

interface LoginScreenProps {
  readonly api?: Pick<OnboardingApi, 'login'>;
}

/**
 * Renders the email/password sign-in screen for returning users.
 */
export function LoginScreen({ api }: LoginScreenProps): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const { setAuthTokenPair, completeOnboarding } = useOnboardingSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiClient = api ?? onboardingApi;

  const handleSignIn = async (): Promise<void> => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail.includes('@')) {
      setErrorMessage(t('onboarding.login.errors.invalidEmail'));
      return;
    }

    if (password.length === 0) {
      setErrorMessage(t('onboarding.login.errors.passwordRequired'));
      return;
    }

    let loginSucceeded = false;

    try {
      setErrorMessage(null);
      setIsSubmitting(true);
      const tokenPair = await apiClient.login({ email: trimmedEmail, password });
      setAuthTokenPair(tokenPair);
      completeOnboarding();
      loginSucceeded = true;
    } catch {
      setErrorMessage(t('onboarding.login.errors.loginFailed'));
    } finally {
      setIsSubmitting(false);
    }

    if (loginSucceeded) {
      router.replace('/(tabs)/stations');
    }
  };

  return (
    <ScreenContainer keyboardAvoiding>
      <View className="flex-1 justify-center px-6">
        <Text accessibilityRole="header" className="text-[28px] font-bold text-text">
          {t('onboarding.login.title')}
        </Text>
        <Text className="mt-2 text-[15px] text-text-muted">{t('onboarding.login.subtitle')}</Text>

        <View className="mt-6 gap-3">
          <FormField
            accessibilityLabel={t('onboarding.login.fields.email')}
            autoCapitalize="none"
            keyboardType="email-address"
            label={t('onboarding.login.fields.email')}
            onChangeText={setEmail}
            placeholder={t('onboarding.login.fields.email')}
            value={email}
          />
          <FormField
            accessibilityLabel={t('onboarding.login.fields.password')}
            autoCapitalize="none"
            label={t('onboarding.login.fields.password')}
            onChangeText={setPassword}
            placeholder={t('onboarding.login.fields.password')}
            secureTextEntry
            value={password}
          />

          {errorMessage ? (
            <Text className="text-sm font-semibold text-danger">{errorMessage}</Text>
          ) : null}

          <Button
            disabled={isSubmitting}
            onPress={(): void => {
              void handleSignIn();
            }}
            testID="login-sign-in"
            title={
              isSubmitting
                ? t('onboarding.login.actions.submitting')
                : t('onboarding.login.actions.signIn')
            }
          />

          <Button
            onPress={(): void => {
              router.replace('/onboarding/register');
            }}
            title={t('onboarding.login.actions.goToRegister')}
            variant="link"
          />
        </View>
      </View>
    </ScreenContainer>
  );
}
