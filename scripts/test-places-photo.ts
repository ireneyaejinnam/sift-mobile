/**
 * Quick test — fetches a sample venue photo URL from Google Places.
 * Open the printed URL in your browser to see the image.
 *
 * Usage: npx tsx scripts/test-places-photo.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && !key.startsWith('#') && rest.length) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY!;

const TEST_VENUES = [
  { name: 'Blue Note Jazz Club', borough: 'Manhattan' },
  { name: 'Elsewhere', borough: 'Brooklyn' },
  { name: 'Brooklyn Museum', borough: 'Brooklyn' },
];

async function getPhoto(venueName: string, borough: string) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.photos,places.displayName',
    },
    body: JSON.stringify({
      textQuery: `${venueName} ${borough} New York`,
      maxResultCount: 1,
    }),
  });

  const data = await res.json();
  console.log('  Raw response:', JSON.stringify(data, null, 2).slice(0, 500));
  const photoName = data.places?.[0]?.photos?.[0]?.name;
  if (!photoName) return null;
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${API_KEY}`;
}

async function main() {
  for (const { name, borough } of TEST_VENUES) {
    const url = await getPhoto(name, borough);
    console.log(`\n${name}:`);
    console.log(url ?? '  (not found)');
  }
}

main().catch(console.error);
