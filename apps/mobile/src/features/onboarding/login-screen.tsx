import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('onboarding.login.title')}
      </Text>
      <Text style={styles.subtitle}>{t('onboarding.login.subtitle')}</Text>

      <View style={styles.form}>
        <TextInput
          accessibilityLabel={t('onboarding.login.fields.email')}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t('onboarding.login.fields.email')}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          accessibilityLabel={t('onboarding.login.fields.password')}
          autoCapitalize="none"
          placeholder={t('onboarding.login.fields.password')}
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
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
          testID="login-sign-in"
          onPress={(): void => {
            void handleSignIn();
          }}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting
              ? t('onboarding.login.actions.submitting')
              : t('onboarding.login.actions.signIn')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="link"
          style={styles.secondaryButton}
          onPress={(): void => {
            router.replace('/onboarding/register');
          }}
        >
          <Text style={styles.secondaryButtonText}>
            {t('onboarding.login.actions.goToRegister')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
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
