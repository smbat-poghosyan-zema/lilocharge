import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Button } from './button';
import { Card } from './card';
import { FormField } from './form-field';
import { ScreenContainer } from './screen-container';
import { EmptyState, ErrorRetryView, LoadingView } from './state-views';
import { StatusBadge } from './status-badge';

/**
 * UX-P2-04 cheap visual-regression net: render every shared primitive under both the
 * light and dark color schemes and snapshot the tree. This freezes the token classes +
 * scheme-aware color props each primitive ships, so an accidental change to a primitive's
 * styling (or a broken dark-mode wiring) shows up as a snapshot diff in CI without needing
 * a device or emulator. It is deterministic (no timers/network), so it stays non-flaky.
 *
 * On-device screenshots (real Mapbox, notch, keyboard, hy glyphs at size) remain the
 * higher-fidelity check documented in docs/DARK-MODE-AND-VISUAL-REGRESSION.md.
 */
const mockUseColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light');

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: (): 'light' | 'dark' | null => mockUseColorScheme(),
}));

function renderAllPrimitives(): ReturnType<typeof render> {
  return render(
    <ScreenContainer scroll testID="screen">
      <Card testID="card">
        <StatusBadge label="Completed" testID="badge-primary" variant="primary" />
        <StatusBadge label="Failed" testID="badge-danger" variant="danger" />
        <StatusBadge label="Occupied" testID="badge-neutral" variant="neutral" />
        <FormField accessibilityLabel="Email" label="Email" placeholder="you@example.com" testID="field" />
        <Button onPress={jest.fn()} testID="btn-primary" title="Start charging" />
        <Button onPress={jest.fn()} testID="btn-secondary" title="View receipt" variant="secondary" />
        <Button onPress={jest.fn()} testID="btn-danger" title="Stop" variant="danger" />
        <Button accessibilityLabel="Link" onPress={jest.fn()} testID="btn-link" variant="link">
          <Text>Link</Text>
        </Button>
        <LoadingView message="Loading" testID="loading" />
        <ErrorRetryView message="Failed" onRetry={jest.fn()} retryLabel="Retry" testID="error" />
        <EmptyState icon="🔌" message="Nothing here" testID="empty" />
      </Card>
    </ScreenContainer>,
  );
}

describe('primitive visual regression', () => {
  it('matches the light-scheme snapshot', () => {
    mockUseColorScheme.mockReturnValue('light');

    expect(renderAllPrimitives().toJSON()).toMatchSnapshot();
  });

  it('matches the dark-scheme snapshot', () => {
    mockUseColorScheme.mockReturnValue('dark');

    expect(renderAllPrimitives().toJSON()).toMatchSnapshot();
  });
});
