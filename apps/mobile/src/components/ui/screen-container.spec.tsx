import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ScreenContainer } from './screen-container';

describe('ScreenContainer', () => {
  it('renders children and exposes the testID', () => {
    render(
      <ScreenContainer testID="screen">
        <Text>Body</Text>
      </ScreenContainer>,
    );

    expect(screen.getByTestId('screen')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('renders content inside a scroll view when scroll is set', () => {
    render(
      <ScreenContainer scroll testID="screen">
        <Text>Scrollable</Text>
      </ScreenContainer>,
    );

    expect(screen.getByText('Scrollable')).toBeTruthy();
  });

  it('renders content inside a keyboard-avoiding view when requested', () => {
    render(
      <ScreenContainer keyboardAvoiding scroll testID="screen">
        <Text>Form</Text>
      </ScreenContainer>,
    );

    expect(screen.getByText('Form')).toBeTruthy();
  });
});
