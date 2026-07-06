import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { act, render, screen } from '@testing-library/react-native';

import { OfflineBanner } from './offline-banner';

const addEventListenerMock = jest.mocked(NetInfo.addEventListener);

describe('OfflineBanner', () => {
  let capturedListener: ((state: NetInfoState) => void) | null;
  let unsubscribeMock: jest.Mock<void, []>;

  beforeEach(() => {
    capturedListener = null;
    unsubscribeMock = jest.fn<void, []>();
    addEventListenerMock.mockImplementation((listener: (state: NetInfoState) => void) => {
      capturedListener = listener;
      return unsubscribeMock;
    });
  });

  it('renders nothing while the device is connected', () => {
    render(<OfflineBanner />);

    act(() => {
      capturedListener?.(buildNetInfoState(true));
    });

    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('shows the localized offline banner when connectivity is lost', () => {
    render(<OfflineBanner />);

    act(() => {
      capturedListener?.(buildNetInfoState(false));
    });

    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(screen.getByText('Ինտերնետ կապ չկա')).toBeTruthy();
  });

  it('hides the banner again once connectivity is restored', () => {
    render(<OfflineBanner />);

    act(() => {
      capturedListener?.(buildNetInfoState(false));
    });
    expect(screen.getByTestId('offline-banner')).toBeTruthy();

    act(() => {
      capturedListener?.(buildNetInfoState(true));
    });
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('unsubscribes from connectivity events on unmount', () => {
    const rendered = render(<OfflineBanner />);

    rendered.unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * Builds one minimal NetInfo state fixture with the provided connectivity flag.
 */
function buildNetInfoState(isConnected: boolean): NetInfoState {
  return {
    details: null,
    isConnected,
    isInternetReachable: isConnected,
    type: isConnected ? 'wifi' : 'none',
  } as NetInfoState;
}
