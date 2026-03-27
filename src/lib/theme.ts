/**
 * Design tokens extracted from the web app's globals.css.
 * All colors, spacing, and typography in one place.
 */

export const colors = {
  // Core palette (from CSS custom properties)
  background: "#FAF9F7",       // hsl(40 20% 97%)
  foreground: "#1A1F2B",       // hsl(222 22% 14%)
  card: "#FFFFFF",             // hsl(0 0% 100%)
  cardBorder: "#E8E6E3",      // hsl(30 8% 90%)
  border: "#E8E6E3",          // hsl(30 8% 90%)
  primary: "#5A7BAF",          // hsl(214 33% 49%)
  primaryLight: "rgba(90, 123, 175, 0.1)", // hsl(214 33% 49% / 0.1)
  secondary: "#6B6F76",        // hsl(222 5% 44%)
  muted: "#F3F2F0",            // hsl(30 8% 95%)
  accent: "#E8AA6A",           // hsl(30 72% 66%)

  // Semantic
  textPrimary: "#1A1F2B",
  textSecondary: "#6B6F76",
  textMuted: "#8E9196",

  // Pills
  pillCategoryBg: "#F3F2F0",
  pillCategoryText: "#6B6F76",
  pillFreeBg: "rgba(34, 139, 34, 0.1)",
  pillFreeText: "#228B22",
  pillEndingBg: "rgba(200, 60, 60, 0.1)",
  pillEndingText: "#C83C3C",

  // Surfaces
  white: "#FFFFFF",
  black: "#000000",
  overlay: "rgba(0, 0, 0, 0.4)",
};

export const fonts = {
  // Matching web: Inter for UI, Merriweather for headings
  // On mobile we'll use system fonts initially, can add custom fonts later
  regular: undefined as string | undefined,   // System default
  medium: undefined as string | undefined,
  semibold: undefined as string | undefined,
  serif: undefined as string | undefined,      // For hero headings
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  page: 20,       // Horizontal page padding
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
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
  card: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sheet: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },
};
