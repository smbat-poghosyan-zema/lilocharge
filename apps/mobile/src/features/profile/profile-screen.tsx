import type {
  SupportedLanguageCode,
  UserProfileResponse,
  VehicleResponse,
} from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ScreenContainer } from '../../components/ui/screen-container';
import { persistLanguage } from '../../i18n/language-preference';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { PRIMARY } from '../../theme/colors';
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

const SECTION_TITLE_CLASS = 'text-[15px] font-bold text-text';
const MUTED_TEXT_CLASS = 'mt-1.5 text-[13px] text-text-muted';
const FIELD_LABEL_CLASS = 'mt-2.5 text-xs font-bold uppercase text-text-muted';
const FIELD_VALUE_CLASS = 'mt-0.5 text-[15px] font-semibold text-text';
const NAV_ROW_CLASS =
  'mt-2 flex-row items-center justify-between rounded-sm border border-border bg-neutral-50 px-3 py-3 active:opacity-75';
const OPTION_CLASS =
  'mt-2 rounded-sm border border-border bg-neutral-50 px-3 py-2.5 active:opacity-75';
const OPTION_SELECTED_CLASS = 'border-primary bg-primary-50';
const OPTION_TEXT_CLASS = 'text-sm font-semibold text-text';

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
    <ScreenContainer scroll testID="profile-screen">
      <View className="gap-3 p-4">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('profile.title')}
        </Text>
        <Text className="text-[15px] text-neutral-700">{t('profile.subtitle')}</Text>

        {userId === null ? (
          <Card>
            <Text className={MUTED_TEXT_CLASS} testID="profile-signed-out">
              {t('profile.signedOut.message')}
            </Text>
            <Button
              className="mt-3"
              onPress={(): void => {
                router.replace('/onboarding/login');
              }}
              testID="profile-sign-in"
              title={t('profile.signedOut.signIn')}
            />
          </Card>
        ) : (
          <AccountSections
            accountState={accountState}
            onRetry={(): void => {
              setReloadToken((previousToken) => previousToken + 1);
            }}
          />
        )}

        <Card>
          <Text className={SECTION_TITLE_CLASS}>{t('profile.navigation.title')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              router.push('/payment-methods');
            }}
            className={NAV_ROW_CLASS}
            testID="profile-payment-methods"
          >
            <Text className="text-sm font-semibold text-text">
              {t('profile.navigation.paymentMethods')}
            </Text>
            <Text className="text-lg font-bold text-text-muted">›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              router.push('/wallet');
            }}
            className={NAV_ROW_CLASS}
            testID="profile-wallet"
          >
            <Text className="text-sm font-semibold text-text">{t('profile.navigation.wallet')}</Text>
            <Text className="text-lg font-bold text-text-muted">›</Text>
          </Pressable>
        </Card>

        <Card>
          <Text className={SECTION_TITLE_CLASS}>{t('profile.language.title')}</Text>
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
                className={`${OPTION_CLASS} ${isSelected ? OPTION_SELECTED_CLASS : ''}`}
                testID={`profile-language-${option.code}`}
              >
                <Text className={`${OPTION_TEXT_CLASS} ${isSelected ? 'text-primary-900' : ''}`}>
                  {option.nativeLabel}
                </Text>
              </Pressable>
            );
          })}
        </Card>

        {userId !== null ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleLogout}
            className="mt-1 items-center rounded-md bg-danger-bg py-3.5 active:opacity-75"
            testID="profile-logout"
          >
            <Text className="text-[15px] font-bold text-danger">{t('profile.logout')}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenContainer>
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
      <Card testID="profile-loading">
        <ActivityIndicator color={PRIMARY} />
        <Text className={MUTED_TEXT_CLASS}>{t('profile.loading')}</Text>
      </Card>
    );
  }

  if (accountState.status === 'error') {
    return (
      <Card>
        <Text className="text-sm font-semibold text-danger" testID="profile-load-error">
          {t('profile.loadError')}
        </Text>
        <Button
          className="mt-3 self-start"
          onPress={onRetry}
          testID="profile-retry"
          title={t('profile.retry')}
          variant="secondary"
        />
      </Card>
    );
  }

  const { profile, vehicles } = accountState;

  return (
    <>
      <Card testID="profile-account">
        <Text className={SECTION_TITLE_CLASS}>{t('profile.account.title')}</Text>
        <Text className={FIELD_LABEL_CLASS}>{t('profile.account.nameLabel')}</Text>
        <Text className={FIELD_VALUE_CLASS} testID="profile-display-name">
          {profile.displayName}
        </Text>
        <Text className={FIELD_LABEL_CLASS}>{t('profile.account.emailLabel')}</Text>
        <Text className={FIELD_VALUE_CLASS} testID="profile-email">
          {profile.email}
        </Text>
        <Text className={FIELD_LABEL_CLASS}>{t('profile.account.phoneLabel')}</Text>
        <Text className={FIELD_VALUE_CLASS} testID="profile-phone">
          {profile.phone ?? t('profile.account.phoneMissing')}
        </Text>
      </Card>

      <Card testID="profile-vehicles">
        <Text className={SECTION_TITLE_CLASS}>{t('profile.vehicles.title')}</Text>
        {vehicles.length === 0 ? (
          <Text className={MUTED_TEXT_CLASS} testID="profile-vehicles-empty">
            {t('profile.vehicles.empty')}
          </Text>
        ) : null}
        {vehicles.map((vehicle) => (
          <View
            key={vehicle.id}
            className="mt-2.5 rounded-md border border-border bg-neutral-50 px-3 py-2.5"
            testID={`profile-vehicle-${vehicle.id}`}
          >
            <Text className={FIELD_VALUE_CLASS}>
              {vehicle.make} {vehicle.model} · {vehicle.year}
            </Text>
            <Text className={MUTED_TEXT_CLASS}>
              {t(`onboarding.vehicle.connectorTypes.${vehicle.connectorType}`)} ·{' '}
              {t('sessions.units.energy', { value: vehicle.batteryCapacity })}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}
