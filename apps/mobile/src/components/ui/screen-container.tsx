import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenContainerProps {
  /** Screen content. */
  readonly children: ReactNode;
  /** Wraps content in a `ScrollView` (for content taller than the viewport). */
  readonly scroll?: boolean;
  /**
   * Wraps content in a `KeyboardAvoidingView` (behavior `padding` on iOS / `height` on
   * Android) so an on-screen keyboard never covers focused inputs. Combine with `scroll`
   * on form screens.
   */
  readonly keyboardAvoiding?: boolean;
  /** Detox / RTL test handle, placed on the outer safe-area element. */
  readonly testID?: string;
  /** Extra utility classes appended to the inner content wrapper. */
  readonly className?: string;
}

/**
 * The root wrapper for every screen: paints the `background` token, insets content past
 * the device notch/home-indicator via `SafeAreaView`, and optionally opts into scrolling
 * and keyboard avoidance. Centralizes the safe-area + keyboard handling the audit found
 * missing everywhere (0 `SafeAreaView` / 0 `KeyboardAvoidingView`).
 */
export function ScreenContainer({
  children,
  scroll = false,
  keyboardAvoiding = false,
  testID,
  className,
}: ScreenContainerProps): JSX.Element {
  const contentClassName = `flex-1 ${className ?? ''}`;
  const inner = scroll ? (
    <ScrollView className={contentClassName} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View className={contentClassName}>{children}</View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" testID={testID}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}
