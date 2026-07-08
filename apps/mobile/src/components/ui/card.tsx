import type { ReactNode } from 'react';
import { View } from 'react-native';

interface CardProps {
  /** Card content. */
  readonly children: ReactNode;
  /** Extra utility classes appended to the surface (e.g. margin, custom padding). */
  readonly className?: string;
  /** Detox / RTL test handle. */
  readonly testID?: string;
}

/**
 * The shared surface primitive: a white (`neutral-0`) panel with a `border` outline,
 * `lg` radius, and default padding. Replaces the 11 hand-rolled `card`/`sectionCard`
 * blocks that each picked their own radius (12/14/18) and border color.
 */
export function Card({ children, className, testID }: CardProps): JSX.Element {
  return (
    <View
      className={`rounded-lg border border-border bg-neutral-0 p-4 ${className ?? ''}`}
      testID={testID}
    >
      {children}
    </View>
  );
}
