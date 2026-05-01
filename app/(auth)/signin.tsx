import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { setGuestFlag, hasOnboardingDoneFlag, setOnboardingDoneFlag } from "@/lib/storage";
import { useToast } from "@/components/ui/Toast";
import { track } from "@/lib/track";
import { colors, spacing, radius, typography } from "@/lib/theme";

export default function SignInScreen() {
  const router = useRouter();
  const { setAuth, isLoggedIn } = useUser();
  const { showToast } = useToast();
  const [isCreateAccount, setIsCreateAccount] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = isForgotPassword
    ? email.trim().length > 0
    : email.trim().length > 0 && password.trim().length >= 6;

  const handleForgotPassword = async () => {
    if (!email.trim() || loading) return;
    if (!supabase) {
      showToast("Sign in is not configured right now.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        showToast(error.message);
      } else {
        showToast("Reset link sent — check your email");
        setIsForgotPassword(false);
      }
    } catch {
      showToast("Something went wrong. Try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isCreateAccount) track("sign_up_started");
    // Clear display name when switching modes to prevent leaking between accounts
    if (!isCreateAccount) setDisplayName("");
  }, [isCreateAccount]);

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    if (!supabase) {
      showToast("Sign in is not configured right now.");
      return;
    }
    setLoading(true);

    try {
      if (isCreateAccount) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) {
          showToast(error.message);
          setLoading(false);
          return;
        }
        track("sign_up_completed", { method: "email" });
        showToast("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (error) {
          showToast(error.message);
          setLoading(false);
          return;
        }
        track("sign_in_completed", { method: "email" });
      }
    } catch {
      showToast("Something went wrong. Try again.");
      setLoading(false);
      return;
    }

    await setAuth(true, email.trim(), isCreateAccount ? (displayName.trim() || undefined) : undefined);
    setLoading(false);

    if (isCreateAccount) {
      // New account — always go through onboarding
      router.replace("/(onboarding)/flow");
    } else {
      // Returning user — check if they have a profile in Supabase
      // setAuth may have already set the flag, but double-check directly
      let hasProfile = hasOnboardingDoneFlag();
      if (!hasProfile && supabase) {
        try {
          const { data } = await supabase.auth.getUser();
          if (data.user) {
            const { data: profile } = await supabase
              .from("user_profiles")
              .select("user_id")
              .eq("user_id", data.user.id)
              .maybeSingle();
            if (profile) {
              setOnboardingDoneFlag();
              hasProfile = true;
            }
          }
        } catch {}
      }
      router.replace(hasProfile ? "/(tabs)/discover" : "/(onboarding)/flow");
    }
  };

  const handleContinueAsGuest = () => {
    setGuestFlag();
    router.replace("/(tabs)/discover");
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/gate");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={18} color={colors.foreground} strokeWidth={1.5} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Text style={styles.heading}>
            {isForgotPassword ? "Reset password" : isCreateAccount ? "Create account" : "Sign in"}
          </Text>
          <Text style={styles.subtitle}>
            {isForgotPassword
              ? "Enter your email and we'll send you a reset link."
              : "We'll use this to save your preferences and personalize your experience."}
          </Text>

          {/* Username — only for signup */}
          {isCreateAccount && !isForgotPassword && (
            <>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="How we'll show you on profile"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          {/* Email */}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Password — hidden in forgot password mode */}
          {!isForgotPassword && (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />
              {!isCreateAccount && (
                <Pressable
                  onPress={() => setIsForgotPassword(true)}
                  style={styles.forgotLink}
                >
                  <Text style={styles.forgotLinkText}>Forgot password?</Text>
                </Pressable>
              )}
            </>
          )}

          {/* Submit */}
          <Pressable
            onPress={isForgotPassword ? handleForgotPassword : handleSubmit}
            disabled={!canSubmit || loading}
            style={({ pressed }) => [
              styles.primaryButton,
              { marginTop: 16 },
              (!canSubmit || loading) && styles.primaryButtonDisabled,
              pressed && canSubmit && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {loading
                ? "Please wait..."
                : isForgotPassword
                ? "Send Reset Link"
                : isCreateAccount
                ? "Create Account"
                : "Sign In"}
            </Text>
          </Pressable>

          {/* Toggle create/signin or back to signin from forgot */}
          {isForgotPassword ? (
            <Pressable
              onPress={() => setIsForgotPassword(false)}
              style={styles.toggleButton}
            >
              <Text style={styles.toggleText}>Back to sign in</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setIsCreateAccount(!isCreateAccount)}
              style={styles.toggleButton}
            >
              <Text style={styles.toggleText}>
                {isCreateAccount
                  ? "Already have an account? Sign in"
                  : "Create an account instead"}
              </Text>
            </Pressable>
          )}

          {/* Guest link */}
          {!isForgotPassword && (
            <Pressable onPress={handleContinueAsGuest} style={styles.guestLink}>
              <Text style={styles.guestLinkText}>Continue as guest</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.page,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: {
    ...typography.sm,
    color: colors.foreground,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.page,
  },
  form: {
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  heading: {
    ...typography.sectionHeading,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    ...typography.sm,
    textAlign: "center",
    color: colors.textSecondary,
    marginBottom: 24,
  },
  label: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.white,
    marginBottom: 16,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginBottom: 16,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    ...typography.body,
    fontWeight: "500",
    color: colors.foreground,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
  toggleButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  toggleText: {
    ...typography.sm,
    color: colors.textSecondary,
  },
  guestLink: {
    paddingVertical: 8,
    alignItems: "center",
  },
  guestLinkText: {
    ...typography.sm,
    color: colors.textSecondary,
    textDecorationLine: "underline",
  },
  forgotLink: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    marginBottom: 4,
  },
  forgotLinkText: {
    ...typography.sm,
    color: colors.primary,
  },
});
