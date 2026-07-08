import { Text } from 'react-native';

/** Semantic color families a {@link StatusBadge} can render as. */
export type StatusBadgeVariant = 'primary' | 'success' | 'danger' | 'warning' | 'neutral';

interface StatusBadgeProps {
  /** The already-localized text to display inside the badge. */
  readonly label: string;
  /** Color family. Defaults to `neutral`. */
  readonly variant?: StatusBadgeVariant;
  /** Detox / RTL test handle. */
  readonly testID?: string;
  /** Extra utility classes appended to the badge. */
  readonly className?: string;
}

const CLASS_BY_VARIANT: Record<StatusBadgeVariant, string> = {
  primary: 'bg-primary-100 text-primary',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  neutral: 'bg-neutral-200 text-neutral-700',
};

/**
 * A status pill that encapsulates the status→color mapping. Generalizes the
 * `resolveStatusBadgeClass` logic from `session-summary-screen` so a FAILED/CANCELLED
 * state never reads as success.
 *
 * Wrap-safe by design: it sizes to content via `self-start` and never uses
 * `overflow-hidden` + `rounded-full`, so long Armenian status text wraps instead of
 * being clipped.
 */
export function StatusBadge({
  label,
  variant = 'neutral',
  testID,
  className,
}: StatusBadgeProps): JSX.Element {
  return (
    <Text
      className={`self-start rounded-full px-3 py-1 text-[13px] font-bold ${CLASS_BY_VARIANT[variant]} ${
        className ?? ''
      }`}
      testID={testID}
    >
      {label}
    </Text>
  );
}

/**
 * Maps a domain status string to a {@link StatusBadgeVariant}, preserving the pilot's
 * corrected coloring: FAILED/CANCELLED → `danger`, COMPLETED → `primary`, anything else
 * → `neutral`. Case-insensitive so it accepts either enum values or localized keys.
 */
export function resolveStatusBadgeVariant(status: string): StatusBadgeVariant {
  const normalized = status.toUpperCase();

  if (normalized === 'FAILED' || normalized === 'CANCELLED') {
    return 'danger';
  }

  if (normalized === 'COMPLETED') {
    return 'primary';
  }

  return 'neutral';
}
