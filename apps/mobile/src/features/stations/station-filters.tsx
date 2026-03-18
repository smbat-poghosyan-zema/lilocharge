import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';

const CONNECTOR_FILTER_OPTIONS: readonly ConnectorType[] = [
  ConnectorType.CCS,
  ConnectorType.CHADEMO,
  ConnectorType.TYPE_1,
  ConnectorType.TYPE_2,
  ConnectorType.TESLA,
  ConnectorType.GBT,
];

const AVAILABILITY_FILTER_OPTIONS: readonly StationStatus[] = [
  StationStatus.AVAILABLE,
  StationStatus.OCCUPIED,
  StationStatus.OFFLINE,
  StationStatus.MAINTENANCE,
];

const POWER_FILTER_STEPS_KW: readonly number[] = [0, 22, 50, 120, 180, 240, 350];

/**
 * Station filter payload used by station map query refresh requests.
 */
export interface StationFilterState {
  readonly connectorTypes: readonly ConnectorType[];
  readonly minimumPowerKw: number | undefined;
  readonly availabilityStatuses: readonly StationStatus[];
  readonly operatorIds: readonly string[];
}

/** Operator chip descriptor shown in station filters. */
export interface StationFilterOperatorOption {
  readonly id: string;
  readonly name: string;
}

interface StationFiltersProps {
  readonly filters: StationFilterState;
  readonly operators: readonly StationFilterOperatorOption[];
  readonly onChange: (filters: StationFilterState) => void;
}

/**
 * Renders station map filtering controls for connector type, power, availability, and operator.
 */
export function StationFilters({ filters, operators, onChange }: StationFiltersProps): JSX.Element {
  const { t } = useAppTranslation();
  const hasActiveFilters = hasAnyActiveFilters(filters);

  return (
    <View style={styles.container} testID="station-filter-container">
      <View style={styles.header}>
        <Text style={styles.title}>{t('stations.map.filters.title')}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={!hasActiveFilters}
          onPress={(): void => {
            onChange(buildDefaultStationFilters());
          }}
          style={({ pressed }) => {
            return [
              styles.clearButton,
              !hasActiveFilters ? styles.clearButtonDisabled : null,
              pressed ? styles.clearButtonPressed : null,
            ];
          }}
          testID="station-filter-clear-button"
        >
          <Text style={styles.clearButtonText}>{t('stations.map.filters.clear')}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>{t('stations.map.filters.connectorTypesLabel')}</Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.chipRow}
        showsHorizontalScrollIndicator={false}
      >
        {CONNECTOR_FILTER_OPTIONS.map((option) => {
          const isSelected = filters.connectorTypes.includes(option);

          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={(): void => {
                onChange({
                  ...filters,
                  connectorTypes: toggleSelection(filters.connectorTypes, option),
                });
              }}
              style={({ pressed }) => {
                return [
                  styles.chip,
                  isSelected ? styles.chipSelected : null,
                  pressed ? styles.chipPressed : null,
                ];
              }}
              testID={`station-filter-connector-${option}`}
            >
              <Text style={isSelected ? styles.chipTextSelected : styles.chipText}>
                {t(`onboarding.vehicle.connectorTypes.${option}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.sectionLabel}>{t('stations.map.filters.powerLabel')}</Text>
      <Text style={styles.powerValueText}>{resolvePowerLabel(filters.minimumPowerKw, t)}</Text>
      <View style={styles.powerTrack}>
        <View
          style={[
            styles.powerTrackFill,
            { width: `${resolvePowerProgressPercent(filters.minimumPowerKw)}%` },
          ]}
        />
      </View>
      <View style={styles.powerSteps}>
        {POWER_FILTER_STEPS_KW.map((step) => {
          const isSelectedStep =
            step === 0 ? filters.minimumPowerKw === undefined : filters.minimumPowerKw === step;

          return (
            <Pressable
              key={step}
              accessibilityRole="button"
              onPress={(): void => {
                onChange({
                  ...filters,
                  minimumPowerKw: step === 0 ? undefined : step,
                });
              }}
              style={({ pressed }) => {
                return [styles.powerStep, pressed ? styles.chipPressed : null];
              }}
              testID={`station-filter-power-step-${step}`}
            >
              <View
                style={[styles.powerStepDot, isSelectedStep ? styles.powerStepDotSelected : null]}
              />
              <Text style={styles.powerStepLabel}>
                {step === 0 ? t('stations.map.filters.powerAnyShort') : step}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>{t('stations.map.filters.availabilityLabel')}</Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.chipRow}
        showsHorizontalScrollIndicator={false}
      >
        {AVAILABILITY_FILTER_OPTIONS.map((status) => {
          const isSelected = filters.availabilityStatuses.includes(status);

          return (
            <Pressable
              key={status}
              accessibilityRole="button"
              onPress={(): void => {
                onChange({
                  ...filters,
                  availabilityStatuses: toggleSelection(filters.availabilityStatuses, status),
                });
              }}
              style={({ pressed }) => {
                return [
                  styles.chip,
                  isSelected ? styles.chipSelected : null,
                  pressed ? styles.chipPressed : null,
                ];
              }}
              testID={`station-filter-availability-${status}`}
            >
              <Text style={isSelected ? styles.chipTextSelected : styles.chipText}>
                {t(`stations.map.sheet.status.${status.toLowerCase()}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.sectionLabel}>{t('stations.map.filters.operatorsLabel')}</Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.chipRow}
        showsHorizontalScrollIndicator={false}
      >
        {operators.map((operator) => {
          const isSelected = filters.operatorIds.includes(operator.id);

          return (
            <Pressable
              key={operator.id}
              accessibilityRole="button"
              onPress={(): void => {
                onChange({
                  ...filters,
                  operatorIds: toggleSelection(filters.operatorIds, operator.id),
                });
              }}
              style={({ pressed }) => {
                return [
                  styles.chip,
                  isSelected ? styles.chipSelected : null,
                  pressed ? styles.chipPressed : null,
                ];
              }}
              testID={`station-filter-operator-${operator.id}`}
            >
              <Text style={isSelected ? styles.chipTextSelected : styles.chipText}>
                {operator.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Creates the default station filter state with all filters disabled.
 */
export function buildDefaultStationFilters(): StationFilterState {
  return {
    availabilityStatuses: [],
    connectorTypes: [],
    minimumPowerKw: undefined,
    operatorIds: [],
  };
}

/**
 * Determines whether at least one station filter dimension is currently active.
 */
export function hasAnyActiveFilters(filters: StationFilterState): boolean {
  return (
    filters.connectorTypes.length > 0 ||
    filters.minimumPowerKw !== undefined ||
    filters.availabilityStatuses.length > 0 ||
    filters.operatorIds.length > 0
  );
}

/**
 * Toggles one string-like value inside a readonly selection array.
 */
function toggleSelection<TSelection extends string>(
  currentSelections: readonly TSelection[],
  value: TSelection,
): readonly TSelection[] {
  if (currentSelections.includes(value)) {
    return currentSelections.filter((entry) => entry !== value);
  }

  return [...currentSelections, value];
}

/**
 * Formats the selected minimum power value for visible filter summary text.
 */
function resolvePowerLabel(
  minimumPowerKw: number | undefined,
  t: (key: string, options?: Readonly<Record<string, number>>) => string,
): string {
  if (minimumPowerKw === undefined) {
    return t('stations.map.filters.powerAny');
  }

  return t('stations.map.filters.powerFrom', {
    value: minimumPowerKw,
  });
}

/**
 * Calculates the visual slider progress for the selected minimum power step.
 */
function resolvePowerProgressPercent(minimumPowerKw: number | undefined): number {
  const selectedStep = minimumPowerKw ?? 0;
  const selectedStepIndex = POWER_FILTER_STEPS_KW.indexOf(selectedStep);

  if (selectedStepIndex <= 0) {
    return 0;
  }

  return (selectedStepIndex / (POWER_FILTER_STEPS_KW.length - 1)) * 100;
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipRow: {
    paddingBottom: 4,
    paddingRight: 2,
  },
  chipSelected: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },
  chipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearButtonDisabled: {
    opacity: 0.6,
  },
  clearButtonPressed: {
    opacity: 0.75,
  },
  clearButtonText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '700',
  },
  container: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#E2E8F0',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  powerStep: {
    alignItems: 'center',
    flex: 1,
  },
  powerStepDot: {
    backgroundColor: '#CBD5E1',
    borderColor: '#94A3B8',
    borderRadius: 6,
    borderWidth: 1,
    height: 12,
    marginBottom: 4,
    width: 12,
  },
  powerStepDotSelected: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },
  powerStepLabel: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '600',
  },
  powerSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  powerTrack: {
    backgroundColor: '#CBD5E1',
    borderRadius: 999,
    height: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  powerTrackFill: {
    backgroundColor: '#166534',
    height: '100%',
  },
  powerValueText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionLabel: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
  },
  title: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
});
