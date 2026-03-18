import { render, screen } from '@testing-library/react-native';

import { ProfileScreen } from './profile-screen';

describe('ProfileScreen', () => {
  it('renders Armenian profile content', () => {
    render(<ProfileScreen />);

    expect(screen.getByRole('header', { name: 'Անձնական հաշիվ' })).toBeTruthy();
    expect(screen.getByText('Կառավարեք նախընտրությունները և ծանուցումները:')).toBeTruthy();
  });

  it('shows API base URL label', () => {
    render(<ProfileScreen />);

    expect(screen.getByTestId('api-base-url')).toHaveTextContent('API: http://localhost:3000');
  });
});
