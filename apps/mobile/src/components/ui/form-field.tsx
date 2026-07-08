import type { TextInputProps } from 'react-native';
import { Text, TextInput, View } from 'react-native';

import { useThemeColors } from '../../theme/use-theme-colors';

interface FormFieldProps extends Omit<TextInputProps, 'accessibilityLabel'> {
  /** Visible field label rendered above the input. */
  readonly label: string;
  /**
   * Accessible name for the input. REQUIRED so screen readers announce the field even
   * when the visible label is not programmatically associated.
   */
  readonly accessibilityLabel: string;
  /** Inline validation message rendered in `danger` below the input when present. */
  readonly error?: string | null;
  /** testID for the inner `TextInput`; the error text uses `${testID}-error`. */
  readonly testID?: string;
  /** Extra utility classes appended to the outer wrapper. */
  readonly className?: string;
}

/**
 * A labeled text input with an optional inline error, built on token colors and a
 * focus ring. Forwards all standard `TextInput` props (`value`, `onChangeText`,
 * `placeholder`, `keyboardType`, `secureTextEntry`, `autoCapitalize`, …). Replaces the
 * per-screen label + input + error markup the audit found duplicated across 10 screens.
 */
export function FormField({
  label,
  accessibilityLabel,
  error,
  testID,
  className,
  ...textInputProps
}: FormFieldProps): JSX.Element {
  const hasError = typeof error === 'string' && error.length > 0;
  const themeColors = useThemeColors();

  return (
    <View className={`gap-1.5 ${className ?? ''}`}>
      <Text className="text-[13px] font-semibold text-text-muted">{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        className={`min-h-11 rounded-md border bg-neutral-0 px-3.5 py-3 text-base text-text focus:border-primary ${
          hasError ? 'border-danger' : 'border-border'
        }`}
        placeholderTextColor={themeColors.muted}
        testID={testID}
        {...textInputProps}
      />
      {hasError ? (
        <Text
          className="text-[13px] font-semibold text-danger"
          testID={testID === undefined ? undefined : `${testID}-error`}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
