import { useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
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
import type { SiftEvent } from "@/types/event";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

interface EventDetailProps {
  event: SiftEvent;
  onBack: () => void;
  onRequestSignIn?: () => void;
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
  const { showToast } = useToast();
  const {
    isLoggedIn,
    getSavedListForEvent,
    removeSavedEvent,
    toggleGoing,
    isGoing,
  } = useUser();
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

  const isMultiDate = (event.dates && event.dates.length > 1) ||
    (!!event.endDate && event.endDate !== event.startDate);

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
    if (isMultiDate) {
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={18} color={colors.foreground} strokeWidth={1.5} />
          <Text style={styles.backText}>Back to results</Text>
        </Pressable>

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
              <MapPin
                size={18}
                strokeWidth={1.5}
                color={colors.primary}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{event.location}</Text>
                <Text style={styles.infoSub}>
                  {event.address}, {event.borough}
                </Text>
              </View>
            </View>

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

            {/* Ticket / On-sale badge */}
            {event.ticketUrl ? (
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(event.ticketUrl!)}
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
                onPress={() => WebBrowser.openBrowserAsync(event.eventUrl || event.link)}
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
  scrollContent: {
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
