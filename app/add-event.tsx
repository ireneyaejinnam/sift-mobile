import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Link as LinkIcon,
  Sparkles,
  X,
} from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/components/ui/Toast";
import { track } from "@/lib/track";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

interface SubmitResponse {
  ok: boolean;
  submission_id: string;
  event_id: string | null;
  extracted: {
    title: string;
    confidence: number;
    sourceUrl: string;
  };
  match: { eventId: string; title: string; similarity: number } | null;
  route: string;
  is_public: boolean;
  is_own_event?: boolean;
  error?: string;
}

type ScreenState = "input" | "loading" | "not_found" | "error";

export default function AddEventScreen() {
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { isLoggedIn } = useUser();

  const [input, setInput] = useState("");
  const [state, setState] = useState<ScreenState>("input");

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

      if (!res.ok || !data.ok) {
        console.error("[add-event] API error:", res.status, data);
        setState("error");
        return;
      }

      // Confidence 0-1: not an event
      if (data.extracted.confidence <= 1 || data.route === "rejected") {
        setState("not_found");
        return;
      }

      // Event created or matched — navigate to full event detail
      if (data.event_id) {
        track("external_event_extracted", {
          source_platform: data.extracted.sourceUrl?.includes("instagram")
            ? "instagram"
            : data.extracted.sourceUrl?.includes("tiktok")
            ? "tiktok"
            : "other",
          confidence: data.extracted.confidence,
          matched: !!data.match,
        });

        // Replace current screen with event detail
        const source = data.match ? "matched" : "created";
        router.replace(`/event/${data.event_id}?from=add-event&source=${source}`);
        showToast(
          data.match && data.is_own_event ? "You already added this event"
            : data.match ? "Found this event in Sift"
            : "Event added"
        );
      } else {
        setState("error");
      }
    } catch (err) {
      console.error("[add-event] Error:", err);
      setState("error");
    }
  }

  // ── Guest gate ──
  if (!isLoggedIn && state === "input") {
    return (
      <View style={s.container}>
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
          <Pressable onPress={() => router.push("/(auth)/signin")} style={[s.submitButton, { minWidth: 200, marginTop: 16 }]}>
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

  // Not found / Error
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
});
