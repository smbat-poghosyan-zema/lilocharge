import { ConnectorType } from '@lilocharge/shared-types';
import type { ApiErrorResponse } from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiClientError } from '../../api';
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
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('onboarding.vehicle.title')}
        </Text>
        <Text style={styles.subtitle}>{t('onboarding.vehicle.missingUser')}</Text>
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
            {t('onboarding.vehicle.actions.backToRegistration')}
          </Text>
        </Pressable>
      </View>
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
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
      testID="vehicle-setup-screen"
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('onboarding.vehicle.title')}
        </Text>
        <Text style={styles.subtitle}>{t('onboarding.vehicle.subtitle')}</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          accessibilityLabel={t('onboarding.vehicle.fields.make')}
          placeholder={t('onboarding.vehicle.fields.make')}
          style={styles.input}
          testID="vehicle-make-input"
          value={make}
          onChangeText={setMake}
        />
        <TextInput
          accessibilityLabel={t('onboarding.vehicle.fields.model')}
          placeholder={t('onboarding.vehicle.fields.model')}
          style={styles.input}
          testID="vehicle-model-input"
          value={model}
          onChangeText={setModel}
        />
        <TextInput
          accessibilityLabel={t('onboarding.vehicle.fields.year')}
          keyboardType="number-pad"
          placeholder={t('onboarding.vehicle.fields.year')}
          style={styles.input}
          testID="vehicle-year-input"
          value={year}
          onChangeText={setYear}
        />
        <TextInput
          accessibilityLabel={t('onboarding.vehicle.fields.batteryCapacity')}
          keyboardType="decimal-pad"
          placeholder={t('onboarding.vehicle.fields.batteryCapacity')}
          style={styles.input}
          testID="vehicle-battery-capacity-input"
          value={batteryCapacity}
          onChangeText={setBatteryCapacity}
        />
        <TextInput
          accessibilityLabel={t('onboarding.vehicle.fields.maxChargePower')}
          keyboardType="decimal-pad"
          placeholder={t('onboarding.vehicle.fields.maxChargePower')}
          style={styles.input}
          testID="vehicle-max-charge-power-input"
          value={maxChargePower}
          onChangeText={setMaxChargePower}
        />

        <Text style={styles.connectorLabel}>{t('onboarding.vehicle.fields.connectorType')}</Text>
        <View style={styles.connectorGrid}>
          {CONNECTOR_OPTIONS.map((option) => {
            const selected = connectorType === option;

            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                style={({ pressed }): object[] => [
                  styles.connectorChip,
                  selected ? styles.connectorChipSelected : {},
                  pressed ? styles.buttonPressed : {},
                ]}
                testID={`vehicle-connector-${option}`}
                onPress={(): void => {
                  setConnectorType(option);
                }}
              >
                <Text
                  style={selected ? styles.connectorChipTextSelected : styles.connectorChipText}
                >
                  {t(`onboarding.vehicle.connectorTypes.${option}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {errorMessage ? (
          <Text style={styles.errorText} testID="vehicle-error">
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
          testID="vehicle-save"
          onPress={(): void => {
            void handleSaveVehicle();
          }}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting
              ? t('onboarding.vehicle.actions.submitting')
              : t('onboarding.vehicle.actions.save')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }): object[] => [
            styles.secondaryButton,
            pressed ? styles.buttonPressed : {},
          ]}
          testID="vehicle-skip"
          onPress={(): void => {
            router.push('/onboarding/payment');
          }}
        >
          <Text style={styles.secondaryButtonText}>{t('onboarding.vehicle.actions.skip')}</Text>
        </Pressable>
      </View>
    </ScrollView>
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
  connectorChip: {
    borderColor: '#D1D5DB',
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 10,
    marginRight: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  connectorChipSelected: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },
  connectorChipText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  connectorChipTextSelected: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  connectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    marginTop: 8,
  },
  connectorLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
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
    marginTop: 20,
  },
  header: {
    marginBottom: 8,
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
  scrollContainer: {
    backgroundColor: '#FFFFFF',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#166534',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
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
