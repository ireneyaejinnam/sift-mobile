import { useEffect, useMemo } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  Linking,
  StyleSheet,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Bookmark,
  CalendarDays,
  CalendarPlus,
  DollarSign,
  ExternalLink,
  ImageIcon,
  MapPin,
  Share2,
  Ticket,
} from "lucide-react-native";
import BottomSheet from "@/components/ui/BottomSheet";
import SaveToListSheet from "@/components/events/SaveToListSheet";
import ShareSheet from "@/components/events/ShareSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { track } from "@/lib/track";
import { generateGoogleCalendarUrl, shareICSFile } from "@/lib/calendar";
import { fetchEventById } from "@/lib/getEvents";
import { events } from "@/data/events";
import type { SiftEvent } from "@/types/event";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";
import { useState } from "react";

function formatEventDate(event: SiftEvent) {
  if (event.endDate && event.endDate !== event.startDate) {
    return `${event.startDate} - ${event.endDate}`;
  }
  return event.startDate;
}

export default function SharedEventPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const {
    isLoggedIn,
    getSavedListForEvent,
    removeSavedEvent,
    addSavedEvent,
    addSharedWithYou,
  } = useUser();
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [dbEvent, setDbEvent] = useState<SiftEvent | null>(null);

  // Try hardcoded first, then fetch from Supabase
  const localEvent = useMemo(() => events.find((e) => e.id === id), [id]);
  const event = localEvent ?? dbEvent;

  useEffect(() => {
    if (!localEvent && id) {
      fetchEventById(id).then((e) => setDbEvent(e));
    }
  }, [id, localEvent]);

  useEffect(() => {
    if (event) {
      track("shared_link_opened", { event_id: event.id, has_profile: isLoggedIn });
      if (isLoggedIn) {
        addSharedWithYou(event.id);
        addSavedEvent(event.id, "Want to go");
        showToast("Shared with you — saved to your list");
      }
    }
  }, [event?.id]);

  if (!event) {
    return (
      <View style={s.centered}>
        <Text style={s.heading}>Event not found</Text>
        <Text style={s.sub}>This event may have expired or been removed.</Text>
        <Pressable onPress={() => router.back()} style={s.primaryButton}>
          <Text style={s.primaryButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const savedList = getSavedListForEvent(event.id);

  const handleBookmark = () => {
    if (savedList) {
      removeSavedEvent(event.id);
      showToast("Removed from list");
    } else if (isLoggedIn) {
      setSaveSheetOpen(true);
    } else {
      addSavedEvent(event.id, "Want to go");
      showToast("Saved to Want to go");
    }
  };

  // Set web page title for shared links
  useEffect(() => {
    if (Platform.OS === "web" && event) {
      document.title = `${event.title} | Sift`;
    }
  }, [event]);

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable onPress={() => router.back()} style={s.backButton}>
          <ArrowLeft size={18} color={colors.foreground} strokeWidth={1.5} />
          <Text style={s.backText}>Back</Text>
        </Pressable>

        {/* Card */}
        <View style={s.card}>
          {event.imageUrl ? (
            <Image
              source={{ uri: event.imageUrl }}
              style={s.image}
              resizeMode="cover"
            />
          ) : (
            <View style={s.imagePlaceholder}>
              <ImageIcon size={40} strokeWidth={1} color={colors.textMuted} />
            </View>
          )}

          <View style={s.body}>
            {/* Pills */}
            <View style={s.pills}>
              <View style={s.pillCategory}>
                <Text style={s.pillCategoryText}>{event.category}</Text>
              </View>
              {event.endingSoon && (
                <View style={s.pillEnding}>
                  <Text style={s.pillEndingText}>
                    Ends in {event.daysLeft} days
                  </Text>
                </View>
              )}
              {event.price === 0 && (
                <View style={s.pillFree}>
                  <Text style={s.pillFreeText}>Free</Text>
                </View>
              )}
            </View>

            <Text style={s.title}>{event.title}</Text>
            <Text style={s.description}>{event.description}</Text>

            {/* Info rows */}
            <View style={s.infoBlock}>
              <MapPin
                size={18}
                strokeWidth={1.5}
                color={colors.primary}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.infoLabel}>{event.location}</Text>
                <Text style={s.infoSub}>
                  {event.address}, {event.borough}
                </Text>
              </View>
            </View>
            <View style={s.infoBlock}>
              <CalendarDays
                size={18}
                strokeWidth={1.5}
                color={colors.primary}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.infoLabel}>{formatEventDate(event)}</Text>
                <Text style={s.infoSub}>{event.time}</Text>
              </View>
            </View>
            <View style={s.infoBlock}>
              <DollarSign
                size={18}
                strokeWidth={1.5}
                color={colors.primary}
                style={{ marginTop: 2 }}
              />
              <Text style={s.infoLabel}>{event.priceLabel}</Text>
            </View>

            {/* Tags */}
            <View style={s.tags}>
              {event.tags.map((tag) => (
                <View key={tag} style={s.tag}>
                  <Text style={s.tagText}>{tag}</Text>
                </View>
              ))}
            </View>

            {/* Ticket button */}
            {event.ticketUrl ? (
              <Pressable
                onPress={() => Linking.openURL(event.ticketUrl!)}
                style={s.ticketButton}
              >
                <Ticket size={16} strokeWidth={1.5} color={colors.white} />
                <Text style={s.ticketButtonText}>Get tickets</Text>
              </Pressable>
            ) : event.onSaleDate &&
              new Date(event.onSaleDate) > new Date() ? (
              <View style={s.onSaleBadge}>
                <Text style={s.onSaleText}>
                  Tickets drop{" "}
                  {new Date(event.onSaleDate).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              </View>
            ) : null}

            {/* Action row */}
            <View style={s.actionRow}>
              <Pressable
                onPress={() => {
                  track("calendar_export", { event_id: event.id, method: "google" });
                  Linking.openURL(generateGoogleCalendarUrl(event));
                }}
                style={s.actionButton}
              >
                <CalendarPlus
                  size={16}
                  strokeWidth={1.5}
                  color={colors.primary}
                />
                <Text style={s.actionButtonText}>Google Cal</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  track("calendar_export", { event_id: event.id, method: "ics" });
                  const ok = await shareICSFile([event]);
                  if (!ok) showToast("Couldn't open calendar");
                }}
                style={s.actionButton}
              >
                <CalendarPlus
                  size={16}
                  strokeWidth={1.5}
                  color={colors.primary}
                />
                <Text style={s.actionButtonText}>Apple Cal</Text>
              </Pressable>
              <Pressable onPress={handleBookmark} style={s.actionButton}>
                <Bookmark
                  size={16}
                  strokeWidth={1.5}
                  color={savedList ? colors.primary : colors.foreground}
                  fill={savedList ? colors.primary : "none"}
                />
                <Text style={s.actionButtonText}>
                  {savedList ? "Saved" : "Save"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShareSheetOpen(true)}
                style={s.actionButton}
              >
                <Share2
                  size={16}
                  strokeWidth={1.5}
                  color={colors.foreground}
                />
                <Text style={s.actionButtonText}>Share</Text>
              </Pressable>
            </View>

            {/* View event link */}
            <Pressable
              onPress={() => Linking.openURL(event.eventUrl || event.link)}
              style={s.viewEventButton}
            >
              <Text style={s.viewEventText}>View on source</Text>
              <ExternalLink
                size={14}
                strokeWidth={1.5}
                color={colors.primary}
              />
            </Pressable>
          </View>
        </View>

        {/* CTA for non-users */}
        {!isLoggedIn && (
          <View style={s.ctaCard}>
            <Text style={s.ctaHeading}>Want personalized picks?</Text>
            <Text style={s.ctaSub}>
              Tell us what you're into and we'll recommend the best events for
              your weekend.
            </Text>
            <Pressable
              onPress={() => router.push("/(onboarding)/flow")}
              style={s.primaryButton}
            >
              <Text style={s.primaryButtonText}>Try Sift</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <BottomSheet
        open={saveSheetOpen}
        onClose={() => setSaveSheetOpen(false)}
        title="Save to list"
      >
        <SaveToListSheet
          eventId={event.id}
          currentListName={savedList}
          onClose={() => setSaveSheetOpen(false)}
          onSaved={(name) => showToast(`Saved to ${name}`)}
        />
      </BottomSheet>
      <BottomSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        title="Share"
      >
        <ShareSheet
          eventId={event.id}
          eventTitle={event.title}
          onClose={() => setShareSheetOpen(false)}
        />
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.page,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingHorizontal: spacing.page,
    paddingBottom: 40,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  backText: { ...typography.sm, color: colors.foreground },
  heading: { ...typography.sectionHeading, marginBottom: 8 },
  sub: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.card,
  },
  image: { width: "100%", height: 260 },
  imagePlaceholder: {
    width: "100%",
    height: 260,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: 20 },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  pillCategory: {
    backgroundColor: colors.pillCategoryBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  pillCategoryText: { ...typography.pill, color: colors.pillCategoryText },
  pillEnding: {
    backgroundColor: colors.pillEndingBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  pillEndingText: { ...typography.pill, color: colors.pillEndingText },
  pillFree: {
    backgroundColor: colors.pillFreeBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  pillFreeText: { ...typography.pill, color: colors.pillFreeText },
  title: {
    ...typography.heroHeading,
    fontSize: 22,
    lineHeight: 30,
    marginBottom: 16,
  },
  description: {
    ...typography.sm,
    color: colors.foreground,
    lineHeight: 22,
    marginBottom: 24,
  },
  infoBlock: { flexDirection: "row", gap: 12, marginBottom: 16 },
  infoLabel: { ...typography.sm, fontWeight: "500", color: colors.foreground },
  infoSub: { ...typography.sm, color: colors.textSecondary, marginTop: 2 },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 20,
    marginTop: 8,
  },
  tag: {
    backgroundColor: colors.muted,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tagText: { ...typography.xs, color: colors.textSecondary },
  ticketButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  ticketButtonText: { ...typography.body, fontWeight: "600", color: colors.white },
  onSaleBadge: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(232, 170, 106, 0.15)",
    marginBottom: 12,
  },
  onSaleText: { ...typography.sm, fontWeight: "500", color: "#C8844A" },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  actionButtonText: { ...typography.xs, fontWeight: "500", color: colors.foreground },
  viewEventButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  viewEventText: { ...typography.sm, fontWeight: "500", color: colors.primary },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.md,
  },
  primaryButtonText: { ...typography.body, fontWeight: "600", color: colors.white },
  ctaCard: {
    marginTop: 24,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: 20,
    alignItems: "center",
  },
  ctaHeading: { ...typography.h3, marginBottom: 8, textAlign: "center" },
  ctaSub: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
});
