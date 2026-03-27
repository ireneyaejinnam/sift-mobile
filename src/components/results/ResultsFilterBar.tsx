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
import { colors, radius, typography, spacing } from "@/lib/theme";

// ── Option data ────────────────────────────────────────────

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
  { value: "neighborhood", label: "Keep it close" },
  { value: "borough", label: "I'll travel a bit" },
  { value: "anywhere", label: "Anywhere in NYC" },
];

const BUDGETS: { value: PriceRange; label: string }[] = [
  { value: "free", label: "Free only" },
  { value: "under-20", label: "Under $20" },
  { value: "under-50", label: "Under $50" },
  { value: "any", label: "Any price" },
];

const VIBES: { value: Vibe; label: string }[] = [
  { value: "hidden_gems", label: "Hidden gems" },
  { value: "popular", label: "Popular spots" },
  { value: "surprise_me", label: "Surprise me" },
];

// ── Helpers ────────────────────────────────────────────────

function formatDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Chip ───────────────────────────────────────────────────

function Chip({
  label,
  active,
  onPress,
  onClear,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onClear?: () => void;
}) {
  return (
    <View style={styles.chipRow}>
      <Pressable
        onPress={onPress}
        style={[styles.chip, active && styles.chipActive]}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>
          {label}
        </Text>
        <ChevronDown
          size={11}
          strokeWidth={2}
          color={active ? colors.primary : colors.textSecondary}
        />
      </Pressable>
      {onClear && (
        <Pressable
          onPress={onClear}
          style={styles.chipClear}
          hitSlop={6}
        >
          <X size={10} strokeWidth={2.5} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

// ── Sheet option row ───────────────────────────────────────

function SheetOption({
  label,
  emoji,
  selected,
  multi,
  onPress,
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  multi?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sheetOption}>
      <View
        style={[
          styles.radioOuter,
          multi && styles.checkboxOuter,
          selected && styles.radioOuterSelected,
        ]}
      >
        {selected && <Check size={9} color={colors.white} strokeWidth={3} />}
      </View>
      {emoji && <Text style={styles.optionEmoji}>{emoji}</Text>}
      <Text
        style={[
          styles.sheetOptionText,
          selected && styles.sheetOptionTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Main ───────────────────────────────────────────────────

type OpenSheet = "categories" | "distance" | "more" | null;

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function ResultsFilterBar({ filters, onChange }: Props) {
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);

  const cats = filters.categories ?? [];
  const categoryLabel =
    cats.length === 0
      ? "Category"
      : cats.length === 1
      ? CATEGORIES.find((c) => c.value === cats[0])?.label ?? cats[0]
      : `${cats.length} selected`;

  const dateLabel =
    filters.dateFrom && filters.dateTo
      ? filters.dateFrom === filters.dateTo
        ? formatDate(filters.dateFrom)
        : `${formatDate(filters.dateFrom)} – ${formatDate(filters.dateTo)}`
      : "Any date";

  const distLabel =
    DISTANCES.find((d) => d.value === filters.distance)?.label ?? "Any distance";

  const moreCount = (filters.price ? 1 : 0) + (filters.vibe ? 1 : 0);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipBar}
      >
        <Chip
          label={categoryLabel}
          active={cats.length > 0}
          onPress={() => setOpenSheet("categories")}
          onClear={
            cats.length > 0
              ? () => onChange({ ...filters, categories: undefined })
              : undefined
          }
        />
        <Chip
          label={distLabel}
          active={!!filters.distance}
          onPress={() => setOpenSheet("distance")}
          onClear={
            filters.distance
              ? () => onChange({ ...filters, distance: undefined })
              : undefined
          }
        />
        <Chip
          label={moreCount > 0 ? `More (${moreCount})` : "More"}
          active={moreCount > 0}
          onPress={() => setOpenSheet("more")}
          onClear={
            moreCount > 0
              ? () =>
                  onChange({
                    ...filters,
                    price: undefined,
                    vibe: undefined,
                  })
              : undefined
          }
        />
      </ScrollView>

      {/* Category sheet */}
      <BottomSheet
        open={openSheet === "categories"}
        onClose={() => setOpenSheet(null)}
        title="Category"
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetSectionLabel}>SELECT UP TO 3</Text>
          {CATEGORIES.map((c) => {
            const isSelected = cats.includes(c.value);
            const atLimit = cats.length >= 3 && !isSelected;
            return (
              <SheetOption
                key={c.value}
                label={c.label}
                emoji={c.emoji}
                selected={isSelected}
                multi
                onPress={() => {
                  if (atLimit) return;
                  const next = isSelected
                    ? cats.filter((x) => x !== c.value)
                    : [...cats, c.value];
                  onChange({
                    ...filters,
                    categories: next.length > 0 ? next : undefined,
                  });
                }}
              />
            );
          })}
        </View>
      </BottomSheet>

      {/* Distance sheet */}
      <BottomSheet
        open={openSheet === "distance"}
        onClose={() => setOpenSheet(null)}
        title="Distance"
      >
        <View style={styles.sheetContent}>
          {DISTANCES.map((d) => (
            <SheetOption
              key={d.value}
              label={d.label}
              selected={filters.distance === d.value}
              onPress={() => {
                onChange({ ...filters, distance: d.value });
                setOpenSheet(null);
              }}
            />
          ))}
        </View>
      </BottomSheet>

      {/* More sheet (budget + vibe) */}
      <BottomSheet
        open={openSheet === "more"}
        onClose={() => setOpenSheet(null)}
        title="More filters"
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetSectionLabel}>BUDGET</Text>
          {BUDGETS.map((b) => (
            <SheetOption
              key={b.value}
              label={b.label}
              selected={filters.price === b.value}
              onPress={() =>
                onChange({
                  ...filters,
                  price: filters.price === b.value ? undefined : b.value,
                })
              }
            />
          ))}
          <View style={styles.sheetDivider} />
          <Text style={styles.sheetSectionLabel}>VIBE</Text>
          {VIBES.map((v) => (
            <SheetOption
              key={v.value}
              label={v.label}
              selected={filters.vibe === v.value}
              onPress={() =>
                onChange({
                  ...filters,
                  vibe: filters.vibe === v.value ? undefined : v.value,
                })
              }
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  chipBar: {
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
    gap: 4,
  },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOuter: {
    borderRadius: 4,
  },
  radioOuterSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionEmoji: {
    fontSize: 16,
  },
  sheetOptionText: {
    ...typography.body,
    color: colors.foreground,
  },
  sheetOptionTextSelected: {
    color: colors.primary,
    fontWeight: "500",
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: colors.textSecondary,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
});
