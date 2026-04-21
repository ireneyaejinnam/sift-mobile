import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { User, Pencil, Check } from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { loadTasteProfile } from "@/lib/tasteProfile";
import type { TasteProfile } from "@/lib/tasteProfile";
import { events } from "@/data/events";
import CalendarSection from "@/components/profile/CalendarSection";
import SavedListsSection from "@/components/profile/SavedListsSection";
import { colors, radius, spacing, typography } from "@/lib/theme";

const VIBE_LABELS: Record<string, string> = {
  hidden_gems: "Show me the hidden gems",
  popular_spots: "I like popular spots",
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
  live_music: "Live music & concerts",
  art_exhibitions: "Art exhibitions & galleries",
  popups: "Pop-ups & sample sales",
  outdoor: "Outdoor activities",
  fitness: "Fitness & run clubs",
  comedy: "Comedy & shows",
  food: "Food events & tastings",
  nightlife: "Nightlife & bars",
  theater: "Theater & performances",
  workshops: "Workshops & classes",
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
  } = useUser();

  const insets = useSafeAreaInsets();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(userDisplayName || "");
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);

  useEffect(() => {
    if (isLoggedIn) loadTasteProfile().then(setTasteProfile);
  }, [isLoggedIn]);

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
    <ScrollView
      contentContainerStyle={[st.scroll, !isLoggedIn && st.scrollGuest]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      {isLoggedIn ? (
        <View style={st.header}>
          <View style={st.headerRow}>
            <View style={[st.avatar, st.avatarLoggedIn]}>
              {avatarLetter ? (
                <Text style={st.avatarText}>{avatarLetter}</Text>
              ) : (
                <User size={24} strokeWidth={1.5} color={colors.textSecondary} />
              )}
            </View>
            <View>
              {editingName ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    style={[st.displayName, { borderBottomWidth: 1, borderBottomColor: colors.primary, minWidth: 120, padding: 0 }]}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => {
                    if (nameInput.trim()) updateDisplayName(nameInput.trim());
                    setEditingName(false);
                  }}>
                    <Check size={16} color={colors.primary} />
                  </Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={st.displayName}>{displayLabel}</Text>
                  <Pressable onPress={() => { setNameInput(userDisplayName || ""); setEditingName(true); }} hitSlop={8}>
                    <Pencil size={13} color={colors.textSecondary} />
                  </Pressable>
                </View>
              )}
              {userEmail ? <Text style={st.emailLabel}>{userEmail}</Text> : null}
              <Pressable onPress={() => router.push("/(onboarding)/flow")}>
                <Text style={st.editLink}>Edit preferences</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={st.guestHeader}>
          <View style={[st.avatar, st.avatarGuest]}>
            <User size={28} strokeWidth={1.5} color={colors.textSecondary} />
          </View>
          <Text style={st.guestTitle}>You're exploring as a guest</Text>
          <Text style={st.guestSub}>Sign in and Sift starts learning your taste.</Text>
          <Pressable
            onPress={() => router.push("/(auth)/signin")}
            style={st.signInButton}
          >
            <Text style={st.signInText}>Sign in to save your taste</Text>
          </Pressable>
        </View>
      )}

      {/* Calendar — logged-in only */}
      {isLoggedIn && (
        <CalendarSection goingEvents={goingEvents} savedEvents={savedEvents} />
      )}

      {/* Shared with you — logged-in only */}
      {isLoggedIn && sharedWithYou.length > 0 && (
        <View style={st.section}>
          <Text style={st.h3}>Shared with you</Text>
          <View style={{ gap: 8 }}>
            {sharedWithYou.map((s) => {
              const ev = events.find((e) => e.id === s.eventId);
              if (!ev) return null;
              return (
                <Pressable
                  key={s.eventId}
                  onPress={() => router.push(`/event/${s.eventId}`)}
                  style={st.card}
                >
                  <Text style={st.prefLine}>
                    <Text style={{ fontWeight: "600" }}>{ev.title}</Text>
                  </Text>
                  <Text style={st.prefLabel}>
                    {ev.startDate} · {ev.location}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Saved Lists — logged-in only */}
      {isLoggedIn && <SavedListsSection />}

      {/* Preferences */}
      {userProfile && (
        <View style={st.section}>
          <Text style={st.h3}>My Preferences</Text>
          <View style={st.card}>
            {userProfile.interests.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={st.prefLabel}>Interests:</Text>
                <View style={st.pillRow}>
                  {userProfile.interests.map((i) => (
                    <View key={i} style={st.pill}>
                      <Text style={st.pillText}>
                        {INTEREST_LABELS[i] ?? i}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {userProfile.neighborhood ? (
              <Text style={st.prefLine}>
                <Text style={st.prefLabel}>Neighborhood: </Text>
                {userProfile.neighborhood}, {userProfile.borough}
              </Text>
            ) : null}
            {userProfile.travelRange ? (
              <Text style={st.prefLine}>
                <Text style={st.prefLabel}>Travel range: </Text>
                {userProfile.travelRange}
              </Text>
            ) : null}
            {userProfile.vibe ? (
              <Text style={st.prefLine}>
                <Text style={st.prefLabel}>Vibe: </Text>
                {VIBE_LABELS[userProfile.vibe] ?? userProfile.vibe}
              </Text>
            ) : null}
            {userProfile.budget ? (
              <Text style={st.prefLine}>
                <Text style={st.prefLabel}>Budget: </Text>
                {BUDGET_LABELS[userProfile.budget] ?? userProfile.budget}
              </Text>
            ) : null}
            {(userProfile.freeDays?.length > 0 ||
              userProfile.freeTime?.length > 0) && (
              <Text style={st.prefLine}>
                <Text style={st.prefLabel}>Availability: </Text>
                {userProfile.freeDays?.join(", ")} ·{" "}
                {userProfile.freeTime?.join(", ")}
              </Text>
            )}
            <Pressable
              onPress={() => router.push("/(onboarding)/flow")}
              style={{ marginTop: 8 }}
            >
              <Text style={st.editLink}>Edit</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Quick Stats — logged-in only */}
      {isLoggedIn && (
        <View style={st.section}>
          <Text style={st.h3}>Quick Stats</Text>
          <View style={st.statsRow}>
            <View style={st.statCard}>
              <Text style={st.statNumber}>{savedEvents.length}</Text>
              <Text style={st.statLabel}>Events Saved</Text>
            </View>
            <View style={st.statCard}>
              <Text style={st.statNumber}>{goingEvents.length}</Text>
              <Text style={st.statLabel}>Events Going</Text>
            </View>
          </View>
          {createdAt && (
            <Text style={st.memberSince}>
              Member since {new Date(createdAt).toLocaleDateString("en-US")}
            </Text>
          )}
        </View>
      )}

      {/* Sift knows you — logged-in only */}
      {isLoggedIn && tasteProfile && (
        <View style={st.section}>
          <Text style={st.h3}>Sift knows you</Text>
          <View style={st.card}>
            {topCategory && (
              <Text style={st.prefLine}>
                <Text style={st.prefLabel}>Most explored: </Text>
                {CATEGORY_LABELS[topCategory[0]] ?? topCategory[0]}
              </Text>
            )}
            {goingThisMonth > 0 && (
              <Text style={st.prefLine}>
                <Text style={st.prefLabel}>Going this month: </Text>
                {goingThisMonth} event{goingThisMonth !== 1 ? "s" : ""}
              </Text>
            )}
            {totalSwiped > 0 ? (
              <Text style={st.prefLine}>
                <Text style={st.prefLabel}>Events seen: </Text>
                {totalSwiped}
                {totalSwiped < 20 ? " — keep swiping to sharpen your picks" : ""}
              </Text>
            ) : (
              <Text style={[st.prefLine, { color: colors.textSecondary }]}>
                Start swiping — Sift builds your taste as you go.
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Sign out */}
      {isLoggedIn && (
        <Pressable
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/gate");
          }}
          style={st.signOutButton}
        >
          <Text style={st.signOutText}>Sign out</Text>
        </Pressable>
      )}
    </ScrollView>
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
    paddingBottom: 40,
  },
  scrollGuest: {
    flexGrow: 1,
    justifyContent: "center",
  },
  header: { marginBottom: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  guestHeader: {
    alignItems: "center",
    paddingVertical: 32,
    marginBottom: 24,
    gap: 8,
  },
  guestTitle: { ...typography.h3, textAlign: "center", marginTop: 12 },
  guestSub: { ...typography.sm, color: colors.textSecondary, textAlign: "center", lineHeight: 20, paddingHorizontal: 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLoggedIn: { backgroundColor: colors.primary },
  avatarGuest: { borderWidth: 2, borderColor: colors.border },
  avatarText: { fontSize: 20, fontWeight: "600", color: colors.white },
  displayName: { ...typography.body, fontWeight: "600", color: colors.foreground, marginBottom: 2 },
  emailLabel: { ...typography.xs, color: colors.textSecondary, marginBottom: 4 },
  editLink: { ...typography.sm, color: colors.textSecondary },
  signInButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: radius.md,
    alignItems: "center",
    alignSelf: "center",
  },
  signInText: { ...typography.body, fontWeight: "600", color: colors.white },
  section: { marginBottom: 32 },
  h3: { ...typography.h3, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  prefLabel: { ...typography.xs, color: colors.textSecondary },
  prefLine: { ...typography.sm, color: colors.foreground, marginBottom: 8 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  pill: {
    backgroundColor: colors.muted,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  pillText: { ...typography.xs, color: colors.textSecondary },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: { ...typography.sm, color: colors.textSecondary },
  memberSince: { ...typography.xs, color: colors.textSecondary, marginTop: 12 },
  signOutButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  signOutText: { ...typography.sm, color: colors.textSecondary },
});
