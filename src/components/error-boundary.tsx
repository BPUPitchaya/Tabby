// Catches a render crash anywhere below it and shows a recovery screen
// instead of a white screen with no way back. Must be a class component --
// React only supports error boundaries via getDerivedStateFromError /
// componentDidCatch, there's no hook equivalent. Mounted once, at the very
// root (see _layout.tsx), so it catches a crash from any screen or provider.
import { Feather } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

const pressFeedback = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.7 } : undefined);

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Caught by ErrorBoundary:', error, info.componentStack);
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View className="flex-1 items-center justify-center bg-tabby-50 dark:bg-tabby-900 px-8 gap-4">
        <View className="w-16 h-16 rounded-full bg-rust-50 dark:bg-rust-900/40 items-center justify-center">
          <Feather name="alert-triangle" size={28} color="#A8503A" />
        </View>
        <Text className="font-fredoka-semibold text-xl text-center dark:text-white">
          Something went wrong
        </Text>
        <Text className="font-nunito text-center text-gray-500 dark:text-tabby-300">
          Tabby hit an unexpected error. Your data is safe; nothing was lost. Try again, and if it keeps
          happening, reopening the app usually clears it.
        </Text>
        <Pressable
          onPress={this.handleRetry}
          style={pressFeedback}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          className="bg-tabby-600 dark:bg-white rounded-xl px-6 py-3 mt-2"
        >
          <Text className="font-nunito-semibold text-white dark:text-tabby-900">Try again</Text>
        </Pressable>
      </View>
    );
  }
}
