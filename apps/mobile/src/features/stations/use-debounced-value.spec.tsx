import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useDebouncedValue } from './use-debounced-value';

interface DebouncedValueHarnessProps {
  readonly delayMs: number;
  readonly value: string;
}

/**
 * Renders the current debounced value for hook behavior assertions.
 */
function DebouncedValueHarness({ delayMs, value }: DebouncedValueHarnessProps): JSX.Element {
  const debouncedValue = useDebouncedValue(value, delayMs);

  return <Text testID="debounced-value">{debouncedValue}</Text>;
}

describe('useDebouncedValue', () => {
  it('updates the debounced value only after the delay', async () => {
    const rendered = render(<DebouncedValueHarness delayMs={300} value="k" />);

    expect(screen.getByTestId('debounced-value')).toHaveTextContent('k');

    rendered.rerender(<DebouncedValueHarness delayMs={300} value="ke" />);

    expect(screen.getByTestId('debounced-value')).toHaveTextContent('k');

    await waitFor(() => {
      expect(screen.getByTestId('debounced-value')).toHaveTextContent('ke');
    });
  });

  it('uses the latest value when multiple changes happen before timeout', async () => {
    const rendered = render(<DebouncedValueHarness delayMs={250} value="a" />);

    rendered.rerender(<DebouncedValueHarness delayMs={250} value="ab" />);
    rendered.rerender(<DebouncedValueHarness delayMs={250} value="abc" />);

    await waitFor(() => {
      expect(screen.getByTestId('debounced-value')).toHaveTextContent('abc');
    });
  });
});
