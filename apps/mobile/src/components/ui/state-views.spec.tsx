import { fireEvent, render, screen } from '@testing-library/react-native';

import { EmptyState, ErrorRetryView, LoadingView } from './state-views';

describe('LoadingView', () => {
  it('renders with an optional message and testID', () => {
    render(<LoadingView message="Loading session" testID="loading" />);

    expect(screen.getByTestId('loading')).toBeTruthy();
    expect(screen.getByText('Loading session')).toBeTruthy();
  });

  it('renders without a message', () => {
    render(<LoadingView testID="loading" />);

    expect(screen.getByTestId('loading')).toBeTruthy();
  });
});

describe('ErrorRetryView', () => {
  it('renders the message and fires onRetry from the retry button', () => {
    const onRetry = jest.fn();

    render(
      <ErrorRetryView
        message="Something went wrong"
        onRetry={onRetry}
        retryLabel="Retry"
        testID="error"
      />,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    fireEvent.press(screen.getByTestId('error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState', () => {
  it('renders the message and optional icon', () => {
    render(<EmptyState icon="🔌" message="No connectors" testID="empty" />);

    expect(screen.getByTestId('empty')).toBeTruthy();
    expect(screen.getByText('No connectors')).toBeTruthy();
    expect(screen.getByTestId('empty-icon', { includeHiddenElements: true })).toHaveTextContent(
      '🔌',
    );
  });

  it('renders without an icon', () => {
    render(<EmptyState message="No reviews" testID="empty" />);

    expect(screen.getByText('No reviews')).toBeTruthy();
  });
});
