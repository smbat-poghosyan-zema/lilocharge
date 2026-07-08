import { fireEvent, render, screen } from '@testing-library/react-native';

import { FormField } from './form-field';

describe('FormField', () => {
  it('renders the label and forwards value/onChangeText', () => {
    const onChangeText = jest.fn();

    render(
      <FormField
        accessibilityLabel="Email address"
        label="Email"
        onChangeText={onChangeText}
        testID="email"
        value=""
      />,
    );

    expect(screen.getByText('Email')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('email'), 'a@b.com');
    expect(onChangeText).toHaveBeenCalledWith('a@b.com');
  });

  it('exposes the accessibility label on the input', () => {
    render(<FormField accessibilityLabel="Password" label="Password" testID="pw" />);

    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('renders an inline error message when provided', () => {
    render(
      <FormField
        accessibilityLabel="Email address"
        error="Invalid email"
        label="Email"
        testID="email"
      />,
    );

    expect(screen.getByTestId('email-error')).toHaveTextContent('Invalid email');
  });

  it('does not render an error node when error is empty', () => {
    render(<FormField accessibilityLabel="Email address" error="" label="Email" testID="email" />);

    expect(screen.queryByTestId('email-error')).toBeNull();
  });

  it('forwards secureTextEntry and keyboardType props to the input', () => {
    render(
      <FormField
        accessibilityLabel="Password"
        keyboardType="email-address"
        label="Password"
        secureTextEntry
        testID="pw"
      />,
    );

    const input = screen.getByTestId('pw');
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.keyboardType).toBe('email-address');
  });
});
