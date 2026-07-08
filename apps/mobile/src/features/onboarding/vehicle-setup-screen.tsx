import { ConnectorType } from '@lilocharge/shared-types';
import type { ApiErrorResponse } from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ApiClientError } from '../../api';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { ScreenContainer } from '../../components/ui/screen-container';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { onboardingApi, type OnboardingApi } from './onboarding-api';
import { useOnboardingSession } from './onboarding-session';
import { validateVehicleSetupForm } from './onboarding-validation';

interface VehicleSetupScreenProps {
  readonly api?: Pick<OnboardingApi, 'createVehicleProfile'>;
}

const CONNECTOR_OPTIONS: readonly ConnectorType[] = [
  ConnectorType.CCS,
  ConnectorType.CHADEMO,
  ConnectorType.TYPE_1,
  ConnectorType.TYPE_2,
  ConnectorType.TESLA,
  ConnectorType.GBT,
];

/**
 * Renders vehicle onboarding step for creating the user's primary EV profile.
 */
export function VehicleSetupScreen({ api }: VehicleSetupScreenProps): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const onboardingSession = useOnboardingSession();

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [batteryCapacity, setBatteryCapacity] = useState('');
  const [maxChargePower, setMaxChargePower] = useState('');
  const [connectorType, setConnectorType] = useState<ConnectorType | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiClient = api ?? onboardingApi;

  if (onboardingSession.state.userId === null) {
    return (
      <ScreenContainer>
        <View className="flex-1 justify-center px-6">
          <Text accessibilityRole="header" className="text-[28px] font-bold text-text">
            {t('onboarding.vehicle.title')}
          </Text>
          <Text className="mt-2 text-[15px] text-text-muted">
            {t('onboarding.vehicle.missingUser')}
          </Text>
          <Button
            className="mt-5"
            onPress={(): void => {
              router.replace('/onboarding/register');
            }}
            title={t('onboarding.vehicle.actions.backToRegistration')}
            variant="secondary"
          />
        </View>
      </ScreenContainer>
    );
  }

  const userId = onboardingSession.state.userId;

  /**
   * Validates vehicle details and creates the user vehicle profile.
   */
  const handleSaveVehicle = async (): Promise<void> => {
    const validation = validateVehicleSetupForm({
      batteryCapacity,
      connectorType,
      make,
      maxChargePower,
      model,
      year,
    });

    if (!validation.isValid) {
      setErrorMessage(t(validation.errorKey));
      return;
    }

    try {
      setErrorMessage(null);
      setIsSubmitting(true);

      const createdVehicle = await apiClient.createVehicleProfile(userId, validation.data);

      onboardingSession.setVehicle(createdVehicle);
      router.push('/onboarding/payment');
    } catch (error: unknown) {
      setErrorMessage(
        extractOnboardingErrorMessage(error, t('onboarding.vehicle.errors.createFailed')),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer keyboardAvoiding scroll testID="vehicle-setup-screen">
      <View className="px-6 py-6">
        <View className="mb-2">
          <Text accessibilityRole="header" className="text-[28px] font-bold text-text">
            {t('onboarding.vehicle.title')}
          </Text>
          <Text className="mt-2 text-[15px] text-text-muted">
            {t('onboarding.vehicle.subtitle')}
          </Text>
        </View>

        <View className="mt-5 gap-3">
          <FormField
            accessibilityLabel={t('onboarding.vehicle.fields.make')}
            label={t('onboarding.vehicle.fields.make')}
            onChangeText={setMake}
            placeholder={t('onboarding.vehicle.fields.make')}
            testID="vehicle-make-input"
            value={make}
          />
          <FormField
            accessibilityLabel={t('onboarding.vehicle.fields.model')}
            label={t('onboarding.vehicle.fields.model')}
            onChangeText={setModel}
            placeholder={t('onboarding.vehicle.fields.model')}
            testID="vehicle-model-input"
            value={model}
          />
          <FormField
            accessibilityLabel={t('onboarding.vehicle.fields.year')}
            keyboardType="number-pad"
            label={t('onboarding.vehicle.fields.year')}
            onChangeText={setYear}
            placeholder={t('onboarding.vehicle.fields.year')}
            testID="vehicle-year-input"
            value={year}
          />
          <FormField
            accessibilityLabel={t('onboarding.vehicle.fields.batteryCapacity')}
            keyboardType="decimal-pad"
            label={t('onboarding.vehicle.fields.batteryCapacity')}
            onChangeText={setBatteryCapacity}
            placeholder={t('onboarding.vehicle.fields.batteryCapacity')}
            testID="vehicle-battery-capacity-input"
            value={batteryCapacity}
          />
          <FormField
            accessibilityLabel={t('onboarding.vehicle.fields.maxChargePower')}
            keyboardType="decimal-pad"
            label={t('onboarding.vehicle.fields.maxChargePower')}
            onChangeText={setMaxChargePower}
            placeholder={t('onboarding.vehicle.fields.maxChargePower')}
            testID="vehicle-max-charge-power-input"
            value={maxChargePower}
          />

          <Text className="mt-1 text-sm font-semibold text-text">
            {t('onboarding.vehicle.fields.connectorType')}
          </Text>
          <View className="flex-row flex-wrap">
            {CONNECTOR_OPTIONS.map((option) => {
              const selected = connectorType === option;

              return (
                <Pressable
                  accessibilityRole="button"
                  className={`mb-2.5 mr-2.5 rounded-full border px-3 py-2 active:opacity-75 ${
                    selected ? 'border-primary bg-primary' : 'border-border'
                  }`}
                  key={option}
                  onPress={(): void => {
                    setConnectorType(option);
                  }}
                  testID={`vehicle-connector-${option}`}
                >
                  <Text
                    className={`text-[13px] font-semibold ${
                      selected ? 'text-neutral-0' : 'text-neutral-700'
                    }`}
                  >
                    {t(`onboarding.vehicle.connectorTypes.${option}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {errorMessage ? (
            <Text className="text-sm font-semibold text-danger" testID="vehicle-error">
              {errorMessage}
            </Text>
          ) : null}

          <Button
            disabled={isSubmitting}
            onPress={(): void => {
              void handleSaveVehicle();
            }}
            testID="vehicle-save"
            title={
              isSubmitting
                ? t('onboarding.vehicle.actions.submitting')
                : t('onboarding.vehicle.actions.save')
            }
          />
          <Button
            onPress={(): void => {
              router.push('/onboarding/payment');
            }}
            testID="vehicle-skip"
            title={t('onboarding.vehicle.actions.skip')}
            variant="secondary"
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
