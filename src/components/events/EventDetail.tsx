import { useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Linking,
  Platform,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Check,
  ExternalLink,
  ImageIcon,
  MapPin,
  Share2,
  Ticket,
} from "lucide-react-native";
import BottomSheet from "@/components/ui/BottomSheet";
import SaveEventSheet from "@/components/events/SaveEventSheet";
import GoingDateSheet from "@/components/events/GoingDateSheet";
import ShareSheet from "@/components/events/ShareSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import type { SiftEvent, EventSession } from "@/types/event";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";
import { scoreSession, getBudgetMax } from "@/lib/recommend";
import { formatNYCDate } from "@/lib/time";

interface EventDetailProps {
  event: SiftEvent;
  onBack: () => void;
  onRequestSignIn?: () => void;
}

function formatShortDate(d: string): string {
  return formatNYCDate(d, { weekday: "short", month: "short", day: "numeric" });
}

function formatSessionPrice(s: EventSession): string | null {
  if (s.priceMin === 0) return "Free";
  if (s.priceMin != null && s.priceMax != null && s.priceMin !== s.priceMax) return `$${s.priceMin}–$${s.priceMax}`;
  if (s.priceMin != null) return `$${s.priceMin}`;
  return null;
}

function formatEventDate(event: SiftEvent) {
  if (event.endDate && event.endDate !== event.startDate) {
    return `${event.startDate} – ${event.endDate}`;
  }
  return event.startDate;
}

export default function EventDetail({
  event,
  onBack,
  onRequestSignIn,
}: EventDetailProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const {
    isLoggedIn,
    userProfile,
    getSavedListForEvent,
    removeSavedEvent,
    toggleGoing,
    isGoing,
  } = useUser();

  // Score and sort sessions for display
  const sessions = event.sessions ?? [];
  const scoredSessions = sessions.length > 1
    ? [...sessions]
        .map((s) => ({
          session: s,
          pts: userProfile
            ? scoreSession(s, userProfile, getBudgetMax(userProfile.budget)).pts
            : 0,
        }))
        .sort((a, b) => b.pts - a.pts)
    : [];

  const sessionKey = (s: { startDate: string; time?: string }) => `${s.startDate}::${s.time ?? ""}`;
  const defaultKey = scoredSessions.length > 0 ? sessionKey(scoredSessions[0].session) : null;
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(defaultKey);

  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [goingSheetOpen, setGoingSheetOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);

  const savedList = getSavedListForEvent(event.id);
  const going = isGoing(event.id);

  const handleBookmarkPress = () => {
    if (savedList) {
      removeSavedEvent(event.id);
      showToast("Removed from list");
    } else {
      setSaveSheetOpen(true);
    }
  };

  // Range exhibitions (no sessions array, just a date span) still need the sheet
  const isRangeExhibition = sessions.length <= 1 && !!event.endDate && event.endDate !== event.startDate;

  const handleGoingPress = () => {
    if (going) {
      toggleGoing({
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.startDate,
        eventEndDate: event.endDate,
      });
      return;
    }
    if (!isLoggedIn && onRequestSignIn) {
      onRequestSignIn();
      return;
    }
    // Multi-session event: use the selected session directly
    if (scoredSessions.length > 0 && selectedSessionKey) {
      const date = selectedSessionKey.split("::")[0];
      toggleGoing({ eventId: event.id, eventTitle: event.title, eventDate: date });
      showToast("Marked as going");
      return;
    }
    // Range exhibition: open sheet to pick a day
    if (isRangeExhibition) {
      setGoingSheetOpen(true);
      return;
    }
    toggleGoing({
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.startDate,
    });
    showToast("Marked as going");
  };

  return (
    <View style={styles.container}>
      {/* Sticky back header */}
      <View style={[styles.backHeader, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={18} color={colors.foreground} strokeWidth={1.5} />
          <Text style={styles.backText}>Back to results</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Card */}
        <View style={styles.card}>
          {/* Image */}
          {event.imageUrl ? (
            <Image
              source={{ uri: event.imageUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <ImageIcon size={40} strokeWidth={1} color={colors.textMuted} />
            </View>
          )}

          {/* Image overlay actions */}
          <View style={styles.imageOverlay}>
            <Pressable
              onPress={handleBookmarkPress}
              style={styles.overlayButton}
            >
              <Bookmark
                size={18}
                strokeWidth={1.5}
                color={savedList ? colors.primary : colors.foreground}
                fill={savedList ? colors.primary : "none"}
              />
              <Text style={styles.overlayButtonText}>
                {savedList ? "Saved" : "Save"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShareSheetOpen(true)}
              style={styles.overlayButton}
            >
              <Share2 size={18} strokeWidth={1.5} color={colors.foreground} />
              <Text style={styles.overlayButtonText}>Share</Text>
            </Pressable>
          </View>

          {/* Content */}
          <View style={styles.body}>
            {/* Pills */}
            <View style={styles.pills}>
              <View style={styles.pillCategory}>
                <Text style={styles.pillCategoryText}>{event.category}</Text>
              </View>
              {event.endingSoon && (
                <View style={styles.pillEnding}>
                  <Text style={styles.pillEndingText}>
                    Ends in {event.daysLeft} days
                  </Text>
                </View>
              )}
              {event.price === 0 && (
                <View style={styles.pillFree}>
                  <Text style={styles.pillFreeText}>Free</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={styles.title}>{event.title}</Text>

            {/* Description */}
            <Text style={styles.description}>{event.description}</Text>

            {/* Location */}
            <View style={styles.infoBlock}>
              <MapPin size={18} strokeWidth={1.5} color={colors.primary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{event.location}</Text>
                {!event.locationsVary && (
                  <Text style={styles.infoSub}>
                    {event.address}, {event.borough}
                  </Text>
                )}
              </View>
            </View>

            {/* Map preview */}
            {!event.locationsVary && (event.address || event.location) && (() => {
              const encoded = encodeURIComponent(
                [event.address, event.borough, "New York"].filter(Boolean).join(", ")
              );
              const mapsUrl = Platform.OS === "ios"
                ? `maps://0,0?q=${encoded}`
                : `geo:0,0?q=${encoded}`;
              return (
                <Pressable style={styles.mapPreview} onPress={() => Linking.openURL(mapsUrl)}>
                  <WebView
                    source={{ html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}html,body,iframe{width:100%;height:100%;border:0}</style></head><body><iframe src="https://maps.google.com/maps?q=${encoded}&output=embed&zoom=15" allowfullscreen loading="lazy"></iframe></body></html>` }}
                    style={styles.mapWebView}
                    scrollEnabled={false}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    pointerEvents="none"
                  />
                  <View style={StyleSheet.absoluteFill} />
                </Pressable>
              );
            })()}

            {/* Date + Time */}
            <View style={styles.infoBlock}>
              <CalendarDays
                size={18}
                strokeWidth={1.5}
                color={colors.primary}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>
                  {formatEventDate(event)}
                </Text>
                <Text style={styles.infoSub}>{event.time}</Text>
              </View>
            </View>

            {/* Tags */}
            <View style={styles.tags}>
              {event.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>

            {/* Sessions Calendar */}
            {scoredSessions.length > 0 && (() => {
              // Group by date — multiple sessions per date allowed
              const sessionsByDate = new Map<string, typeof scoredSessions>();
              for (const s of scoredSessions) {
                const d = s.session.startDate;
                if (!sessionsByDate.has(d)) sessionsByDate.set(d, []);
                sessionsByDate.get(d)!.push(s);
              }
              const dates = [...sessionsByDate.keys()].sort();
              const selectedDate = selectedSessionKey?.split("::")[0] ?? dates[0];
              const sessionsForDate = sessionsByDate.get(selectedDate) ?? sessionsByDate.get(dates[0]) ?? [];

              const markedDates: Record<string, any> = {};
              for (const date of dates) {
                markedDates[date] = {
                  marked: true,
                  dotColor: date === selectedDate ? colors.white : colors.primary,
                  selected: date === selectedDate,
                  selectedColor: colors.primary,
                  selectedTextColor: colors.white,
                };
              }

              return (
                <View style={styles.sessionsSection}>
                  <Text style={styles.sectionLabel}>Sessions</Text>
                  <Calendar
                    minDate={dates[0]}
                    maxDate={dates[dates.length - 1]}
                    current={selectedDate}
                    onDayPress={(day: { dateString: string }) => {
                      const group = sessionsByDate.get(day.dateString);
                      if (group) setSelectedSessionKey(sessionKey(group[0].session));
                    }}
                    markedDates={markedDates}
                    enableSwipeMonths
                    hideExtraDays={false}
                    theme={{
                      backgroundColor: colors.card,
                      calendarBackground: colors.card,
                      todayTextColor: colors.primary,
                      selectedDayBackgroundColor: colors.primary,
                      selectedDayTextColor: colors.white,
                      dayTextColor: colors.foreground,
                      textDisabledColor: colors.border,
                      arrowColor: colors.primary,
                      monthTextColor: colors.foreground,
                      textMonthFontWeight: "600",
                      textDayFontSize: 14,
                      textMonthFontSize: 15,
                      textDayHeaderFontSize: 12,
                      dotColor: colors.primary,
                    }}
                    style={styles.sessionCalendar}
                  />
                  {sessionsForDate.map(({ session, pts }, i) => {
                    const key = sessionKey(session);
                    const isSelected = selectedSessionKey === key;
                    const isBest = !!userProfile && scoredSessions[0] && key === sessionKey(scoredSessions[0].session);
                    const price = formatSessionPrice(session);
                    const showLocation = session.location && (event.locationsVary || session.location !== event.location);
                    return (
                      <Pressable
                        key={`${key}-${i}`}
                        onPress={() => setSelectedSessionKey(key)}
                        style={[styles.sessionDetail, isSelected && styles.sessionDetailSelected]}
                      >
                        <View style={styles.sessionDetailLeft}>
                          <Text style={[styles.sessionDetailDate, isSelected && styles.sessionDetailTextActive]}>
                            {formatShortDate(session.startDate)}
                            {session.time ? `  ·  ${session.time}` : ""}
                          </Text>
                          {showLocation && (
                            <View style={styles.sessionDetailLocationRow}>
                              <MapPin size={11} strokeWidth={1.5} color={isSelected ? colors.white : colors.textSecondary} />
                              <Text style={[styles.sessionDetailLocation, isSelected && styles.sessionDetailTextActive]} numberOfLines={1}>
                                {session.location}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.sessionDetailRight}>
                          {price && <Text style={[styles.sessionDetailPrice, isSelected && styles.sessionDetailTextActive]}>{price}</Text>}
                          {isBest && (
                            <View style={[styles.mostFitBadge, isSelected && styles.mostFitBadgeSelected]}>
                              <Text style={[styles.mostFitText, isSelected && { color: colors.white }]}>Most Fit</Text>
                            </View>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })()}

            {/* Ticket / On-sale badge */}
            {event.ticketUrl ? (
              <Pressable
                onPress={() => { if (event.ticketUrl) WebBrowser.openBrowserAsync(event.ticketUrl); }}
                style={styles.ticketButton}
              >
                <Ticket size={16} strokeWidth={1.5} color={colors.white} />
                <Text style={styles.ticketButtonText}>Get tickets</Text>
              </Pressable>
            ) : event.onSaleDate && new Date(event.onSaleDate) > new Date() ? (
              <View style={styles.onSaleBadge}>
                <Text style={styles.onSaleText}>
                  Tickets drop {new Date(event.onSaleDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                </Text>
              </View>
            ) : null}

            {/* Action buttons */}
            <View style={styles.actions}>
              <Pressable
                onPress={() => { const url = event.eventUrl || event.link; if (url) WebBrowser.openBrowserAsync(url); }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {event.ticketUrl ? "View event" : "Check it out"}
                </Text>
                <ExternalLink
                  size={16}
                  strokeWidth={1.5}
                  color={colors.white}
                />
              </Pressable>
              <Pressable
                onPress={handleGoingPress}
                style={[
                  styles.goingButton,
                  going && styles.goingButtonActive,
                ]}
              >
                {going && (
                  <Check size={16} strokeWidth={2} color={colors.white} />
                )}
                <Text
                  style={[
                    styles.goingButtonText,
                    going && styles.goingButtonTextActive,
                  ]}
                >
                  Going
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      <BottomSheet
        open={saveSheetOpen}
        onClose={() => setSaveSheetOpen(false)}
        title="Save to list"
      >
        <SaveEventSheet
          event={event}
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
          userProfile={userProfile}
          onConfirm={(date) => {
            toggleGoing({
              eventId: event.id,
              eventTitle: event.title,
              eventDate: date,
              eventEndDate: event.endDate,
            });
            setGoingSheetOpen(false);
            showToast("Marked as going");
          }}
          onCancel={() => setGoingSheetOpen(false)}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backHeader: {
    paddingHorizontal: spacing.page,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: spacing.page,
    paddingBottom: 40,
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.card,
  },
  image: {
    width: "100%",
    height: 260,
  },
  imagePlaceholder: {
    width: "100%",
    height: 260,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  imageOverlay: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 2,
  },
  overlayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  overlayButtonText: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
  },
  body: {
    padding: 20,
  },
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
  pillCategoryText: {
    ...typography.pill,
    color: colors.pillCategoryText,
  },
  pillEnding: {
    backgroundColor: colors.pillEndingBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  pillEndingText: {
    ...typography.pill,
    color: colors.pillEndingText,
  },
  pillFree: {
    backgroundColor: colors.pillFreeBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  pillFreeText: {
    ...typography.pill,
    color: colors.pillFreeText,
  },
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
  mapPreview: {
    height: 160,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapWebView: {
    flex: 1,
  },
  infoBlock: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  infoLabel: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
  },
  infoSub: {
    ...typography.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sessionsSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    ...typography.xs,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sessionCalendar: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  sessionDetail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: 6,
  },
  sessionDetailSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  sessionDetailLeft: {
    flex: 1,
    gap: 3,
  },
  sessionDetailRight: {
    alignItems: "flex-end",
    gap: 4,
    marginLeft: 8,
  },
  sessionDetailDate: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
  },
  sessionDetailTextActive: {
    color: colors.white,
  },
  sessionDetailLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  sessionDetailLocation: {
    ...typography.xs,
    color: colors.textSecondary,
    flex: 1,
  },
  sessionDetailPrice: {
    ...typography.sm,
    color: colors.textSecondary,
  },
  mostFitBadge: {
    backgroundColor: `${colors.primary}25`,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
  },
  mostFitBadgeSelected: {
    backgroundColor: `${colors.white}30`,
  },
  mostFitText: {
    ...typography.xs,
    fontWeight: "600",
    color: colors.primary,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 24,
    marginTop: 8,
  },
  tag: {
    backgroundColor: colors.muted,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tagText: {
    ...typography.xs,
    color: colors.textSecondary,
  },
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
  ticketButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
  onSaleBadge: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(232, 170, 106, 0.15)",
    marginBottom: 12,
  },
  onSaleText: {
    ...typography.sm,
    fontWeight: "500",
    color: "#C8844A",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  primaryButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
  goingButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  goingButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  goingButtonText: {
    ...typography.body,
    fontWeight: "500",
    color: colors.foreground,
  },
  goingButtonTextActive: {
    color: colors.white,
  },
});
