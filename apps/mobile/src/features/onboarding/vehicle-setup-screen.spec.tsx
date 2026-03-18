import type { CreateVehicleRequest, VehicleResponse } from '@lilocharge/shared-types';
import { ConnectorType } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { VehicleSetupScreen } from './vehicle-setup-screen';

const mockPush = jest.fn<void, [string]>();
const mockReplace = jest.fn<void, [string]>();
const mockSetVehicle = jest.fn<void, [VehicleResponse]>();

let mockedState: {
  readonly userId: string | null;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('./onboarding-session', () => ({
  useOnboardingSession: () => ({
    setVehicle: mockSetVehicle,
    state: mockedState,
  }),
}));

describe('VehicleSetupScreen', () => {
  beforeEach(() => {
    mockedState = {
      userId: '11111111-1111-1111-1111-111111111111',
    };
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSetVehicle.mockReset();
  });

  it('renders fallback when user id is missing', () => {
    mockedState = {
      userId: null,
    };

    render(<VehicleSetupScreen />);

    expect(screen.getByText('Հաշվի տվյալներ չեն գտնվել: Վերադարձեք գրանցման փուլ:')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Վերադառնալ գրանցմանը' }));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/register');
  });

  it('shows validation error for invalid year', async () => {
    render(<VehicleSetupScreen />);

    fireEvent.changeText(screen.getByLabelText('Մակնիշ (օր.՝ Kia)'), 'Kia');
    fireEvent.changeText(screen.getByLabelText('Մոդել (օր.՝ EV6)'), 'EV6');
    fireEvent.changeText(screen.getByLabelText('Թողարկման տարեթիվ'), '1900');
    fireEvent.changeText(screen.getByLabelText('Մարտկոցի տարողություն (kWh)'), '64');
    fireEvent.changeText(screen.getByLabelText('Առավելագույն լիցքավորման հզորություն (kW)'), '240');
    fireEvent.press(screen.getByTestId('vehicle-save'));

    await waitFor(() => {
      expect(screen.getByText('Մուտքագրեք վավեր տարեթիվ')).toBeTruthy();
    });
  });

  it('creates vehicle and navigates to payment step', async () => {
    const createVehicleProfile = jest
      .fn<Promise<VehicleResponse>, [string, CreateVehicleRequest]>()
      .mockResolvedValue({
        batteryCapacity: 64,
        connectorType: ConnectorType.CCS,
        createdAt: '2026-02-17T00:00:00.000Z',
        id: 'vehicle-id',
        make: 'Kia',
        maxChargePower: 240,
        model: 'EV6',
        updatedAt: '2026-02-17T00:00:00.000Z',
        userId: '11111111-1111-1111-1111-111111111111',
        year: 2024,
      });

    render(<VehicleSetupScreen api={{ createVehicleProfile }} />);

    fireEvent.changeText(screen.getByLabelText('Մակնիշ (օր.՝ Kia)'), 'Kia');
    fireEvent.changeText(screen.getByLabelText('Մոդել (օր.՝ EV6)'), 'EV6');
    fireEvent.changeText(screen.getByLabelText('Թողարկման տարեթիվ'), '2024');
    fireEvent.changeText(screen.getByLabelText('Մարտկոցի տարողություն (kWh)'), '64');
    fireEvent.changeText(screen.getByLabelText('Առավելագույն լիցքավորման հզորություն (kW)'), '240');
    fireEvent.press(screen.getByRole('button', { name: 'CCS' }));
    fireEvent.press(screen.getByTestId('vehicle-save'));

    await waitFor(() => {
      expect(createVehicleProfile).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', {
        batteryCapacity: 64,
        connectorType: ConnectorType.CCS,
        make: 'Kia',
        maxChargePower: 240,
        model: 'EV6',
        year: 2024,
      });
      expect(mockSetVehicle).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/onboarding/payment');
    });
  });
});
