import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Button } from './button';

describe('Button', () => {
  it('renders its title and fires onPress', () => {
    const onPress = jest.fn();

    render(<Button onPress={onPress} testID="btn" title="Start charging" />);

    expect(screen.getByText('Start charging')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('derives the accessibility label from the title', () => {
    render(<Button onPress={jest.fn()} testID="btn" title="Done" />);

    expect(screen.getByLabelText('Done')).toBeTruthy();
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();

    render(<Button disabled onPress={onPress} testID="btn" title="Done" />);

    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows an inline spinner and blocks presses while loading', () => {
    const onPress = jest.fn();

    render(<Button loading onPress={onPress} testID="btn" title="Done" />);

    expect(screen.getByTestId('btn-loading')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders custom children with a required accessibility label', () => {
    render(
      <Button accessibilityLabel="Custom action" onPress={jest.fn()} testID="btn">
        <Text>Child content</Text>
      </Button>,
    );

    expect(screen.getByText('Child content')).toBeTruthy();
    expect(screen.getByLabelText('Custom action')).toBeTruthy();
  });

  it('applies the requested variant class to the container', () => {
    render(<Button onPress={jest.fn()} testID="btn" title="Delete" variant="danger" />);

    expect(screen.getByTestId('btn').props.className).toContain('bg-danger');
  });

  it('marks the button busy for assistive tech while loading', () => {
    render(<Button loading onPress={jest.fn()} testID="btn" title="Done" />);

    expect(screen.getByTestId('btn').props.accessibilityState).toMatchObject({ busy: true });
  });
});
