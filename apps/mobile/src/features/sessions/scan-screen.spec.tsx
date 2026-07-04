import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ScanScreen } from './scan-screen';

const CONNECTOR_ID = '22222222-2222-2222-2222-222222222222';
const STATION_ID = '11111111-1111-1111-1111-111111111111';

const mockPush = jest.fn<void, [string]>();
let mockPermission: { granted: boolean } | null;
const mockRequestPermission = jest.fn<Promise<{ granted: boolean }>, []>();
let mockCameraProps: Record<string, unknown> | null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void): void => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');

    useEffect(callback, [callback]);
  },
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');

  return {
    CameraView: (props: Record<string, unknown>): JSX.Element => {
      mockCameraProps = props;

      return React.createElement(View, { testID: 'scan-camera' });
    },
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  };
});

/**
 * Emits one scanned barcode payload through the mocked camera view.
 */
function emitBarcode(data: string): void {
  const onBarcodeScanned = mockCameraProps?.onBarcodeScanned as (result: {
    data: string;
    type: string;
  }) => void;

  act(() => {
    onBarcodeScanned({ data, type: 'qr' });
  });
}

describe('ScanScreen', () => {
  beforeEach(() => {
    mockPermission = { granted: true };
    mockCameraProps = null;
  });

  it('shows the permission request UI and requests access on demand', () => {
    mockPermission = { granted: false };
    mockRequestPermission.mockResolvedValue({ granted: true });

    render(<ScanScreen />);

    expect(screen.getByTestId('scan-permission')).toBeTruthy();
    expect(screen.queryByTestId('scan-camera')).toBeNull();

    fireEvent.press(screen.getByTestId('scan-permission-grant'));

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('navigates to the confirm screen when a valid QR deep link is scanned', () => {
    render(<ScanScreen />);

    emitBarcode(`lilocharge://charge?connectorId=${CONNECTOR_ID}&stationId=${STATION_ID}`);

    expect(mockPush).toHaveBeenCalledWith(
      `/charge/confirm?connectorId=${CONNECTOR_ID}&stationId=${STATION_ID}`,
    );
  });

  it('navigates only once for repeated scan events', () => {
    render(<ScanScreen />);

    emitBarcode(CONNECTOR_ID);
    emitBarcode(CONNECTOR_ID);
    emitBarcode(CONNECTOR_ID);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(`/charge/confirm?connectorId=${CONNECTOR_ID}`);
  });

  it('navigates from the manual entry fallback with a raw connector UUID', () => {
    render(<ScanScreen />);

    fireEvent.changeText(screen.getByTestId('scan-manual-input'), ` ${CONNECTOR_ID} `);
    fireEvent.press(screen.getByTestId('scan-manual-submit'));

    expect(mockPush).toHaveBeenCalledWith(`/charge/confirm?connectorId=${CONNECTOR_ID}`);
  });

  it('shows a localized error for unparseable manual input', () => {
    render(<ScanScreen />);

    fireEvent.changeText(screen.getByTestId('scan-manual-input'), 'not-a-code');
    fireEvent.press(screen.getByTestId('scan-manual-submit'));

    expect(screen.getByTestId('scan-error')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps the manual entry fallback available while permission is missing', () => {
    mockPermission = null;

    render(<ScanScreen />);

    fireEvent.changeText(screen.getByTestId('scan-manual-input'), CONNECTOR_ID);
    fireEvent.press(screen.getByTestId('scan-manual-submit'));

    expect(mockPush).toHaveBeenCalledWith(`/charge/confirm?connectorId=${CONNECTOR_ID}`);
  });
});
