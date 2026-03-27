export const BOROUGHS_NEIGHBORHOODS: Record<string, string[]> = {
  Manhattan: [
    "Upper East Side",
    "Upper West Side",
    "Midtown",
    "Chelsea",
    "East Village",
    "West Village",
    "Lower East Side",
    "SoHo/Tribeca",
    "Harlem",
    "Washington Heights",
    "Financial District",
  ],
  Brooklyn: [
    "Williamsburg",
    "Bushwick",
    "Park Slope",
    "Bed-Stuy",
    "Crown Heights",
    "Greenpoint",
    "DUMBO",
    "Prospect Heights",
    "Flatbush",
    "Bay Ridge",
  ],
  Queens: [
    "Astoria",
    "Long Island City",
    "Jackson Heights",
    "Flushing",
    "Ridgewood",
  ],
  Bronx: ["South Bronx", "Fordham", "Riverdale"],
  "Staten Island": ["St. George", "Tottenville"],
};

export const BOROUGHS = Object.keys(BOROUGHS_NEIGHBORHOODS);

export const TRAVEL_RANGES = [
  { value: "15min", label: "15 min" },
  { value: "30min", label: "30 min" },
  { value: "45min", label: "45 min" },
  { value: "anywhere", label: "Anywhere in NYC" },
] as const;
