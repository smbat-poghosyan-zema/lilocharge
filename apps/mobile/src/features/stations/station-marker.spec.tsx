import { StationStatus } from '@lilocharge/shared-types';
import { render, screen } from '@testing-library/react-native';

import { StationMarker } from './station-marker';

describe('StationMarker', () => {
  it('renders marker title', () => {
    render(
      <StationMarker
        connectorCount={2}
        powerTier="DC"
        status={StationStatus.AVAILABLE}
        title="Kentron Hub"
      />,
    );

    expect(screen.getByText('Kentron Hub')).toBeTruthy();
  });
});
