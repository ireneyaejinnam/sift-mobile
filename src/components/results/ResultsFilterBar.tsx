import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Check, ChevronDown, X } from "lucide-react-native";
import BottomSheet from "@/components/ui/BottomSheet";
import type { Filters, Vibe } from "@/types/quiz";
import type { EventCategory, EventDistance, PriceRange } from "@/types/event";
import { colors, radius, typography } from "@/lib/theme";

const CATEGORIES: { value: EventCategory; label: string; emoji: string }[] = [
  { value: "arts", label: "Arts & Culture", emoji: "🎨" },
  { value: "music", label: "Live Music", emoji: "🎵" },
  { value: "outdoors", label: "Outdoors", emoji: "🌿" },
  { value: "fitness", label: "Fitness", emoji: "🏃" },
  { value: "comedy", label: "Comedy", emoji: "😂" },
  { value: "food", label: "Food & Drink", emoji: "🍷" },
  { value: "nightlife", label: "Nightlife", emoji: "🌙" },
  { value: "theater", label: "Theater", emoji: "🎭" },
  { value: "workshops", label: "Workshops", emoji: "🛠️" },
  { value: "popups", label: "Pop-ups", emoji: "🛍️" },
];

const DISTANCES: { value: EventDistance; label: string }[] = [
  { value: "neighborhood", label: "Close by" },
  { value: "borough", label: "Nearby boroughs" },
  { value: "anywhere", label: "Anywhere in NYC" },
];

const PRICES: { value: PriceRange; label: string }[] = [
  { value: "free", label: "Free only" },
  { value: "under-20", label: "Under $20" },
  { value: "under-50", label: "Under $50" },
  { value: "any", label: "Any price" },
];

const VIBES: { value: Vibe; label: string }[] = [
  { value: "hidden_gems", label: "Hidden gems" },
  { value: "popular", label: "Popular picks" },
  { value: "surprise_me", label: "Surprise me" },
];

type OpenSheet = "categories" | "distance" | "more" | null;

function formatDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function ResultsFilterBar({ filters, onChange }: Props) {
  const [open, setOpen] = useState<OpenSheet>(null);

  const cats = filters.categories ?? [];
  const categoryLabel =
    cats.length === 0
      ? "Category"
      : cats.length === 1
      ? CATEGORIES.find((c) => c.value === cats[0])?.label ?? cats[0]
      : `${cats.length} categories`;

  const distanceLabel = filters.distance
    ? DISTANCES.find((d) => d.value === filters.distance)?.label ?? filters.distance
    : "Distance";

  const moreCount = (filters.price ? 1 : 0) + (filters.vibe ? 1 : 0);
  const moreLabel = moreCount > 0 ? `Filters (${moreCount})` : "More";

  const dateLabel = filters.dateFrom
    ? filters.dateTo && filters.dateTo !== filters.dateFrom
      ? `${formatDate(filters.dateFrom)} – ${formatDate(filters.dateTo)}`
      : formatDate(filters.dateFrom)
    : null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bar}
      >
        {/* Category chip */}
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setOpen("categories")}
            style={[styles.chip, cats.length > 0 && styles.chipActive]}
          >
            <Text style={[styles.chipText, cats.length > 0 && styles.chipTextActive]}>
              {categoryLabel}
            </Text>
            <ChevronDown
              size={11}
              strokeWidth={2}
              color={cats.length > 0 ? colors.primary : colors.textSecondary}
            />
          </Pressable>
          {cats.length > 0 && (
            <Pressable
              onPress={() => onChange({ ...filters, categories: undefined })}
              style={styles.chipClear}
              hitSlop={6}
            >
              <X size={10} strokeWidth={2.5} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {/* Distance chip */}
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setOpen("distance")}
            style={[styles.chip, !!filters.distance && styles.chipActive]}
          >
            <Text style={[styles.chipText, !!filters.distance && styles.chipTextActive]}>
              {distanceLabel}
            </Text>
            <ChevronDown
              size={11}
              strokeWidth={2}
              color={filters.distance ? colors.primary : colors.textSecondary}
            />
          </Pressable>
          {filters.distance && (
            <Pressable
              onPress={() => onChange({ ...filters, distance: undefined })}
              style={styles.chipClear}
              hitSlop={6}
            >
              <X size={10} strokeWidth={2.5} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {/* More chip */}
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setOpen("more")}
            style={[styles.chip, moreCount > 0 && styles.chipActive]}
          >
            <Text style={[styles.chipText, moreCount > 0 && styles.chipTextActive]}>
              {moreLabel}
            </Text>
            <ChevronDown
              size={11}
              strokeWidth={2}
              color={moreCount > 0 ? colors.primary : colors.textSecondary}
            />
          </Pressable>
          {moreCount > 0 && (
            <Pressable
              onPress={() => onChange({ ...filters, price: undefined, vibe: undefined })}
              style={styles.chipClear}
              hitSlop={6}
            >
              <X size={10} strokeWidth={2.5} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {/* Date pill — read-only */}
        {dateLabel && (
          <View style={[styles.chip, styles.chipActive, { opacity: 0.7 }]}>
            <Text style={[styles.chipText, styles.chipTextActive]}>{dateLabel}</Text>
          </View>
        )}
      </ScrollView>

      {/* Category sheet */}
      <BottomSheet open={open === "categories"} onClose={() => setOpen(null)} title="Category">
        <View style={styles.sheetContent}>
          <Text style={styles.sheetLabel}>SELECT UP TO 3</Text>
          {CATEGORIES.map((c) => {
            const selected = cats.includes(c.value);
            const atLimit = cats.length >= 3 && !selected;
            return (
              <Pressable
                key={c.value}
                onPress={() => {
                  if (atLimit) return;
                  const next = selected
                    ? cats.filter((x) => x !== c.value)
                    : [...cats, c.value];
                  onChange({ ...filters, categories: next.length > 0 ? next : undefined });
                }}
                style={styles.option}
              >
                <View
                  style={[
                    styles.checkbox,
                    selected && styles.checkboxSelected,
                    atLimit && styles.checkboxDisabled,
                  ]}
                >
                  {selected && <Check size={9} color={colors.white} strokeWidth={3} />}
                </View>
                <Text style={styles.optionEmoji}>{c.emoji}</Text>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* Distance sheet */}
      <BottomSheet open={open === "distance"} onClose={() => setOpen(null)} title="Distance">
        <View style={styles.sheetContent}>
          {DISTANCES.map((d) => {
            const selected = filters.distance === d.value;
            return (
              <Pressable
                key={d.value}
                onPress={() => {
                  onChange({ ...filters, distance: selected ? undefined : d.value });
                  setOpen(null);
                }}
                style={styles.option}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* More sheet — price + vibe */}
      <BottomSheet open={open === "more"} onClose={() => setOpen(null)} title="More filters">
        <View style={styles.sheetContent}>
          <Text style={styles.sheetLabel}>PRICE</Text>
          {PRICES.map((p) => {
            const selected = filters.price === p.value;
            return (
              <Pressable
                key={p.value}
                onPress={() => onChange({ ...filters, price: selected ? undefined : p.value })}
                style={styles.option}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}

          <Text style={[styles.sheetLabel, { marginTop: 16 }]}>VIBE</Text>
          {VIBES.map((v) => {
            const selected = filters.vibe === v.value;
            return (
              <Pressable
                key={v.value}
                onPress={() => onChange({ ...filters, vibe: selected ? undefined : v.value })}
                style={styles.option}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {v.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  chipText: {
    fontSize: 13,
    color: colors.foreground,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  chipClear: {
    paddingHorizontal: 8,
    justifyContent: "center",
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
  },
  sheetContent: {
    gap: 2,
  },
  sheetLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: colors.textSecondary,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxDisabled: {
    opacity: 0.35,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  optionEmoji: {
    fontSize: 16,
  },
  optionText: {
    ...typography.body,
    color: colors.foreground,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: "500",
  },
});
