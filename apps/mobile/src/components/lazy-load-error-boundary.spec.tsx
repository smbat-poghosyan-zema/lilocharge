import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LazyLoadErrorBoundary } from './lazy-load-error-boundary';

const ThrowError = (): JSX.Element => {
  throw new Error('Test error');
};

describe('LazyLoadErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {
      // Suppress error logging in tests
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <LazyLoadErrorBoundary>
        <Text>Test content</Text>
      </LazyLoadErrorBoundary>,
    );

    expect(getByText('Test content')).toBeTruthy();
  });

  it('renders default fallback when error occurs', () => {
    const { getByText } = render(
      <LazyLoadErrorBoundary>
        <ThrowError />
      </LazyLoadErrorBoundary>,
    );

    // Default fallback is now localized (hy is the default/fallback locale).
    expect(getByText('Չհաջողվեց բեռնել էկրանը')).toBeTruthy();
  });

  it('renders custom fallback when provided', () => {
    const { getByText } = render(
      <LazyLoadErrorBoundary fallback={<Text>Custom error message</Text>}>
        <ThrowError />
      </LazyLoadErrorBoundary>,
    );

    expect(getByText('Custom error message')).toBeTruthy();
  });

  it('logs error to console', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error');

    render(
      <LazyLoadErrorBoundary>
        <ThrowError />
      </LazyLoadErrorBoundary>,
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
