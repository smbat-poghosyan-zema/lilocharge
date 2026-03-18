import type { AuthTokenPairResponse } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { VerifyPhoneScreen } from './verify-phone-screen';

const mockPush = jest.fn<void, [string]>();
const mockReplace = jest.fn<void, [string]>();
const mockSetAuthTokenPair = jest.fn<void, [AuthTokenPairResponse]>();

const registrationDraft = {
  displayName: 'Անի Սարգսյան',
  email: 'ani@example.com',
  language: 'hy' as const,
  password: 'Password123!',
  phone: '+37477123456',
};

let mockedState: {
  readonly registrationDraft: typeof registrationDraft | null;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('./onboarding-session', () => ({
  useOnboardingSession: () => ({
    setAuthTokenPair: mockSetAuthTokenPair,
    state: mockedState,
  }),
}));

describe('VerifyPhoneScreen', () => {
  beforeEach(() => {
    mockedState = {
      registrationDraft,
    };
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSetAuthTokenPair.mockReset();
  });

  it('renders fallback when registration draft is missing', () => {
    mockedState = {
      registrationDraft: null,
    };

    render(<VerifyPhoneScreen />);

    expect(screen.getByText('Գրանցման տվյալներ չեն գտնվել: Սկսեք սկզբից:')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Վերադառնալ գրանցմանը' }));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/register');
  });

  it('shows validation error for invalid OTP', async () => {
    render(<VerifyPhoneScreen />);

    fireEvent.changeText(screen.getByLabelText('Հաստատման կոդ'), '12ab56');
    fireEvent.press(screen.getByTestId('verify-phone-continue'));

    await waitFor(() => {
      expect(screen.getByText('Կոդը պետք է լինի 6 թվանշան')).toBeTruthy();
    });
  });

  it('verifies OTP and advances to vehicle setup', async () => {
    const verifyPhoneOtpAndRegister = jest
      .fn<Promise<AuthTokenPairResponse>, [typeof registrationDraft & { readonly code: string }]>()
      .mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
      });

    render(<VerifyPhoneScreen api={{ verifyPhoneOtpAndRegister }} />);

    fireEvent.changeText(screen.getByLabelText('Հաստատման կոդ'), '123456');
    fireEvent.press(screen.getByTestId('verify-phone-continue'));

    await waitFor(() => {
      expect(verifyPhoneOtpAndRegister).toHaveBeenCalledWith({
        code: '123456',
        displayName: registrationDraft.displayName,
        email: registrationDraft.email,
        language: registrationDraft.language,
        password: registrationDraft.password,
        phone: registrationDraft.phone,
      });
      expect(mockSetAuthTokenPair).toHaveBeenCalledWith({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
      });
      expect(mockPush).toHaveBeenCalledWith('/onboarding/vehicle');
    });
  });
});
