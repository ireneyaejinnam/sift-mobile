import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  ChevronRight,
  KeyRound,
  Sliders,
  LogOut,
  Shield,
  FileText,
} from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, userEmail } = useUser();

  const handleChangePassword = () => {
    router.push("/change-password");
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} strokeWidth={1.8} color={colors.foreground} />
        </Pressable>
        <Text style={s.heading}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={s.content}>
        {/* Taste & Preferences */}
        <Text style={s.sectionLabel}>PREFERENCES</Text>
        <View style={s.card}>
          <MenuItem
            icon={<Sliders size={18} strokeWidth={1.6} color={colors.primary} />}
            label="Set your taste"
            sub="Update your interests, budget, and neighborhoods"
            onPress={() => router.push("/(onboarding)/flow")}
          />
        </View>

        {/* Account */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.card}>
          <MenuItem
            icon={<KeyRound size={18} strokeWidth={1.6} color={colors.foreground} />}
            label="Change password"
            sub={userEmail ?? undefined}
            onPress={handleChangePassword}
          />
          <View style={s.divider} />
          <MenuItem
            icon={<LogOut size={18} strokeWidth={1.6} color="#C0392B" />}
            label="Sign out"
            labelColor="#C0392B"
            onPress={() => {
              void signOut();
              router.replace("/(auth)/gate");
            }}
          />
        </View>

        {/* Legal */}
        <Text style={s.sectionLabel}>LEGAL</Text>
        <View style={s.card}>
          <MenuItem
            icon={<Shield size={18} strokeWidth={1.6} color={colors.textSecondary} />}
            label="Privacy Policy"
            onPress={() => Linking.openURL("https://siftapp.site/privacy")}
          />
          <View style={s.divider} />
          <MenuItem
            icon={<FileText size={18} strokeWidth={1.6} color={colors.textSecondary} />}
            label="Terms of Service"
            onPress={() => Linking.openURL("https://siftapp.site/terms")}
          />
        </View>
      </View>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  sub,
  labelColor,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  labelColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.menuItem}>
      <View style={s.menuIcon}>{icon}</View>
      <View style={s.menuText}>
        <Text style={[s.menuLabel, labelColor ? { color: labelColor } : null]}>
          {label}
        </Text>
        {sub ? <Text style={s.menuSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <ChevronRight size={16} strokeWidth={1.5} color={colors.border} />
    </Pressable>
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
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginBottom: 24,
    ...shadows.card,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 52,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuIcon: {
    width: 28,
    alignItems: "center",
  },
  menuText: {
    flex: 1,
    marginLeft: 12,
  },
  menuLabel: {
    ...typography.body,
    fontWeight: "500",
    color: colors.foreground,
  },
  menuSub: {
    ...typography.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
