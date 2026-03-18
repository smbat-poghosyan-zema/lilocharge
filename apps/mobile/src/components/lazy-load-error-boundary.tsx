import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load screen</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
