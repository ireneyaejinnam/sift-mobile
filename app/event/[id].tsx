import { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  Linking,
  StyleSheet,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  Check,
  DollarSign,
  ExternalLink,
  ImageIcon,
  MapPin,
  Share2,
  Star,
  Ticket,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BottomSheet from "@/components/ui/BottomSheet";
import SaveToListSheet from "@/components/events/SaveToListSheet";
import GoingDateSheet from "@/components/events/GoingDateSheet";
import ShareSheet from "@/components/events/ShareSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { track } from "@/lib/track";
import { recordEventSave, recordEventGoing } from "@/lib/tasteProfile";
import { recordSave as recordSaveInteraction, recordGoing as recordGoingInteraction } from "@/lib/interactions";
import { generateGoogleCalendarUrl, addToDeviceCalendar, shareICSFile } from "@/lib/calendar";
import { isTicketVendorUrl } from "@/lib/ticketUrl";
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
  const { id, from, source } = useLocalSearchParams<{ id: string; from?: string; source?: string }>();
  const fromAddEvent = from === "add-event";
  const isNewlyCreated = fromAddEvent && source === "created";
  const isMatched = fromAddEvent && source === "matched";
  const router = useRouter();
  const { showToast } = useToast();

  // If user arrived via deep link (no back stack), go to discover feed
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/discover");
    }
  };

  const {
    isLoggedIn,
    savedEvents,
    getSavedListForEvent,
    isGoing,
    getGoingEvent,
    toggleGoing,
    updateGoingDate,
    removeSavedEvent,
    addSavedEvent,
    addSharedWithYou,
    markCommitted,
  } = useUser();
  const chosenDateFor = (id: string): string | null =>
    getGoingEvent(id)?.eventDate ??
    savedEvents.find((s) => s.eventId === id)?.eventStartDate ??
    null;
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [saveDateOpen, setSaveDateOpen] = useState(false);
  const [saveDate, setSaveDate] = useState<string | undefined>(undefined);
  const [goingSheetOpen, setGoingSheetOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [dbEvent, setDbEvent] = useState<SiftEvent | null>(null);
  const [dbLoading, setDbLoading] = useState(false);

  // Try hardcoded first, then fetch from Supabase
  const localEvent = useMemo(() => events.find((e) => e.id === id), [id]);
  const event = localEvent ?? dbEvent;

  useEffect(() => {
    if (!localEvent && id) {
      setDbLoading(true);
      fetchEventById(id)
        .then((e) => setDbEvent(e))
        .finally(() => setDbLoading(false));
    }
  }, [id, localEvent]);

  // Only auto-save when arriving from an external shared link (not from add-event flow)
  useEffect(() => {
    if (fromAddEvent) return; // user-contributed events: let user choose save/going manually
    if (event && isLoggedIn) {
      const alreadySaved = getSavedListForEvent(event.id);
      const alreadyGoing = isGoing(event.id);
      if (!alreadySaved && !alreadyGoing) {
        track("shared_link_opened", { event_id: event.id, has_profile: isLoggedIn });
        addSharedWithYou(event.id);
        addSavedEvent(event.id, "Want to go", {
          title: event.title,
          startDate: event.startDate,
          endDate: event.endDate,
        });
        showToast("Shared with you — saved to your list");
      }
    }
  }, [event?.id]);

  useEffect(() => {
    if (!event) return;
    AsyncStorage.getItem("sift_first_event_viewed").then((val) => {
      if (!val) {
        track("first_event_viewed", { event_id: event.id, category: event.category });
        AsyncStorage.setItem("sift_first_event_viewed", "1").catch(() => {});
      }
    }).catch(() => {});
  }, [event?.id]);

  // Set web page title for shared links
  useEffect(() => {
    if (Platform.OS === "web" && event) {
      document.title = `${event.title} | Sift`;
    }
  }, [event]);

  const savedList = event ? getSavedListForEvent(event.id) : null;

  // Prompt to add a going event to the user's calendar (Google / Apple).
  const promptCalendar = (ev: SiftEvent) => {
    Alert.alert("Add to calendar", "Choose your calendar", [
      {
        text: "Google Calendar",
        onPress: () => {
          track("calendar_export", { event_id: ev.id, method: "google" });
          Linking.openURL(generateGoogleCalendarUrl(ev));
        },
      },
      {
        text: "Apple Calendar",
        onPress: async () => {
          track("calendar_export", { event_id: ev.id, method: "apple" });
          const nativeAvailable = Platform.OS !== "web" && typeof addToDeviceCalendar === "function";
          const ok = nativeAvailable ? await addToDeviceCalendar(ev) : false;
          if (ok) {
            showToast("Added to calendar");
            return;
          }
          const shared = await shareICSFile([ev]);
          if (shared) showToast("Calendar file ready");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Interested = if already saved, unsave; else open the Save-to-list sheet to
  // pick a list. Multi-date events prompt for a date first.
  const handleInterested = () => {
    if (!event) return;
    if (!isLoggedIn) {
      router.push({ pathname: "/(auth)/signin", params: { returnTo: `/event/${event.id}` } });
      return;
    }
    if (savedList) {
      removeSavedEvent(event.id);
      showToast("Removed from your lists");
      return;
    }
    track("event_saved", { event_id: event.id });
    const isMultiDate = (event.sessions && event.sessions.length > 1) ||
      (!!event.endDate && event.endDate !== event.startDate);
    if (isMultiDate) {
      setSaveDateOpen(true);
    } else {
      setSaveDate(undefined);
      setSaveSheetOpen(true);
    }
  };

  // Going (tap) = mark / unmark going, with calendar prompt + taste parity.
  const handleGoing = () => {
    if (!event) return;
    if (!isLoggedIn) {
      router.push({ pathname: "/(auth)/signin", params: { returnTo: `/event/${event.id}` } });
      return;
    }
    if (isGoing(event.id)) {
      toggleGoing({ eventId: event.id, eventTitle: event.title, eventDate: event.startDate, eventEndDate: event.endDate });
      return;
    }
    const isMultiDay = (event.sessions && event.sessions.length > 1) ||
      (!!event.endDate && event.endDate !== event.startDate);
    if (isMultiDay) {
      setGoingSheetOpen(true);
      return;
    }
    toggleGoing({ eventId: event.id, eventTitle: event.title, eventDate: event.startDate });
    track("event_going", { event_id: event.id, source: "detail" });
    showToast("Marked as going");
    promptCalendar(event);
    recordEventGoing(event.id, event.category, {
      category: event.category, tags: event.tags, borough: event.borough, price: event.price,
    }).catch(() => {});
    recordGoingInteraction(event.id).catch(() => {});
  };

  if (dbLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={s.centered}>
        <Text style={s.heading}>Event not found</Text>
        <Text style={s.sub}>This event may have expired or been removed.</Text>
        <Pressable onPress={goBack} style={s.primaryButton}>
          <Text style={s.primaryButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable onPress={goBack} style={s.backButton}>
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

          {/* Share — overlaid on the image (top-right) */}
          <Pressable
            onPress={() => setShareSheetOpen(true)}
            style={s.imageShareButton}
            hitSlop={8}
          >
            <Share2 size={16} strokeWidth={1.6} color={colors.white} />
            <Text style={s.imageShareText}>Share</Text>
          </Pressable>

          <View style={s.body}>
            {/* Add-event context banners */}
            {isNewlyCreated && (
              <View style={s.addedBanner}>
                <Text style={s.addedBannerText}>Event added — only visible to you</Text>
              </View>
            )}
            {isMatched && (
              <View style={s.matchedBanner}>
                <Text style={s.matchedBannerText}>Found this event in Sift</Text>
              </View>
            )}

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

            {/* Ticket button — only for real ticket vendor URLs */}
            {event.ticketUrl && isTicketVendorUrl(event.ticketUrl) ? (
              <Pressable
                onPress={() => {
                  track("ticket_click", { event_id: event.id, ticket_url: event.ticketUrl });
                  if (event.ticketUrl) WebBrowser.openBrowserAsync(event.ticketUrl);
                  markCommitted(event.id);
                }}
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

            {/* Action row — Interested + Going */}
            <View style={s.detailActions}>
              <Pressable
                onPress={handleInterested}
                onLongPress={handleInterested}
                delayLongPress={300}
                style={[s.detailInterested, savedList && s.detailInterestedActive]}
              >
                <Star
                  size={18}
                  strokeWidth={1.8}
                  color={savedList ? colors.primary : colors.foreground}
                  fill={savedList ? colors.primary : "none"}
                />
                <Text style={[s.detailInterestedText, savedList && s.detailInterestedTextActive]}>
                  Interested
                </Text>
              </Pressable>
              <Pressable onPress={handleGoing} style={s.detailGoing}>
                {isGoing(event.id) ? (
                  <Check size={18} strokeWidth={2.2} color={colors.white} />
                ) : (
                  <CalendarPlus size={18} strokeWidth={1.8} color={colors.white} />
                )}
                <Text style={s.detailGoingText}>Going</Text>
              </Pressable>
            </View>

            {/* View event link */}
            <Pressable
              onPress={() => {
                const url = event.eventUrl || event.link || event.ticketUrl;
                track("event_link_click", { event_id: event.id, url, has_ticket_url: !!event.ticketUrl });
                if (url) WebBrowser.openBrowserAsync(url);
              }}
              style={s.viewEventButton}
            >
              <Text style={s.viewEventText}>View event</Text>
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

      {/* Multi-date save — pick which date before choosing a list */}
      <BottomSheet
        open={saveDateOpen}
        onClose={() => setSaveDateOpen(false)}
        title="Pick a date"
      >
        <GoingDateSheet
          event={event}
          confirmLabel="Choose date"
          initialDate={chosenDateFor(event.id)}
          onConfirm={(date) => {
            // Keep a going copy's date in sync with the save date.
            updateGoingDate(event.id, date);
            // Defer opening the list sheet until this Modal fully dismisses
            // (iOS won't present two native Modals at once).
            setSaveDate(date);
            setSaveDateOpen(false);
            setTimeout(() => setSaveSheetOpen(true), 350);
          }}
          onCancel={() => setSaveDateOpen(false)}
        />
      </BottomSheet>
      <BottomSheet
        open={saveSheetOpen}
        onClose={() => { setSaveSheetOpen(false); setSaveDate(undefined); }}
        title="Save to list"
      >
        <SaveToListSheet
          eventId={event.id}
          eventMeta={{ title: event.title, startDate: saveDate ?? event.startDate, endDate: event.endDate, location: event.location }}
          currentListName={savedList}
          onClose={() => { setSaveSheetOpen(false); setSaveDate(undefined); }}
          onSaved={(name) => {
            showToast(`Saved to ${name}`);
            recordEventSave(event.id, event.category, {
              category: event.category, tags: event.tags, borough: event.borough, price: event.price,
            }).catch(() => {});
            recordSaveInteraction(event.id).catch(() => {});
          }}
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
          eventUrl={event.eventUrl || event.link}
          onClose={() => setShareSheetOpen(false)}
        />
      </BottomSheet>
      <BottomSheet
        open={goingSheetOpen}
        onClose={() => setGoingSheetOpen(false)}
        title="Pick a date"
      >
        <GoingDateSheet
          event={event}
          initialDate={chosenDateFor(event.id)}
          onConfirm={(date) => {
            toggleGoing({
              eventId: event.id,
              eventTitle: event.title,
              eventDate: date,
              eventEndDate: event.endDate,
            });
            const savedList = getSavedListForEvent(event.id);
            if (savedList) {
              addSavedEvent(event.id, savedList, {
                title: event.title, startDate: date, endDate: event.endDate,
              });
            }
            track("event_going", { event_id: event.id, source: "detail" });
            setGoingSheetOpen(false);
            showToast("Marked as going");
            promptCalendar({ ...event, startDate: date, endDate: date });
            recordEventGoing(event.id, event.category, {
              category: event.category, tags: event.tags, borough: event.borough, price: event.price,
            }).catch(() => {});
            recordGoingInteraction(event.id).catch(() => {});
          }}
          onCancel={() => setGoingSheetOpen(false)}
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
  addedBanner: {
    backgroundColor: "rgba(232, 170, 106, 0.15)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  addedBannerText: { ...typography.xs, fontWeight: "500", color: "#C8844A", textAlign: "center" },
  matchedBanner: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  matchedBannerText: { ...typography.xs, fontWeight: "500", color: colors.primary, textAlign: "center" },
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
  imageShareButton: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  imageShareText: { fontSize: 13, fontWeight: "600", color: colors.white },
  detailActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  detailInterested: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  detailInterestedActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  detailInterestedText: { ...typography.body, fontWeight: "600", color: colors.foreground },
  detailInterestedTextActive: { color: colors.primary },
  detailGoing: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  detailGoingText: { ...typography.body, fontWeight: "600", color: colors.white },
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
