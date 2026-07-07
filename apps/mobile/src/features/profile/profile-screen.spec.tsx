import type { UserProfileResponse, VehicleResponse } from '@lilocharge/shared-types';
import { ConnectorType } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import i18n from '../../i18n/i18n';
import { persistLanguage } from '../../i18n/language-preference';
import { ProfileScreen } from './profile-screen';

const USER_ID = '11111111-1111-1111-1111-111111111111';

const mockPush = jest.fn<void, [string]>();
const mockReplace = jest.fn<void, [string]>();
const mockResetOnboarding = jest.fn<void, []>();
const mockLogout = jest.fn<void, []>();

let mockedSessionState: { userId: string | null };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('../onboarding/onboarding-session', () => ({
  useOnboardingSession: () => ({
    logout: mockLogout,
    resetOnboarding: mockResetOnboarding,
    state: mockedSessionState,
  }),
}));

jest.mock('../../i18n/language-preference', () => ({
  persistLanguage: jest.fn(),
  readPersistedLanguage: jest.fn(() => null),
}));

const USER_PROFILE: UserProfileResponse = {
  createdAt: '2026-01-01T00:00:00.000Z',
  displayName: 'Anna Petrosyan',
  email: 'anna@example.com',
  id: USER_ID,
  language: 'hy',
  marketingNotificationsEnabled: false,
  phone: '+37477123456',
  pushNotificationsEnabled: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const VEHICLES: VehicleResponse[] = [
  {
    batteryCapacity: 77,
    connectorType: ConnectorType.CCS,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: '22222222-2222-2222-2222-222222222222',
    make: 'Kia',
    maxChargePower: 240,
    model: 'EV6',
    updatedAt: '2026-01-01T00:00:00.000Z',
    userId: USER_ID,
    year: 2024,
  },
];

interface ProfileApiClientMock {
  readonly getUserProfile: jest.Mock<Promise<UserProfileResponse>, [string]>;
  readonly getUserVehicles: jest.Mock<Promise<VehicleResponse[]>, [string]>;
  readonly updateUserLanguage: jest.Mock<Promise<UserProfileResponse>, [string, string]>;
}

function createProfileApiClientMock(): ProfileApiClientMock {
  return {
    getUserProfile: jest.fn<Promise<UserProfileResponse>, [string]>(() => {
      return Promise.resolve(USER_PROFILE);
    }),
    getUserVehicles: jest.fn<Promise<VehicleResponse[]>, [string]>(() => {
      return Promise.resolve(VEHICLES);
    }),
    updateUserLanguage: jest.fn<Promise<UserProfileResponse>, [string, string]>(() => {
      return Promise.resolve(USER_PROFILE);
    }),
  };
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockedSessionState = { userId: USER_ID };
    mockLogout.mockReset();
    mockResetOnboarding.mockReset();
  });

  afterEach(async () => {
    await i18n.changeLanguage('hy');
  });

  it('renders Armenian profile header content', () => {
    render(<ProfileScreen profileApiClient={createProfileApiClientMock()} />);

    expect(screen.getByRole('header', { name: 'Անձնական հաշիվ' })).toBeTruthy();
    expect(screen.getByText('Կառավարեք նախընտրությունները և ծանուցումները:')).toBeTruthy();
  });

  it('shows a loading state while the account request is pending', () => {
    const profileApiClient = createProfileApiClientMock();

    profileApiClient.getUserProfile.mockImplementation(() => {
      return new Promise<UserProfileResponse>(() => {
        // Intentionally never resolves to keep the loading state visible.
      });
    });

    render(<ProfileScreen profileApiClient={profileApiClient} />);

    expect(screen.getByTestId('profile-loading')).toBeTruthy();
  });

  it('renders account details and vehicles for an authenticated user', async () => {
    const profileApiClient = createProfileApiClientMock();

    render(<ProfileScreen profileApiClient={profileApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-account')).toBeTruthy();
    });

    expect(profileApiClient.getUserProfile).toHaveBeenCalledWith(USER_ID);
    expect(profileApiClient.getUserVehicles).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByTestId('profile-display-name')).toHaveTextContent('Anna Petrosyan');
    expect(screen.getByTestId('profile-email')).toHaveTextContent('anna@example.com');
    expect(screen.getByTestId('profile-phone')).toHaveTextContent('+37477123456');
    expect(
      screen.getByTestId('profile-vehicle-22222222-2222-2222-2222-222222222222'),
    ).toBeTruthy();
    expect(screen.getByText('Kia EV6 · 2024')).toBeTruthy();
    expect(screen.getByText(/CCS/)).toBeTruthy();
    expect(screen.getByText(/77 kWh/)).toBeTruthy();
  });

  it('shows an empty vehicles message when the user has no vehicles', async () => {
    const profileApiClient = createProfileApiClientMock();

    profileApiClient.getUserVehicles.mockResolvedValue([]);

    render(<ProfileScreen profileApiClient={profileApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-vehicles-empty')).toBeTruthy();
    });
  });

  it('shows an error state with retry when the account request fails', async () => {
    const profileApiClient = createProfileApiClientMock();

    profileApiClient.getUserProfile.mockRejectedValueOnce(new Error('network down'));

    render(<ProfileScreen profileApiClient={profileApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-load-error')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('profile-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-account')).toBeTruthy();
    });

    expect(profileApiClient.getUserProfile).toHaveBeenCalledTimes(2);
  });

  it('shows a sign-in prompt without account requests when signed out', () => {
    mockedSessionState = { userId: null };

    const profileApiClient = createProfileApiClientMock();

    render(<ProfileScreen profileApiClient={profileApiClient} />);

    expect(screen.getByTestId('profile-signed-out')).toBeTruthy();
    expect(screen.queryByTestId('profile-logout')).toBeNull();
    expect(profileApiClient.getUserProfile).not.toHaveBeenCalled();
    expect(profileApiClient.getUserVehicles).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('profile-sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/login');
  });

  it('navigates to the payment methods screen from the navigation row', () => {
    render(<ProfileScreen profileApiClient={createProfileApiClientMock()} />);

    fireEvent.press(screen.getByTestId('profile-payment-methods'));

    expect(mockPush).toHaveBeenCalledWith('/payment-methods');
  });

  it('navigates to the wallet screen from the navigation row', () => {
    render(<ProfileScreen profileApiClient={createProfileApiClientMock()} />);

    fireEvent.press(screen.getByTestId('profile-wallet'));

    expect(mockPush).toHaveBeenCalledWith('/wallet');
  });

  it('clears the session and navigates to onboarding on logout', async () => {
    const profileApiClient = createProfileApiClientMock();

    render(<ProfileScreen profileApiClient={profileApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-logout')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('profile-logout'));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/onboarding/register');
  });

  it('changes, persists, and syncs the language when selecting an option', async () => {
    const profileApiClient = createProfileApiClientMock();

    render(<ProfileScreen profileApiClient={profileApiClient} />);

    expect(screen.getByTestId('profile-language-hy')).toBeTruthy();
    expect(screen.getByText('Հայերեն')).toBeTruthy();
    expect(screen.getByText('Русский')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();

    fireEvent.press(screen.getByTestId('profile-language-ru'));

    await waitFor(() => {
      expect(i18n.language).toBe('ru');
    });

    expect(persistLanguage).toHaveBeenCalledWith('ru');
    expect(profileApiClient.updateUserLanguage).toHaveBeenCalledWith(USER_ID, 'ru');
    expect(screen.getByText('Личный кабинет')).toBeTruthy();
  });

  it('skips the backend language sync when signed out', async () => {
    mockedSessionState = { userId: null };

    const profileApiClient = createProfileApiClientMock();

    render(<ProfileScreen profileApiClient={profileApiClient} />);

    fireEvent.press(screen.getByTestId('profile-language-en'));

    await waitFor(() => {
      expect(i18n.language).toBe('en');
    });

    expect(persistLanguage).toHaveBeenCalledWith('en');
    expect(profileApiClient.updateUserLanguage).not.toHaveBeenCalled();
  });
});
