import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { User, Pencil, Check, LogOut, ChevronRight, Settings } from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { loadTasteProfile } from "@/lib/tasteProfile";
import type { TasteProfile } from "@/lib/tasteProfile";
import { events } from "@/data/events";
import SavedListsSection from "@/components/profile/SavedListsSection";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

const VIBE_LABELS: Record<string, string> = {
  hidden_gems: "Hidden gems",
  popular_spots: "Popular spots",
  surprise_me: "Surprise me",
};
const BUDGET_LABELS: Record<string, string> = {
  free: "Free only",
  under_20: "Under $20",
  under_50: "Under $50",
  no_limit: "No limit",
};
const CATEGORY_LABELS: Record<string, string> = {
  music: "Live music",
  arts: "Art & culture",
  comedy: "Comedy",
  food: "Food & drink",
  outdoors: "Outdoors",
  nightlife: "Nightlife",
  fitness: "Fitness",
  theater: "Theater",
  workshops: "Workshops",
  popups: "Pop-ups",
};
const INTEREST_LABELS: Record<string, string> = {
  live_music: "Live music",
  art_exhibitions: "Art",
  popups: "Pop-ups",
  outdoor: "Outdoors",
  fitness: "Fitness",
  comedy: "Comedy",
  food: "Food & drink",
  nightlife: "Nightlife",
  theater: "Theater",
  workshops: "Workshops",
};

export default function ProfileTab() {
  const router = useRouter();
  const {
    isLoggedIn,
    userEmail,
    userDisplayName,
    userProfile,
    savedEvents,
    goingEvents,
    sharedWithYou,
    createdAt,
    updateDisplayName,
    signOut,
    refreshFromRemote,
  } = useUser();

  const insets = useSafeAreaInsets();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(userDisplayName || "");
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);

  useEffect(() => {
    if (isLoggedIn) loadTasteProfile().then(setTasteProfile);
  }, [isLoggedIn]);

  // Re-pull going/saved on focus so server-side deletions reflect in the stats.
  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn) void refreshFromRemote();
    }, [isLoggedIn, refreshFromRemote])
  );

  const topCategory = tasteProfile
    ? Object.entries(tasteProfile.categoryWeights).sort(([, a], [, b]) => b - a)[0]
    : null;

  const now = new Date();
  const goingThisMonth = goingEvents.filter((e) => {
    const d = new Date(e.eventDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const totalSwiped = tasteProfile
    ? tasteProfile.likedIds.length + tasteProfile.dislikedIds.length
    : 0;

  const displayLabel = userDisplayName || userEmail || "Guest";
  const avatarLetter =
    isLoggedIn && (userDisplayName || userEmail)
      ? (userDisplayName || userEmail)[0].toUpperCase()
      : null;

  return (
    <View style={st.screen}>
      <View style={[st.stickyHeader, { paddingTop: insets.top + 16 }]}>
        <Text style={st.stickyHeading}>Profile</Text>
      </View>
      <NestableScrollContainer
        contentContainerStyle={[st.scroll, !isLoggedIn && st.scrollGuest]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ───────────────────────────── */}
        {isLoggedIn ? (
          <View style={st.header}>
            <View style={st.avatarWrap}>
              {avatarLetter ? (
                <Text style={st.avatarText}>{avatarLetter}</Text>
              ) : (
                <User size={26} strokeWidth={1.5} color={colors.white} />
              )}
            </View>
            <View style={st.headerInfo}>
              {editingName ? (
                <View style={st.nameEditRow}>
                  <TextInput
                    style={st.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={() => {
                      if (nameInput.trim()) updateDisplayName(nameInput.trim());
                      setEditingName(false);
                    }}
                    style={st.nameConfirm}
                  >
                    <Check size={15} color={colors.primary} />
                  </Pressable>
                </View>
              ) : (
                <View style={st.nameRow}>
                  <Text style={st.displayName}>{displayLabel}</Text>
                  <Pressable
                    onPress={() => { setNameInput(userDisplayName || ""); setEditingName(true); }}
                    hitSlop={8}
                  >
                    <Pencil size={13} color={colors.textMuted} />
                  </Pressable>
                </View>
              )}
              {userEmail ? <Text style={st.emailLabel}>{userEmail}</Text> : null}
            </View>
            <Pressable
              onPress={() => router.push("/(onboarding)/flow")}
              style={st.settingsButton}
              hitSlop={8}
            >
              <Settings size={18} strokeWidth={1.6} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <View style={st.guestHeader}>
            <View style={st.guestAvatar}>
              <User size={32} strokeWidth={1.5} color={colors.textSecondary} />
            </View>
            <Text style={st.guestTitle}>Browsing as a guest</Text>
            <Text style={st.guestSub}>
              Sign in to save events, build lists, and plan your weekend.
            </Text>
            <Pressable
              onPress={() => router.push("/(auth)/signin")}
              style={st.signInButton}
            >
              <Text style={st.signInText}>Sign in to save your taste</Text>
            </Pressable>
          </View>
        )}

        {/* ── Shared with you ─────────────────── */}
        {isLoggedIn && sharedWithYou.length > 0 && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>Shared with you</Text>
            <View style={{ gap: 8 }}>
              {sharedWithYou.map((s) => {
                const ev = events.find((e) => e.id === s.eventId);
                if (!ev) return null;
                return (
                  <Pressable
                    key={s.eventId}
                    onPress={() => router.push(`/event/${s.eventId}`)}
                    style={st.eventCard}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={st.eventTitle}>{ev.title}</Text>
                      <Text style={st.eventMeta}>{ev.startDate} · {ev.location}</Text>
                    </View>
                    <ChevronRight size={16} strokeWidth={1.5} color={colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Saved Lists ─────────────────────── */}
        {isLoggedIn && <SavedListsSection />}

        {/* ── Preferences ─────────────────────── */}
        {userProfile && (
          <View style={st.section}>
            <View style={st.sectionHeader}>
              <Text style={st.sectionTitle}>My Preferences</Text>
              <Pressable onPress={() => router.push("/(onboarding)/flow")}>
                <Text style={st.editLink}>Edit</Text>
              </Pressable>
            </View>
            <View style={st.prefCard}>
              {userProfile.interests.length > 0 && (
                <View style={st.prefRow}>
                  <Text style={st.prefKey}>Interests</Text>
                  <View style={st.pillRow}>
                    {userProfile.interests.map((i) => (
                      <View key={i} style={st.pill}>
                        <Text style={st.pillText}>{INTEREST_LABELS[i] ?? i}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {userProfile.neighborhood ? (
                <View style={st.prefRow}>
                  <Text style={st.prefKey}>Neighborhood</Text>
                  <Text style={st.prefValue}>{userProfile.neighborhood}, {userProfile.borough}</Text>
                </View>
              ) : null}
              {userProfile.vibe ? (
                <View style={st.prefRow}>
                  <Text style={st.prefKey}>Vibe</Text>
                  <Text style={st.prefValue}>{VIBE_LABELS[userProfile.vibe] ?? userProfile.vibe}</Text>
                </View>
              ) : null}
              {userProfile.budget ? (
                <View style={st.prefRow}>
                  <Text style={st.prefKey}>Budget</Text>
                  <Text style={st.prefValue}>{BUDGET_LABELS[userProfile.budget] ?? userProfile.budget}</Text>
                </View>
              ) : null}
              {(userProfile.freeDays?.length > 0 || userProfile.freeTime?.length > 0) && (
                <View style={[st.prefRow, { borderBottomWidth: 0 }]}>
                  <Text style={st.prefKey}>Availability</Text>
                  <Text style={st.prefValue}>
                    {[...(userProfile.freeDays ?? []), ...(userProfile.freeTime ?? [])].join(" · ")}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Sift knows you ───────────────────── */}
        {isLoggedIn && tasteProfile && (
          <View style={st.section}>
            <Text style={st.sectionTitle}>Sift knows you</Text>
            <View style={st.prefCard}>
              {topCategory && (
                <View style={st.prefRow}>
                  <Text style={st.prefKey}>Most explored</Text>
                  <Text style={st.prefValue}>{CATEGORY_LABELS[topCategory[0]] ?? topCategory[0]}</Text>
                </View>
              )}
              {goingThisMonth > 0 && (
                <View style={st.prefRow}>
                  <Text style={st.prefKey}>Going this month</Text>
                  <Text style={st.prefValue}>{goingThisMonth} event{goingThisMonth !== 1 ? "s" : ""}</Text>
                </View>
              )}
              <View style={[st.prefRow, { borderBottomWidth: 0 }]}>
                <Text style={st.prefKey}>Events seen</Text>
                <Text style={st.prefValue}>
                  {totalSwiped > 0
                    ? `${totalSwiped}${totalSwiped < 20 ? " — keep swiping" : ""}`
                    : "Start swiping to build your taste"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Stats ───────────────────────────── */}
        {isLoggedIn && (
          <View style={st.statsRow}>
            <View style={st.statCard}>
              <Text style={st.statNumber}>{savedEvents.length}</Text>
              <Text style={st.statLabel}>Saved</Text>
            </View>
            <View style={st.statDivider} />
            <View style={st.statCard}>
              <Text style={st.statNumber}>{goingEvents.length}</Text>
              <Text style={st.statLabel}>Going</Text>
            </View>
          </View>
        )}

        {/* ── Member since ────────────────────── */}
        {isLoggedIn && createdAt && (
          <View style={st.memberSinceCard}>
            <Text style={st.memberSinceLabel}>Member since</Text>
            <Text style={st.memberSinceValue}>
              {new Date(createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
          </View>
        )}

        {/* ── Sign out ────────────────────────── */}
        {isLoggedIn && (
          <Pressable
            onPress={async () => {
              await signOut();
              router.replace("/(auth)/gate");
            }}
            style={st.signOutButton}
          >
            <LogOut size={15} strokeWidth={1.8} color={colors.textMuted} />
            <Text style={st.signOutText}>Sign out</Text>
          </Pressable>
        )}
      </NestableScrollContainer>
    </View>
  );
}

const st = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  stickyHeader: {
    paddingHorizontal: spacing.page,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stickyHeading: {
    ...typography.sectionHeading,
  },
  scroll: {
    paddingTop: 20,
    paddingHorizontal: spacing.page,
    paddingBottom: 48,
  },
  scrollGuest: {
    flexGrow: 1,
    justifyContent: "center",
  },

  // ── Header ────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 22, fontWeight: "600", color: colors.white },
  headerInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nameEditRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nameInput: {
    ...typography.body,
    fontWeight: "600",
    color: colors.foreground,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    minWidth: 100,
    padding: 0,
  },
  nameConfirm: { padding: 2 },
  displayName: { ...typography.body, fontWeight: "600", color: colors.foreground },
  emailLabel: { ...typography.xs, color: colors.textMuted, marginTop: 2 },
  settingsButton: { padding: 6 },

  // ── Guest ─────────────────────────────────
  guestHeader: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  guestAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  guestTitle: { ...typography.h3, textAlign: "center" },
  guestSub: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  signInButton: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: radius.full,
    alignItems: "center",
  },
  signInText: { ...typography.body, fontWeight: "600", color: colors.white },

  // ── Stats ─────────────────────────────────
  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
    ...shadows.card,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.foreground,
  },
  statLabel: { ...typography.xs, color: colors.textMuted },

  // ── Sections ──────────────────────────────
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
  },
  editLink: { ...typography.sm, color: colors.primary, fontWeight: "500" },

  // ── Event cards ───────────────────────────
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    ...shadows.card,
  },
  eventTitle: { ...typography.sm, fontWeight: "500", color: colors.foreground },
  eventMeta: { ...typography.xs, color: colors.textMuted, marginTop: 2 },

  // ── Preferences card ─────────────────────
  prefCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prefKey: {
    width: 96,
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
    paddingTop: 1,
  },
  prefValue: { flex: 1, ...typography.sm, color: colors.foreground },
  pillRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  pillText: { fontSize: 12, fontWeight: "500", color: colors.primary },

  // ── Sign out ──────────────────────────────
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
    paddingVertical: 14,
  },
  signOutText: { ...typography.sm, color: colors.textMuted },
  memberSinceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  memberSinceLabel: { ...typography.sm, color: colors.textSecondary },
  memberSinceValue: { ...typography.sm, fontWeight: "600", color: colors.foreground },
});
