import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { colors, radius, spacing, typography } from "@/lib/theme";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userEmail } = useUser();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    if (!currentPw) {
      setError("Enter your current password.");
      return;
    }
    if (newPw.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setError("New passwords don't match.");
      return;
    }
    if (currentPw === newPw) {
      setError("New password must be different from current password.");
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      if (!supabase || !userEmail) {
        setError("Not signed in.");
        return;
      }

      // Verify current password by re-authenticating
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPw,
      });
      if (signInErr) {
        setError("Current password is incorrect.");
        return;
      }

      // Update to new password
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPw,
      });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }

      Alert.alert("Password updated", "Your password has been changed.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} strokeWidth={1.8} color={colors.foreground} />
        </Pressable>
        <Text style={s.heading}>Change password</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.content}
      >
        <Text style={s.emailLabel}>{userEmail}</Text>

        <View style={s.fieldWrap}>
          <Text style={s.label}>Current password</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
              autoComplete="current-password"
              placeholder="Enter current password"
              placeholderTextColor={colors.border}
            />
            <Pressable onPress={() => setShowCurrent(!showCurrent)} hitSlop={8} style={s.eyeBtn}>
              {showCurrent
                ? <EyeOff size={18} strokeWidth={1.5} color={colors.textSecondary} />
                : <Eye size={18} strokeWidth={1.5} color={colors.textSecondary} />}
            </Pressable>
          </View>
        </View>

        <View style={s.fieldWrap}>
          <Text style={s.label}>New password</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="Min 6 characters"
              placeholderTextColor={colors.border}
            />
            <Pressable onPress={() => setShowNew(!showNew)} hitSlop={8} style={s.eyeBtn}>
              {showNew
                ? <EyeOff size={18} strokeWidth={1.5} color={colors.textSecondary} />
                : <Eye size={18} strokeWidth={1.5} color={colors.textSecondary} />}
            </Pressable>
          </View>
        </View>

        <View style={s.fieldWrap}>
          <Text style={s.label}>Confirm new password</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="Re-enter new password"
              placeholderTextColor={colors.border}
            />
            <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={8} style={s.eyeBtn}>
              {showConfirm
                ? <EyeOff size={18} strokeWidth={1.5} color={colors.textSecondary} />
                : <Eye size={18} strokeWidth={1.5} color={colors.textSecondary} />}
            </Pressable>
          </View>
        </View>

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={[s.submitBtn, loading && { opacity: 0.6 }]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={s.submitText}>Update password</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.page,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  heading: {
    ...typography.h3,
    fontSize: 17,
  },
  content: {
    paddingHorizontal: spacing.page,
    paddingTop: 24,
  },
  emailLabel: {
    ...typography.sm,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  fieldWrap: {
    marginBottom: 20,
  },
  label: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: {
    ...typography.sm,
    color: "#C0392B",
    marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
});
