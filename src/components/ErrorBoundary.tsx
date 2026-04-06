import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors } from "@/lib/theme";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Intentionally silent — ErrorBoundary catches and displays UI
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>:(</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app ran into an unexpected error. Tap below to try again.
          </Text>
          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
    color: colors.secondary,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.secondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
