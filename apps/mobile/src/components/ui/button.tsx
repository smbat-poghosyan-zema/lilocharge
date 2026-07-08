import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { NEUTRAL_0, PRIMARY } from '../../theme/colors';

/** Visual/semantic variants a {@link Button} can render as. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'link';

interface ButtonBaseProps {
  /** Fired when the button is pressed (ignored while `disabled` or `loading`). */
  readonly onPress: () => void;
  /** Visual variant. Defaults to `primary`. */
  readonly variant?: ButtonVariant;
  /** Disables interaction and dims the button. */
  readonly disabled?: boolean;
  /** Shows an inline spinner, hides the label, and blocks presses. */
  readonly loading?: boolean;
  /** Detox / RTL test handle; also namespaces the inner spinner testID. */
  readonly testID?: string;
  /** Extra utility classes appended to the container. */
  readonly className?: string;
}

/**
 * Props for {@link Button}. Either pass a `title` string (its text doubles as the
 * accessibility label) OR pass custom `children` together with a REQUIRED
 * `accessibilityLabel` so no interactive control ships without an accessible name.
 */
export type ButtonProps = ButtonBaseProps &
  (
    | { readonly title: string; readonly children?: never; readonly accessibilityLabel?: string }
    | { readonly title?: never; readonly children: ReactNode; readonly accessibilityLabel: string }
  );

const CONTAINER_BASE =
  'min-h-11 flex-row items-center justify-center rounded-lg px-4 active:opacity-70';

const CONTAINER_BY_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary py-3.5',
  secondary: 'border border-primary bg-neutral-0 py-3.5',
  danger: 'bg-danger py-3.5',
  link: 'bg-transparent py-2',
};

const TEXT_BY_VARIANT: Record<ButtonVariant, string> = {
  primary: 'text-[15px] font-bold text-neutral-0',
  secondary: 'text-[15px] font-bold text-primary',
  danger: 'text-[15px] font-bold text-neutral-0',
  link: 'text-[15px] font-semibold text-primary',
};

/** Spinner color has to be a literal (RN `ActivityIndicator` takes `color`, not a class). */
const SPINNER_COLOR_BY_VARIANT: Record<ButtonVariant, string> = {
  primary: NEUTRAL_0,
  secondary: PRIMARY,
  danger: NEUTRAL_0,
  link: PRIMARY,
};

/**
 * The shared pressable action for the app: a token-styled button with `primary`,
 * `secondary` (outline), `danger`, and `link` variants, a 44px minimum touch target,
 * a pressed-opacity affordance, and an inline loading spinner.
 *
 * Sourced from the `session-summary-screen` primary/secondary buttons so every screen
 * reads identically instead of re-declaring `primaryButton`/`secondaryButton` styles.
 */
export function Button(props: ButtonProps): JSX.Element {
  const {
    onPress,
    variant = 'primary',
    disabled = false,
    loading = false,
    testID,
    className,
    accessibilityLabel,
  } = props;
  const isBlocked = disabled || loading;
  const label = 'title' in props && props.title !== undefined ? props.title : accessibilityLabel;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isBlocked }}
      className={`${CONTAINER_BASE} ${CONTAINER_BY_VARIANT[variant]} ${
        isBlocked ? 'opacity-50' : ''
      } ${className ?? ''}`}
      disabled={isBlocked}
      testID={testID}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator
          color={SPINNER_COLOR_BY_VARIANT[variant]}
          testID={testID === undefined ? undefined : `${testID}-loading`}
        />
      ) : 'title' in props && props.title !== undefined ? (
        <Text className={TEXT_BY_VARIANT[variant]}>{props.title}</Text>
      ) : (
        props.children
      )}
    </Pressable>
  );
}
