/**
 * Design tokens extracted from the Sift Design System.
 * Clean light-grey canvas, dusty slate-blue primary, warm ochre accent.
 */

export const colors = {
  // Core neutrals
  background: "#F3F4F6",        // app canvas (soft grey)
  bgSubtle: "#F7F8FA",          // section backgrounds
  card: "#FFFFFF",              // card surface
  muted: "#F1F3F6",             // tags, inputs, filled chips
  border: "#E5E7EB",            // hairline
  borderStrong: "#D1D5DB",      // selected / focused border
  overlay: "rgba(17, 24, 39, 0.45)",

  // Text
  foreground: "#111827",        // primary text
  textPrimary: "#111827",
  textSecondary: "#4B5563",     // meta, labels
  textMuted: "#6B7280",         // placeholders, timestamps
  textPlaceholder: "#9CA3AF",

  // Brand — low-sat slate blue
  primary: "#5A7BAF",
  primaryHover: "#4A6A9E",
  primaryLight: "#EEF2F8",      // pale blue (selected bg)
  primarySoft: "#DDE6F1",       // selected border
  primaryFg: "#FFFFFF",

  // Brand — deep charcoal-teal (app icon, splash)
  ink: "#293132",
  inkFg: "#EFEFF0",

  // Accent — warm ochre (ending-soon, on-sale only)
  accent: "#E8AA6A",
  accentHover: "#D79550",
  accentSoft: "rgba(232, 170, 106, 0.15)",

  // Semantic chip colors
  successFg: "#1F7A3A",
  successBg: "#E8F4EC",
  successBorder: "#CCE5D3",

  warnFg: "#A86A24",
  warnBg: "#FBF1E1",
  warnBorder: "#F0DBB7",

  dangerFg: "#B83A3A",
  dangerBg: "#FBECEC",
  dangerBorder: "#EFCFCF",

  // Neutral pill (default category tag)
  pillFg: "#4B5563",
  pillBg: "#F1F3F6",
  pillBorder: "#E5E7EB",

  // Legacy aliases (still referenced in older components)
  secondary: "#4B5563",
  pillCategoryBg: "#F1F3F6",
  pillCategoryText: "#4B5563",
  pillFreeBg: "#E8F4EC",
  pillFreeText: "#1F7A3A",
  pillEndingBg: "#FBF1E1",
  pillEndingText: "#A86A24",

  // Category chip tokens — fg (icon color) + bg (tinted fill)
  catArtsFg: "#9A7244",    catArtsBg: "#F5EEE3",
  catMusicFg: "#3B5A84",   catMusicBg: "#E8EEF7",
  catOutdoorsFg: "#3A6F50", catOutdoorsBg: "#E8F0EA",
  catFitnessFg: "#8A3E38", catFitnessBg: "#F4E6E4",
  catComedyFg: "#7A6B28",  catComedyBg: "#F2EFDC",
  catFoodFg: "#8A541A",    catFoodBg: "#F5E8D6",
  catNightlifeFg: "#4A3070", catNightlifeBg: "#ECE6F3",
  catTheaterFg: "#2F4E70", catTheaterBg: "#E3ECF4",
  catWorkshopsFg: "#3E5A2B", catWorkshopsBg: "#E8EFDC",
  catPopupsFg: "#7A4028",  catPopupsBg: "#F2E4D8",

  // Surfaces
  white: "#FFFFFF",
  black: "#000000",
};

export const fonts = {
  regular: undefined as string | undefined,
  medium: undefined as string | undefined,
  semibold: undefined as string | undefined,
  serif: undefined as string | undefined,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  page: 20,
};

export const radius = {
  sm: 8,     // tags, small chips
  md: 12,    // inputs, row cards, option rows
  lg: 20,    // cards, sheets, event cards
  xl: 28,    // hero / featured
  full: 9999,
};

export const typography = {
  heroHeading: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
    color: colors.foreground,
  },
  sectionHeading: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
    color: colors.foreground,
  },
  h3: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600" as const,
    color: colors.foreground,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400" as const,
    color: colors.foreground,
  },
  sm: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
    color: colors.textSecondary,
  },
  xs: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
    color: colors.textMuted,
  },
  pill: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500" as const,
  },
};

export const shadows = {
  xs: {
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  card: {
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  float: {
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 24,
    elevation: 6,
  },
  sheet: {
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
  },
};
