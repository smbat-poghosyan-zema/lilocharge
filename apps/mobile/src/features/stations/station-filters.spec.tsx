import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  type StationFilterState,
  type StationFilterOperatorOption,
  StationFilters,
} from './station-filters';

const OPERATORS: readonly StationFilterOperatorOption[] = [
  {
    id: 'lilocharge',
    name: 'LiloCharge',
  },
  {
    id: 'operator-2',
    name: 'Operator 2',
  },
];

/**
 * Creates default filter state fixture used across station filter UI tests.
 */
function buildDefaultFilterState(): StationFilterState {
  return {
    availabilityStatuses: [],
    connectorTypes: [],
    minimumPowerKw: undefined,
    operatorIds: [],
  };
}

interface StationFiltersHarnessProps {
  readonly onChange: (filters: StationFilterState) => void;
  readonly initialFilters?: StationFilterState;
}

/**
 * Stateful test harness that mimics how StationsScreen controls StationFilters props.
 */
function StationFiltersHarness({
  onChange,
  initialFilters = buildDefaultFilterState(),
}: StationFiltersHarnessProps): JSX.Element {
  const [filters, setFilters] = useState<StationFilterState>(initialFilters);

  return (
    <StationFilters
      filters={filters}
      operators={OPERATORS}
      onChange={(nextFilters): void => {
        setFilters(nextFilters);
        onChange(nextFilters);
      }}
    />
  );
}

describe('StationFilters', () => {
  it('supports multi-select connector chips', () => {
    const onChange = jest.fn<void, [StationFilterState]>();

    render(<StationFiltersHarness onChange={onChange} />);

    fireEvent.press(screen.getByTestId('station-filter-connector-CCS'));
    fireEvent.press(screen.getByTestId('station-filter-connector-TYPE_2'));

    expect(onChange).toHaveBeenNthCalledWith(1, {
      availabilityStatuses: [],
      connectorTypes: [ConnectorType.CCS],
      minimumPowerKw: undefined,
      operatorIds: [],
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      availabilityStatuses: [],
      connectorTypes: [ConnectorType.CCS, ConnectorType.TYPE_2],
      minimumPowerKw: undefined,
      operatorIds: [],
    });
  });

  it('supports selecting minimum power and availability', () => {
    const onChange = jest.fn<void, [StationFilterState]>();

    render(<StationFiltersHarness onChange={onChange} />);

    fireEvent.press(screen.getByTestId('station-filter-power-step-120'));
    fireEvent.press(screen.getByTestId('station-filter-availability-AVAILABLE'));

    expect(onChange).toHaveBeenNthCalledWith(1, {
      availabilityStatuses: [],
      connectorTypes: [],
      minimumPowerKw: 120,
      operatorIds: [],
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      availabilityStatuses: [StationStatus.AVAILABLE],
      connectorTypes: [],
      minimumPowerKw: 120,
      operatorIds: [],
    });
  });

  it('supports operator chips and clear action', () => {
    const onChange = jest.fn<void, [StationFilterState]>();
    const selectedState: StationFilterState = {
      availabilityStatuses: [StationStatus.AVAILABLE],
      connectorTypes: [ConnectorType.CCS],
      minimumPowerKw: 120,
      operatorIds: ['lilocharge'],
    };

    render(<StationFiltersHarness initialFilters={selectedState} onChange={onChange} />);

    fireEvent.press(screen.getByTestId('station-filter-operator-lilocharge'));
    fireEvent.press(screen.getByTestId('station-filter-clear-button'));

    expect(onChange).toHaveBeenNthCalledWith(1, {
      availabilityStatuses: [StationStatus.AVAILABLE],
      connectorTypes: [ConnectorType.CCS],
      minimumPowerKw: 120,
      operatorIds: [],
    });
    expect(onChange).toHaveBeenNthCalledWith(2, buildDefaultFilterState());
  });
});
