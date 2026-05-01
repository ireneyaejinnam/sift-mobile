import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Check,
  Link as LinkIcon,
  MapPin,
  Sparkles,
  X,
} from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/Toast";
import BottomSheet from "@/components/ui/BottomSheet";
import SaveEventSheet from "@/components/events/SaveEventSheet";
import { track } from "@/lib/track";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

interface ExtractedEvent {
  title: string;
  description: string;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  venue: string | null;
  address: string | null;
  borough: string | null;
  price: number | null;
  priceLabel: string | null;
  category: string | null;
  ticketUrl: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  confidence: number;
}

interface SubmitResponse {
  ok: boolean;
  submission_id: string;
  extracted: ExtractedEvent;
  match: { eventId: string; title: string; similarity: number } | null;
  route: string;
  existing_event: any | null;
  error?: string;
}

type ScreenState = "input" | "loading" | "preview" | "not_found" | "error";

export default function AddEventScreen() {
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const {
    isLoggedIn,
    toggleGoing,
    isGoing,
    addSavedEvent,
    getSavedListForEvent,
  } = useUser();

  const [input, setInput] = useState("");
  const [state, setState] = useState<ScreenState>("input");
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);

  // Auto-fill and submit from share intent
  useEffect(() => {
    if (!isLoggedIn && state === "input") {
      return;
    }

    if (prefill) {
      setInput(prefill);
      if (isValidUrl(prefill)) {
        submitUrl(prefill);
      }
    }
  }, [prefill, isLoggedIn]);

  function isValidUrl(s: string): boolean {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function submitUrl(url?: string) {
    const submitValue = url ?? input.trim();
    if (!submitValue) return;

    setState("loading");
    setResult(null);

    try {
      const body: Record<string, string> = {};
      if (isValidUrl(submitValue)) {
        body.url = submitValue;
      } else {
        body.text = submitValue;
      }

      const apiBase = process.env.EXPO_PUBLIC_API_URL ?? "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      // Attach auth token if logged in
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          headers["Authorization"] = `Bearer ${data.session.access_token}`;
        }
      }

      const res = await fetch(`${apiBase}/api/submit-event`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data: SubmitResponse = await res.json();

      if (!res.ok || !data.ok || !data.extracted) {
        console.error("[add-event] API error:", res.status, data);
        setState("error");
        return;
      }

      if (data.extracted.confidence <= 1) {
        setState("not_found");
        setResult(data);
        return;
      }

      setState("preview");
      setResult(data);

      track("external_event_extracted", {
        source_platform: data.extracted.sourceUrl?.includes("instagram")
          ? "instagram"
          : data.extracted.sourceUrl?.includes("tiktok")
          ? "tiktok"
          : "other",
        confidence: data.extracted.confidence,
        matched: !!data.match,
      });
    } catch {
      setState("error");
    }
  }

  const extracted = result?.extracted;
  const isLowConfidence = extracted && extracted.confidence >= 2 && extracted.confidence <= 4;
  const isMatched = !!result?.match;
  const displayEvent = result?.existing_event ?? extracted;

  const matchedEventId = result?.match?.eventId;
  const resolvedTitle = extracted?.title || displayEvent?.title || "";
  const resolvedStartDate = extracted?.startDate || displayEvent?.start_date || "";
  const resolvedEndDate = extracted?.endDate || displayEvent?.end_date || undefined;

  const trackSource = () => ({
    source_platform: extracted?.sourceUrl?.includes("instagram")
      ? "instagram"
      : extracted?.sourceUrl?.includes("tiktok")
      ? "tiktok"
      : "other",
    confidence: extracted?.confidence,
    matched: isMatched,
  });

  // Save/Going only work for matched events (real event IDs in the events table)
  const handleSave = () => {
    if (!matchedEventId) return;
    addSavedEvent(matchedEventId, "Want to go", {
      title: resolvedTitle,
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
    });
    track("external_event_added", { ...trackSource() });
    showToast("Saved to your list");
    router.back();
  };

  const handleGoing = () => {
    if (!matchedEventId) return;
    toggleGoing({
      eventId: matchedEventId,
      eventTitle: resolvedTitle,
      eventDate: resolvedStartDate,
      eventEndDate: resolvedEndDate,
    });
    track("external_event_added", { ...trackSource(), action: "going" });
    showToast("Marked as going");
    router.back();
  };

  // For unmatched drafts — just acknowledge and go back
  const handleAcknowledgeDraft = () => {
    track("external_event_added", { ...trackSource(), action: "noted" });
    showToast("Got it — we'll keep an eye on this event");
    router.back();
  };

  // ── Guest gate ──
  if (!isLoggedIn && state === "input") {
    return (
      <View style={[s.container, s.centered]}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={1.5} />
          </Pressable>
          <Text style={s.headerTitle}>Add an event</Text>
          <View style={{ width: 20 }} />
        </View>
        <View style={[s.centered, { flex: 1 }]}>
          <Text style={s.notFoundTitle}>Sign in to add events</Text>
          <Text style={s.notFoundSub}>
            Create an account to submit events from Instagram, TikTok, and more.
          </Text>
          <Pressable onPress={() => router.push("/(auth)/signin")} style={s.submitButton}>
            <Text style={s.submitButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Input screen ──
  if (state === "input") {
    return (
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ArrowLeft size={20} color={colors.foreground} strokeWidth={1.5} />
          </Pressable>
          <Text style={s.headerTitle}>Add an event</Text>
          <View style={{ width: 20 }} />
        </View>

        <View style={s.inputSection}>
          <View style={s.inputCard}>
            <LinkIcon size={18} color={colors.textSecondary} strokeWidth={1.5} />
            <TextInput
              style={s.textInput}
              placeholder="Paste an Instagram, TikTok, or event link"
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={() => submitUrl()}
            />
            {input.length > 0 && (
              <Pressable onPress={() => setInput("")} hitSlop={8}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => submitUrl()}
            style={[s.submitButton, !input.trim() && s.submitButtonDisabled]}
            disabled={!input.trim()}
          >
            <Sparkles size={16} color={colors.white} strokeWidth={1.5} />
            <Text style={s.submitButtonText}>Find event</Text>
          </Pressable>

          <Text style={s.hint}>
            Works with Instagram posts, TikTok videos, venue websites, and event pages
          </Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Loading screen ──
  if (state === "loading") {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={s.loadingText}>Looking for event details...</Text>
        <Text style={s.loadingHint}>This usually takes a few seconds</Text>
      </View>
    );
  }

  // ── Not found ──
  if (state === "not_found") {
    return (
      <View style={[s.container, s.centered]}>
        <View style={s.notFoundIcon}>
          <X size={32} color={colors.textSecondary} strokeWidth={1.5} />
        </View>
        <Text style={s.notFoundTitle}>Couldn't find an event</Text>
        <Text style={s.notFoundSub}>
          This link doesn't seem to be about a specific event.{"\n"}Try a different one?
        </Text>
        <Pressable onPress={() => { setState("input"); setInput(""); }} style={s.tryAgainButton}>
          <Text style={s.tryAgainText}>Try another link</Text>
        </Pressable>
      </View>
    );
  }

  // ── Error ──
  if (state === "error") {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={s.notFoundTitle}>Something went wrong</Text>
        <Text style={s.notFoundSub}>We couldn't process this link. Try again?</Text>
        <Pressable onPress={() => { setState("input"); setInput(""); }} style={s.tryAgainButton}>
          <Text style={s.tryAgainText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  // ── Preview screen ──
  if (!extracted) return null;

  const savedList = displayEvent?.id ? getSavedListForEvent(displayEvent.id) : null;
  const going = displayEvent?.id ? isGoing(displayEvent.id) : false;

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={1.5} />
        </Pressable>
        <Text style={s.headerTitle}>
          {isMatched ? "We found this event" : "Event found"}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.previewScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Low confidence banner */}
        {isLowConfidence && (
          <View style={s.lowConfidenceBanner}>
            <AlertTriangle size={16} color="#C8844A" strokeWidth={1.5} />
            <Text style={s.lowConfidenceText}>
              We're not sure about this one — review the details
            </Text>
          </View>
        )}

        {/* Matched banner */}
        {isMatched && (
          <View style={s.matchedBanner}>
            <Check size={16} color={colors.primary} strokeWidth={2} />
            <Text style={s.matchedText}>
              This event is already in Sift
            </Text>
          </View>
        )}

        {/* Event card */}
        <View style={s.previewCard}>
          {(extracted.imageUrl || displayEvent?.image_url) && (
            <Image
              source={{ uri: extracted.imageUrl ?? displayEvent?.image_url }}
              style={s.previewImage}
              resizeMode="cover"
            />
          )}

          <View style={s.previewBody}>
            {extracted.category && (
              <View style={s.categoryPill}>
                <Text style={s.categoryPillText}>{extracted.category}</Text>
              </View>
            )}

            <Text style={s.previewTitle}>
              {extracted.title || displayEvent?.title}
            </Text>

            {(extracted.description || displayEvent?.description) && (
              <Text style={s.previewDescription}>
                {extracted.description || displayEvent?.description}
              </Text>
            )}

            {(extracted.venue || displayEvent?.venue_name) && (
              <View style={s.infoRow}>
                <MapPin size={14} color={colors.primary} strokeWidth={1.5} />
                <Text style={s.infoText}>
                  {extracted.venue ?? displayEvent?.venue_name}
                  {(extracted.borough || displayEvent?.borough) &&
                    ` · ${extracted.borough ?? displayEvent?.borough}`}
                </Text>
              </View>
            )}

            {extracted.startDate && (
              <View style={s.infoRow}>
                <CalendarDays size={14} color={colors.primary} strokeWidth={1.5} />
                <Text style={s.infoText}>
                  {extracted.startDate}
                  {extracted.startTime && ` at ${extracted.startTime}`}
                  {extracted.endDate && extracted.endDate !== extracted.startDate &&
                    ` – ${extracted.endDate}`}
                </Text>
              </View>
            )}

            {extracted.priceLabel && (
              <Text style={s.priceLabel}>{extracted.priceLabel}</Text>
            )}
          </View>
        </View>

        {/* Action buttons */}
        {isMatched ? (
          <View style={s.actions}>
            <Pressable onPress={handleSave} style={s.saveButton}>
              <Bookmark size={16} color={colors.primary} strokeWidth={1.5} />
              <Text style={s.saveButtonText}>Save to my list</Text>
            </Pressable>

            <Pressable onPress={handleGoing} style={s.goingButton}>
              <Check size={16} color={colors.white} strokeWidth={2} />
              <Text style={s.goingButtonText}>Going</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={handleAcknowledgeDraft} style={s.goingButton}>
            <Check size={16} color={colors.white} strokeWidth={2} />
            <Text style={s.goingButtonText}>Got it</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => { setState("input"); setInput(""); setResult(null); }}
          style={s.rejectButton}
        >
          <Text style={s.rejectText}>Not what I'm looking for</Text>
        </Pressable>
      </ScrollView>

      <BottomSheet
        open={saveSheetOpen}
        onClose={() => setSaveSheetOpen(false)}
        title="Save to list"
      >
        <SaveEventSheet
          event={{
            id: result?.match?.eventId ?? result?.submission_id ?? "",
            title: extracted.title,
            category: (extracted.category ?? "popups") as any,
            startDate: extracted.startDate,
            endDate: extracted.endDate ?? undefined,
            description: extracted.description,
            location: extracted.venue ?? "",
            address: extracted.address ?? "",
            borough: (extracted.borough ?? "Manhattan") as any,
            time: extracted.startTime ?? "",
            price: extracted.price ?? 0,
            priceLabel: extracted.priceLabel ?? "",
            link: extracted.ticketUrl ?? extracted.sourceUrl,
            tags: [],
            imageUrl: extracted.imageUrl ?? undefined,
          }}
          currentListName={savedList}
          onClose={() => setSaveSheetOpen(false)}
          onSaved={(name) => {
            showToast(`Saved to ${name}`);
            router.back();
          }}
        />
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: "center", justifyContent: "center", padding: spacing.page },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.page,
    paddingBottom: 12,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.body, fontWeight: "600" },

  // Input
  inputSection: { padding: spacing.page, paddingTop: 32, gap: 16 },
  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...shadows.card,
  },
  textInput: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
    padding: 0,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  submitButtonDisabled: { opacity: 0.4 },
  submitButtonText: { ...typography.body, fontWeight: "600", color: colors.white },
  hint: { ...typography.xs, color: colors.textMuted, textAlign: "center", lineHeight: 18 },

  // Loading
  loadingText: { ...typography.body, fontWeight: "500", color: colors.foreground, marginTop: 20 },
  loadingHint: { ...typography.xs, color: colors.textMuted, marginTop: 6 },

  // Not found
  notFoundIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  notFoundTitle: { ...typography.h3, textAlign: "center", marginBottom: 8 },
  notFoundSub: { ...typography.sm, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  tryAgainButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tryAgainText: { ...typography.sm, fontWeight: "500", color: colors.primary },

  // Preview
  previewScroll: { padding: spacing.page, paddingBottom: 40 },
  lowConfidenceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(232, 170, 106, 0.15)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  lowConfidenceText: { ...typography.xs, color: "#C8844A", fontWeight: "500", flex: 1 },
  matchedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primaryLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  matchedText: { ...typography.xs, color: colors.primary, fontWeight: "500" },

  previewCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 16,
    ...shadows.card,
  },
  previewImage: { width: "100%", height: 200 },
  previewBody: { padding: 16 },
  categoryPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.muted,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    marginBottom: 10,
  },
  categoryPillText: { ...typography.xs, fontWeight: "500", color: colors.textSecondary, textTransform: "capitalize" },
  previewTitle: { ...typography.h3, marginBottom: 8 },
  previewDescription: { ...typography.sm, color: colors.foreground, lineHeight: 22, marginBottom: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  infoText: { ...typography.sm, color: colors.textSecondary, flex: 1 },
  priceLabel: { ...typography.sm, fontWeight: "500", color: colors.foreground, marginTop: 8 },

  // Actions
  actions: { flexDirection: "row", gap: 12, marginBottom: 12 },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  saveButtonText: { ...typography.body, fontWeight: "500", color: colors.primary },
  goingButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  goingButtonText: { ...typography.body, fontWeight: "600", color: colors.white },
  rejectButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  rejectText: { ...typography.sm, color: colors.textMuted },
});
