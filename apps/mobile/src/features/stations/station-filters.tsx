import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { Pressable, ScrollView, Text, View } from 'react-native';

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

const CHIP_ROW_CONTENT_CLASS = 'pb-1 pr-0.5';
const CHIP_BASE = 'mr-2 rounded-full border px-2.5 py-1.5 active:opacity-75';
const CHIP_UNSELECTED = 'border-border bg-neutral-0';
const CHIP_SELECTED = 'border-primary bg-primary';

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
    <View
      className="mb-2.5 w-full rounded-lg border border-border bg-neutral-0/95 p-3"
      testID="station-filter-container"
    >
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-[13px] font-bold text-neutral-900">
          {t('stations.map.filters.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          className={`rounded-full bg-neutral-200 px-2.5 py-[5px] active:opacity-75 ${
            hasActiveFilters ? '' : 'opacity-60'
          }`}
          disabled={!hasActiveFilters}
          onPress={(): void => {
            onChange(buildDefaultStationFilters());
          }}
          testID="station-filter-clear-button"
        >
          <Text className="text-[11px] font-bold text-neutral-900">
            {t('stations.map.filters.clear')}
          </Text>
        </Pressable>
      </View>

      <Text className="mb-1.5 mt-1 text-xs font-bold text-neutral-900">
        {t('stations.map.filters.connectorTypesLabel')}
      </Text>
      <ScrollView horizontal contentContainerClassName={CHIP_ROW_CONTENT_CLASS} showsHorizontalScrollIndicator={false}>
        {CONNECTOR_FILTER_OPTIONS.map((option) => {
          const isSelected = filters.connectorTypes.includes(option);

          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              className={`${CHIP_BASE} ${isSelected ? CHIP_SELECTED : CHIP_UNSELECTED}`}
              onPress={(): void => {
                onChange({
                  ...filters,
                  connectorTypes: toggleSelection(filters.connectorTypes, option),
                });
              }}
              testID={`station-filter-connector-${option}`}
            >
              <Text
                className={`text-xs font-semibold ${isSelected ? 'text-neutral-0' : 'text-neutral-700'}`}
              >
                {t(`onboarding.vehicle.connectorTypes.${option}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text className="mb-1.5 mt-1 text-xs font-bold text-neutral-900">
        {t('stations.map.filters.powerLabel')}
      </Text>
      <Text className="mb-1.5 text-xs font-bold text-neutral-900">
        {resolvePowerLabel(filters.minimumPowerKw, t)}
      </Text>
      <View className="mb-2 h-1 overflow-hidden rounded-full bg-neutral-200">
        <View
          className="h-full bg-primary"
          style={{ width: `${resolvePowerProgressPercent(filters.minimumPowerKw)}%` }}
        />
      </View>
      <View className="mb-2.5 flex-row justify-between">
        {POWER_FILTER_STEPS_KW.map((step) => {
          const isSelectedStep =
            step === 0 ? filters.minimumPowerKw === undefined : filters.minimumPowerKw === step;

          return (
            <Pressable
              key={step}
              accessibilityRole="button"
              className="flex-1 items-center active:opacity-75"
              onPress={(): void => {
                onChange({
                  ...filters,
                  minimumPowerKw: step === 0 ? undefined : step,
                });
              }}
              testID={`station-filter-power-step-${step}`}
            >
              <View
                className={`mb-1 h-3 w-3 rounded-[6px] border ${
                  isSelectedStep ? 'border-primary bg-primary' : 'border-neutral-400 bg-neutral-200'
                }`}
              />
              <Text className="text-[10px] font-semibold text-neutral-700">
                {step === 0 ? t('stations.map.filters.powerAnyShort') : step}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mb-1.5 mt-1 text-xs font-bold text-neutral-900">
        {t('stations.map.filters.availabilityLabel')}
      </Text>
      <ScrollView horizontal contentContainerClassName={CHIP_ROW_CONTENT_CLASS} showsHorizontalScrollIndicator={false}>
        {AVAILABILITY_FILTER_OPTIONS.map((status) => {
          const isSelected = filters.availabilityStatuses.includes(status);

          return (
            <Pressable
              key={status}
              accessibilityRole="button"
              className={`${CHIP_BASE} ${isSelected ? CHIP_SELECTED : CHIP_UNSELECTED}`}
              onPress={(): void => {
                onChange({
                  ...filters,
                  availabilityStatuses: toggleSelection(filters.availabilityStatuses, status),
                });
              }}
              testID={`station-filter-availability-${status}`}
            >
              <Text
                className={`text-xs font-semibold ${isSelected ? 'text-neutral-0' : 'text-neutral-700'}`}
              >
                {t(`stations.map.sheet.status.${status.toLowerCase()}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text className="mb-1.5 mt-1 text-xs font-bold text-neutral-900">
        {t('stations.map.filters.operatorsLabel')}
      </Text>
      <ScrollView horizontal contentContainerClassName={CHIP_ROW_CONTENT_CLASS} showsHorizontalScrollIndicator={false}>
        {operators.map((operator) => {
          const isSelected = filters.operatorIds.includes(operator.id);

          return (
            <Pressable
              key={operator.id}
              accessibilityRole="button"
              className={`${CHIP_BASE} ${isSelected ? CHIP_SELECTED : CHIP_UNSELECTED}`}
              onPress={(): void => {
                onChange({
                  ...filters,
                  operatorIds: toggleSelection(filters.operatorIds, operator.id),
                });
              }}
              testID={`station-filter-operator-${operator.id}`}
            >
              <Text
                className={`text-xs font-semibold ${isSelected ? 'text-neutral-0' : 'text-neutral-700'}`}
              >
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
