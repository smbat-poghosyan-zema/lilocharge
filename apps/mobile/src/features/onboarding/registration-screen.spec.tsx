import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { RegistrationScreen } from './registration-screen';

const mockPush = jest.fn<void, [string]>();
const mockSetRegistrationDraft = jest.fn<void, [unknown]>();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
  }),
}));

jest.mock('./onboarding-session', () => ({
  useOnboardingSession: () => ({
    setRegistrationDraft: mockSetRegistrationDraft,
  }),
}));

describe('RegistrationScreen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockSetRegistrationDraft.mockReset();
  });

  it('renders Armenian onboarding registration copy', () => {
    render(<RegistrationScreen />);

    expect(screen.getByRole('header', { name: 'Ստեղծեք հաշիվ' })).toBeTruthy();
    expect(screen.getByText('Գրանցվեք, որպեսզի սկսեք լիցքավորել LiloCharge-ով:')).toBeTruthy();
  });

  it('shows validation error for invalid phone number', async () => {
    const requestPhoneOtp = jest.fn<
      Promise<{ readonly expiresInSeconds: number; readonly message: string }>,
      [{ readonly phone: string }]
    >();

    render(<RegistrationScreen api={{ requestPhoneOtp }} />);

    fireEvent.changeText(screen.getByLabelText('Անուն և ազգանուն'), 'Անի Սարգսյան');
    fireEvent.changeText(screen.getByLabelText('Էլ. հասցե'), 'ani@example.com');
    fireEvent.changeText(screen.getByLabelText('Հեռախոսահամար'), '077123456');
    fireEvent.changeText(screen.getByLabelText('Գաղտնաբառ'), 'Password123!');
    fireEvent.press(screen.getByTestId('registration-continue'));

    await waitFor(() => {
      expect(screen.getByText('Մուտքագրեք վավեր հեռախոսահամար (+374...)')).toBeTruthy();
    });
    expect(requestPhoneOtp).not.toHaveBeenCalled();
  });

  it('submits registration and navigates to phone verification', async () => {
    const requestPhoneOtp = jest
      .fn<
        Promise<{ readonly expiresInSeconds: number; readonly message: string }>,
        [{ readonly phone: string }]
      >()
      .mockResolvedValue({
        expiresInSeconds: 300,
        message: 'OTP sent successfully',
      });

    render(<RegistrationScreen api={{ requestPhoneOtp }} />);

    fireEvent.changeText(screen.getByLabelText('Անուն և ազգանուն'), '  Անի Սարգսյան ');
    fireEvent.changeText(screen.getByLabelText('Էլ. հասցե'), ' ANI@EXAMPLE.COM ');
    fireEvent.changeText(screen.getByLabelText('Հեռախոսահամար'), ' +37477123456 ');
    fireEvent.changeText(screen.getByLabelText('Գաղտնաբառ'), 'Password123!');
    fireEvent.press(screen.getByTestId('registration-continue'));

    await waitFor(() => {
      expect(requestPhoneOtp).toHaveBeenCalledWith({ phone: '+37477123456' });
      expect(mockSetRegistrationDraft).toHaveBeenCalledWith({
        displayName: 'Անի Սարգսյան',
        email: 'ani@example.com',
        language: 'hy',
        password: 'Password123!',
        phone: '+37477123456',
      });
      expect(mockPush).toHaveBeenCalledWith('/onboarding/verify-phone');
    });
  });
});
