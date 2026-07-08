import { Component, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import i18n from '../i18n/i18n';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

/**
 * Error boundary component for catching errors in lazy-loaded components.
 */
export class LazyLoadErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error('Lazy load error:', error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View className="flex-1 items-center justify-center bg-background p-6">
          <Text className="text-center text-base font-semibold text-danger">
            {i18n.t('errors.screenLoadFailed')}
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}
