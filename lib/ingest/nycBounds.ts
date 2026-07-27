// NYC borough bounding boxes — pure, dependency-free (no Supabase client), so
// scripts can import the coordinate check without triggering DB-client init.

export const BOROUGH_BOXES = [
  { name: 'Manhattan',     minLat: 40.6986, maxLat: 40.8820, minLng: -74.0210, maxLng: -73.9070 },
  { name: 'Brooklyn',      minLat: 40.5695, maxLat: 40.7395, minLng: -74.0420, maxLng: -73.8330 },
  { name: 'Queens',        minLat: 40.5413, maxLat: 40.8007, minLng: -73.9630, maxLng: -73.6996 },
  { name: 'Bronx',         minLat: 40.7855, maxLat: 40.9176, minLng: -73.9338, maxLng: -73.7654 },
  { name: 'Staten Island', minLat: 40.4774, maxLat: 40.6514, minLng: -74.2591, maxLng: -74.0341 },
] as const;

/** Returns the NYC borough containing (lat,lng), or null if outside all 5. */
export function extractBoroughFromCoords(lat: number, lng: number): string | null {
  for (const b of BOROUGH_BOXES) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return b.name;
    }
  }
  return null;
}
