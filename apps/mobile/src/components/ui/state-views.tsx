import { ActivityIndicator, Text, View } from 'react-native';

import { PRIMARY } from '../../theme/colors';
import { Button } from './button';

const CENTERED = 'flex-1 items-center justify-center gap-3 bg-background px-6';

interface LoadingViewProps {
  /** Optional muted message shown beneath the spinner. */
  readonly message?: string;
  /** Detox / RTL test handle. */
  readonly testID?: string;
}

/**
 * Centered loading state: a `primary`-tinted spinner with an optional message. Replaces
 * the 8 hand-rolled `centeredContainer` + `ActivityIndicator color="#0F766E"` blocks.
 * The spinner color is a literal because RN `ActivityIndicator` takes `color`, not a
 * class; it mirrors the `primary` token from `tailwind.config.js` via `theme/colors.ts`.
 */
export function LoadingView({ message, testID }: LoadingViewProps): JSX.Element {
  return (
    <View className={CENTERED} testID={testID}>
      <ActivityIndicator color={PRIMARY} size="large" />
      {message !== undefined ? <Text className="text-sm text-text-muted">{message}</Text> : null}
    </View>
  );
}

interface ErrorRetryViewProps {
  /** The error message to display. */
  readonly message: string;
  /** Fired when the retry button is pressed. */
  readonly onRetry: () => void;
  /** Localized label for the retry button. */
  readonly retryLabel: string;
  /** Detox / RTL test handle; the retry button uses `${testID}-retry`. */
  readonly testID?: string;
}

/**
 * Centered error state: a `danger` message plus a retry {@link Button}. Replaces the
 * 16 hand-rolled `errorText` + retry `Pressable` pairs.
 */
export function ErrorRetryView({
  message,
  onRetry,
  retryLabel,
  testID,
}: ErrorRetryViewProps): JSX.Element {
  return (
    <View className={CENTERED} testID={testID}>
      <Text className="text-center text-sm font-semibold text-danger">{message}</Text>
      <Button
        onPress={onRetry}
        testID={testID === undefined ? undefined : `${testID}-retry`}
        title={retryLabel}
        variant="secondary"
      />
    </View>
  );
}

interface EmptyStateProps {
  /** The message describing why the list/section is empty. */
  readonly message: string;
  /** Optional decorative emoji/glyph shown above the message. */
  readonly icon?: string;
  /** Detox / RTL test handle. */
  readonly testID?: string;
}

/**
 * Centered empty state: an optional decorative icon/emoji and a muted message. Gives the
 * ad-hoc empty texts (`wallet-transactions-empty`, `noConnectors`, `noReviews`, …) one
 * reusable primitive.
 */
export function EmptyState({ message, icon, testID }: EmptyStateProps): JSX.Element {
  return (
    <View className={CENTERED} testID={testID}>
      {icon !== undefined ? (
        <Text
          accessibilityElementsHidden
          className="text-4xl"
          testID={testID === undefined ? undefined : `${testID}-icon`}
        >
          {icon}
        </Text>
      ) : null}
      <Text className="text-center text-sm text-text-muted">{message}</Text>
    </View>
  );
}
