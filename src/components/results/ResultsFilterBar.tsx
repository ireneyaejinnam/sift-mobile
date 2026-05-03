import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import {
  Check,
  ChevronDown,
  Drama,
  Dumbbell,
  Laugh,
  Moon,
  Music,
  Palette,
  ShoppingBag,
  Trees,
  Trophy,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";
import DateRangePicker from "@/components/quiz/DateRangePicker";
import BottomSheet from "@/components/ui/BottomSheet";
import type { Filters, Vibe } from "@/types/quiz";
import type { BoroughName, EventCategory, PriceRange } from "@/types/event";
import { colors, radius, typography } from "@/lib/theme";

const CATEGORIES: { value: EventCategory; label: string; Icon: LucideIcon; chipBg: string; chipFg: string }[] = [
  { value: "arts",      label: "Arts & Culture", Icon: Palette,     chipBg: "#F5EDE8", chipFg: "#8B5E3C" },
  { value: "music",     label: "Live Music",     Icon: Music,        chipBg: "#E8EFF5", chipFg: "#2C4F70" },
  { value: "outdoors",  label: "Outdoors",       Icon: Trees,        chipBg: "#E8F2EC", chipFg: "#2D6644" },
  { value: "fitness",   label: "Fitness",        Icon: Dumbbell,     chipBg: "#F5ECEB", chipFg: "#7A2E28" },
  { value: "comedy",    label: "Comedy",         Icon: Laugh,        chipBg: "#F5F2E8", chipFg: "#6E6020" },
  { value: "food",      label: "Food & Drink",   Icon: Utensils,     chipBg: "#F5F0E8", chipFg: "#7A4810" },
  { value: "nightlife", label: "Nightlife",      Icon: Moon,         chipBg: "#EEEAF5", chipFg: "#3A2060" },
  { value: "theater",   label: "Theater",        Icon: Drama,        chipBg: "#E8EFF5", chipFg: "#1E4060" },
  { value: "workshops", label: "Workshops",      Icon: Wrench,       chipBg: "#ECF2E8", chipFg: "#304E20" },
  { value: "popups",    label: "Pop-ups",        Icon: ShoppingBag,  chipBg: "#F5EDEA", chipFg: "#6A3820" },
  { value: "sports",    label: "Sports",         Icon: Trophy,       chipBg: "#E8F0E8", chipFg: "#2D5A3A" },
];

const BOROUGHS: BoroughName[] = [
  "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island",
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

function formatDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
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
  );
}

function SheetOption({
  label,
  Icon,
  iconBg,
  iconFg,
  selected,
  multi,
  onPress,
}: {
  label: string;
  Icon?: LucideIcon;
  iconBg?: string;
  iconFg?: string;
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
      {Icon && (
        <View style={[styles.optionIconWrap, { backgroundColor: iconBg ?? colors.border }]}>
          <Icon size={14} color={iconFg ?? colors.textSecondary} strokeWidth={1.5} />
        </View>
      )}
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

type OpenSheet = "categories" | "date" | "distance" | "more" | null;

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function ResultsFilterBar({ filters, onChange }: Props) {
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);

  const cats = filters.categories ?? [];
  const allCategoryValues = CATEGORIES.map((c) => c.value);
  const allCatsSelected =
    cats.length === allCategoryValues.length &&
    allCategoryValues.every((value) => cats.includes(value));
  const categoryLabel =
    cats.length === 0 || allCatsSelected
      ? "All Moods"
      : cats.length === 1
      ? CATEGORIES.find((c) => c.value === cats[0])?.label ?? cats[0]
      : `${cats.length} moods`;

  const dateLabel = filters.dateFrom
    ? filters.dateTo && filters.dateTo !== filters.dateFrom
      ? `${formatDate(filters.dateFrom)} – ${formatDate(filters.dateTo)}`
      : formatDate(filters.dateFrom)
    : "Flexible";

  const selectedBoroughs = filters.boroughs ?? [];
  const distLabel =
    selectedBoroughs.length === 0
      ? "All Boroughs"
      : selectedBoroughs.length === 1
      ? selectedBoroughs[0]
      : `${selectedBoroughs.length} boroughs`;

  const moreCount = (filters.price ? 1 : 0) + (filters.vibe ? 1 : 0);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipBar}>
        <Chip
          label={categoryLabel}
          active={cats.length > 0 && !allCatsSelected}
          onPress={() => setOpenSheet("categories")}
        />
        <Chip
          label={dateLabel}
          active={!!filters.dateFrom}
          onPress={() => setOpenSheet("date")}
        />
        <Chip
          label={distLabel}
          active={selectedBoroughs.length > 0}
          onPress={() => setOpenSheet("distance")}
        />
        <Chip
          label={moreCount > 0 ? `Filters (${moreCount})` : "More"}
          active={moreCount > 0}
          onPress={() => setOpenSheet("more")}
        />
      </ScrollView>

      {/* Mood / Category sheet */}
      <BottomSheet open={openSheet === "categories"} onClose={() => setOpenSheet(null)} title="Mood">
        <View style={styles.sheetContent}>
          <SheetOption
            label="Select All"
            selected={allCatsSelected}
            multi
            onPress={() =>
              onChange({
                ...filters,
                categories: allCatsSelected ? undefined : allCategoryValues,
              })
            }
          />
          <View style={styles.sheetDivider} />
          {CATEGORIES.map((c) => {
            const selected = cats.includes(c.value);
            return (
              <SheetOption
                key={c.value}
                label={c.label}
                Icon={c.Icon}
                iconBg={c.chipBg}
                iconFg={c.chipFg}
                selected={selected}
                multi
                onPress={() => {
                  const next = selected
                    ? cats.filter((x) => x !== c.value)
                    : [...cats, c.value];
                  onChange({ ...filters, categories: next.length > 0 ? next : undefined });
                }}
              />
            );
          })}
        </View>
      </BottomSheet>

      {/* Date sheet */}
      <BottomSheet open={openSheet === "date"} onClose={() => setOpenSheet(null)} title="Date">
        <View style={styles.sheetContent}>
          <SheetOption
            label="Flexible"
            selected={!filters.dateFrom}
            multi
            onPress={() => onChange({ ...filters, dateFrom: undefined, dateTo: undefined })}
          />
          <View style={styles.sheetDivider} />
          <View style={{ marginTop: 4 }}>
            <DateRangePicker
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              onChange={(from, to) => onChange({ ...filters, dateFrom: from, dateTo: to })}
            />
          </View>
        </View>
      </BottomSheet>

      {/* Borough sheet */}
      <BottomSheet open={openSheet === "distance"} onClose={() => setOpenSheet(null)} title="Borough">
        <View style={styles.sheetContent}>
          <SheetOption
            label="Select All"
            selected={selectedBoroughs.length === 0}
            multi
            onPress={() => onChange({ ...filters, boroughs: undefined })}
          />
          <View style={styles.sheetDivider} />
          {BOROUGHS.map((b) => {
            const isSelected = selectedBoroughs.length === 0 || selectedBoroughs.includes(b);
            return (
              <SheetOption
                key={b}
                label={b}
                selected={isSelected}
                multi
                onPress={() => {
                  if (selectedBoroughs.length === 0) {
                    onChange({ ...filters, boroughs: [b] });
                  } else {
                    const next = selectedBoroughs.includes(b)
                      ? selectedBoroughs.filter((x) => x !== b)
                      : [...selectedBoroughs, b];
                    onChange({ ...filters, boroughs: next.length > 0 ? next : undefined });
                  }
                }}
              />
            );
          })}
        </View>
      </BottomSheet>

      {/* More sheet (budget + vibe) */}
      <BottomSheet open={openSheet === "more"} onClose={() => setOpenSheet(null)} title="More filters">
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
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.full,
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
  optionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
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
