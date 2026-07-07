import type {
  SupportedLanguageCode,
  UserProfileResponse,
  VehicleResponse,
} from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { persistLanguage } from '../../i18n/language-preference';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { profileApi, type ProfileApi } from './profile-api';

interface LanguageOption {
  readonly code: SupportedLanguageCode;
  readonly nativeLabel: string;
}

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'hy', nativeLabel: 'Հայերեն' },
  { code: 'ru', nativeLabel: 'Русский' },
  { code: 'en', nativeLabel: 'English' },
];

type AccountState =
  | { readonly status: 'error' }
  | {
      readonly status: 'loaded';
      readonly profile: UserProfileResponse;
      readonly vehicles: readonly VehicleResponse[];
    }
  | { readonly status: 'loading' };

interface ProfileScreenProps {
  readonly profileApiClient?: Pick<
    ProfileApi,
    'getUserProfile' | 'getUserVehicles' | 'updateUserLanguage'
  >;
}

/**
 * Profile landing screen: account details, saved vehicles, UI language
 * switcher, and logout.
 */
export function ProfileScreen({ profileApiClient = profileApi }: ProfileScreenProps = {}): JSX.Element {
  const { t, i18n } = useAppTranslation();
  const router = useRouter();
  const { logout, state } = useOnboardingSession();
  const userId = state.userId;
  const [accountState, setAccountState] = useState<AccountState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (userId === null) {
      return;
    }

    let isCancelled = false;

    setAccountState({ status: 'loading' });
    Promise.all([profileApiClient.getUserProfile(userId), profileApiClient.getUserVehicles(userId)])
      .then(([profile, vehicles]: [UserProfileResponse, VehicleResponse[]]): void => {
        if (!isCancelled) {
          setAccountState({ profile, status: 'loaded', vehicles });
        }
      })
      .catch((): void => {
        if (!isCancelled) {
          setAccountState({ status: 'error' });
        }
      });

    return (): void => {
      isCancelled = true;
    };
  }, [profileApiClient, reloadToken, userId]);

  /**
   * Applies the selected UI language locally, persists it, and syncs the
   * preference to the backend as a fire-and-forget request when signed in.
   */
  const handleSelectLanguage = (language: SupportedLanguageCode): void => {
    void i18n.changeLanguage(language);
    persistLanguage(language);

    if (userId !== null) {
      void profileApiClient.updateUserLanguage(userId, language).catch((): undefined => {
        return undefined;
      });
    }
  };

  /**
   * Runs the full logout sweep (push token, favorites, cache, session) and
   * returns to the onboarding entry route.
   */
  const handleLogout = (): void => {
    logout();
    router.replace('/onboarding/register');
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
      testID="profile-screen"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t('profile.title')}
      </Text>
      <Text style={styles.subtitle}>{t('profile.subtitle')}</Text>

      {userId === null ? (
        <View style={styles.sectionCard}>
          <Text style={styles.mutedText} testID="profile-signed-out">
            {t('profile.signedOut.message')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              router.replace('/onboarding/login');
            }}
            style={({ pressed }) => {
              return [styles.primaryButton, pressed ? styles.buttonPressed : null];
            }}
            testID="profile-sign-in"
          >
            <Text style={styles.primaryButtonText}>{t('profile.signedOut.signIn')}</Text>
          </Pressable>
        </View>
      ) : (
        <AccountSections
          accountState={accountState}
          onRetry={(): void => {
            setReloadToken((previousToken) => previousToken + 1);
          }}
        />
      )}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('profile.navigation.title')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.push('/payment-methods');
          }}
          style={({ pressed }) => {
            return [styles.navigationRow, pressed ? styles.buttonPressed : null];
          }}
          testID="profile-payment-methods"
        >
          <Text style={styles.navigationRowText}>{t('profile.navigation.paymentMethods')}</Text>
          <Text style={styles.navigationRowChevron}>›</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.push('/wallet');
          }}
          style={({ pressed }) => {
            return [styles.navigationRow, pressed ? styles.buttonPressed : null];
          }}
          testID="profile-wallet"
        >
          <Text style={styles.navigationRowText}>{t('profile.navigation.wallet')}</Text>
          <Text style={styles.navigationRowChevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('profile.language.title')}</Text>
        {LANGUAGE_OPTIONS.map((option) => {
          const isSelected = i18n.language === option.code;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={option.code}
              onPress={(): void => {
                handleSelectLanguage(option.code);
              }}
              style={({ pressed }) => {
                return [
                  styles.languageOption,
                  isSelected ? styles.languageOptionSelected : null,
                  pressed ? styles.buttonPressed : null,
                ];
              }}
              testID={`profile-language-${option.code}`}
            >
              <Text
                style={[
                  styles.languageOptionText,
                  isSelected ? styles.languageOptionTextSelected : null,
                ]}
              >
                {option.nativeLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {userId !== null ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleLogout}
          style={({ pressed }) => {
            return [styles.logoutButton, pressed ? styles.buttonPressed : null];
          }}
          testID="profile-logout"
        >
          <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

interface AccountSectionsProps {
  readonly accountState: AccountState;
  readonly onRetry: () => void;
}

/**
 * Renders the authenticated account and vehicles sections with loading and
 * error/retry states.
 */
function AccountSections({ accountState, onRetry }: AccountSectionsProps): JSX.Element {
  const { t } = useAppTranslation();

  if (accountState.status === 'loading') {
    return (
      <View style={styles.sectionCard} testID="profile-loading">
        <ActivityIndicator color="#0F766E" />
        <Text style={styles.mutedText}>{t('profile.loading')}</Text>
      </View>
    );
  }

  if (accountState.status === 'error') {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.errorText} testID="profile-load-error">
          {t('profile.loadError')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => {
            return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="profile-retry"
        >
          <Text style={styles.secondaryButtonText}>{t('profile.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const { profile, vehicles } = accountState;

  return (
    <>
      <View style={styles.sectionCard} testID="profile-account">
        <Text style={styles.sectionTitle}>{t('profile.account.title')}</Text>
        <Text style={styles.fieldLabel}>{t('profile.account.nameLabel')}</Text>
        <Text style={styles.fieldValue} testID="profile-display-name">
          {profile.displayName}
        </Text>
        <Text style={styles.fieldLabel}>{t('profile.account.emailLabel')}</Text>
        <Text style={styles.fieldValue} testID="profile-email">
          {profile.email}
        </Text>
        <Text style={styles.fieldLabel}>{t('profile.account.phoneLabel')}</Text>
        <Text style={styles.fieldValue} testID="profile-phone">
          {profile.phone ?? t('profile.account.phoneMissing')}
        </Text>
      </View>

      <View style={styles.sectionCard} testID="profile-vehicles">
        <Text style={styles.sectionTitle}>{t('profile.vehicles.title')}</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.mutedText} testID="profile-vehicles-empty">
            {t('profile.vehicles.empty')}
          </Text>
        ) : null}
        {vehicles.map((vehicle) => (
          <View key={vehicle.id} style={styles.vehicleCard} testID={`profile-vehicle-${vehicle.id}`}>
            <Text style={styles.fieldValue}>
              {vehicle.make} {vehicle.model} · {vehicle.year}
            </Text>
            <Text style={styles.mutedText}>
              {t(`onboarding.vehicle.connectorTypes.${vehicle.connectorType}`)} ·{' '}
              {t('sessions.units.energy', { value: vehicle.batteryCapacity })}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.75,
  },
  container: {
    backgroundColor: '#F3F4F6',
    flex: 1,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
  },
  fieldLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    textTransform: 'uppercase',
  },
  fieldValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  languageOption: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  languageOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0F766E',
  },
  languageOptionText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  languageOptionTextSelected: {
    color: '#065F46',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    marginTop: 4,
    paddingVertical: 13,
  },
  logoutButtonText: {
    color: '#991B1B',
    fontSize: 15,
    fontWeight: '700',
  },
  mutedText: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 6,
  },
  navigationRow: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  navigationRowChevron: {
    color: '#6B7280',
    fontSize: 18,
    fontWeight: '700',
  },
  navigationRowText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  scrollContent: {
    gap: 12,
    padding: 16,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#0F766E',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#0F766E',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#374151',
    fontSize: 15,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
  vehicleCard: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
