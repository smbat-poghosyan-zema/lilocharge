import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useThemeColors } from '../../theme/use-theme-colors';
import { Button } from './button';
import { Card } from './card';
import { FormField } from './form-field';
import { ScreenContainer } from './screen-container';
import { LoadingView } from './state-views';
import { StatusBadge } from './status-badge';

/**
 * UX-P2-02 dark-mode guard.
 *
 * className-based token flipping happens in the Metro CSS runtime, which jest does not
 * execute (className is a passthrough string here), so these tests verify the two things
 * that ARE observable in jest:
 *   1. the scheme-aware literal colors (`useThemeColors`, used by the RN color-prop APIs)
 *      resolve to the correct light/dark values, and the FormField/Button consume them;
 *   2. every primitive renders without crashing under a mocked dark color scheme and the
 *      dark-aware utility classes are present on the tree.
 * True visual verification of the CSS-variable flip is covered by the screenshot runbook
 * (UX-P2-04).
 *
 * The device color scheme is driven by React Native's `useColorScheme`, which resolves to
 * `require('react-native/Libraries/Utilities/useColorScheme').default`; mocking that
 * submodule is the reliable way to force a scheme in jest.
 */
const mockUseColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light');

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: (): 'light' | 'dark' | null => mockUseColorScheme(),
}));

function ThemeProbe(): JSX.Element {
  const colors = useThemeColors();

  return (
    <Text testID="probe">{`${colors.primary}|${colors.muted}|${colors.text}|${colors.onColor}`}</Text>
  );
}

describe('dark mode', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue('light');
  });

  it('resolves light theme literals under the light scheme', () => {
    mockUseColorScheme.mockReturnValue('light');

    render(<ThemeProbe />);

    expect(screen.getByTestId('probe').props.children).toBe('#0F766E|#626B78|#111827|#FFFFFF');
  });

  it('resolves dark theme literals under the dark scheme', () => {
    mockUseColorScheme.mockReturnValue('dark');

    render(<ThemeProbe />);

    expect(screen.getByTestId('probe').props.children).toBe('#0F766E|#9CA3AF|#F9FAFB|#FFFFFF');
  });

  it('defaults to the light theme when the scheme is unknown', () => {
    mockUseColorScheme.mockReturnValue(null);

    render(<ThemeProbe />);

    expect(String(screen.getByTestId('probe').props.children)).toContain('#626B78');
  });

  it('flips the FormField placeholder color with the scheme', () => {
    mockUseColorScheme.mockReturnValue('dark');

    render(
      <FormField
        accessibilityLabel="Email"
        label="Email"
        placeholder="you@example.com"
        testID="field"
      />,
    );

    expect(screen.getByTestId('field').props.placeholderTextColor).toBe('#9CA3AF');
  });

  it('renders the primitives without crashing under the dark scheme', () => {
    mockUseColorScheme.mockReturnValue('dark');

    render(
      <ScreenContainer testID="screen">
        <Card testID="card">
          <StatusBadge label="Completed" testID="badge" variant="primary" />
          <Button onPress={jest.fn()} testID="button" title="Start charging" />
          <LoadingView message="Loading" testID="loading" />
        </Card>
      </ScreenContainer>,
    );

    expect(screen.getByTestId('screen')).toBeTruthy();
    expect(screen.getByTestId('card')).toBeTruthy();
    expect(screen.getByTestId('button')).toBeTruthy();
    expect(screen.getByTestId('badge')).toBeTruthy();
  });

  it('carries dark-aware utility classes on the badge for legible tint text', () => {
    mockUseColorScheme.mockReturnValue('dark');

    render(<StatusBadge label="Failed" testID="badge" variant="danger" />);

    expect(String(screen.getByTestId('badge').props.className)).toContain('dark:text-danger-100');
  });
});
