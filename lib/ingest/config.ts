export const SIFT_CATEGORIES = [
  'live_music', 'art', 'comedy', 'outdoors', 'fitness',
  'food', 'nightlife', 'theater', 'workshops', 'popups'
] as const;

export type SiftCategory = typeof SIFT_CATEGORIES[number];

export const TICKETMASTER_CATEGORY_MAP: Record<string, string> = {
  'Music': 'live_music',
  'Arts & Theatre': 'theater',
  'Comedy': 'comedy',
  'Miscellaneous': 'popups',
  'Sports': 'outdoors',
};

export const EVENTBRITE_CATEGORY_MAP: Record<string, string> = {
  'Music': 'live_music',
  'Performing Arts': 'theater',
  'Food & Drink': 'food',
  'Health & Wellness': 'fitness',
  'Nightlife': 'nightlife',
  'Classes': 'workshops',
};

// Curated NYC Eventbrite organizer IDs (confirmed active, verified via API).
// To find more: fetch any Eventbrite event page, call
//   GET /v3/events/{event_id}/?expand=organizer  to get the organizer ID.
// Note: use /v3/organizers/{id}/events/ (NOT /organizations/) — only expand= and continuation= params work.
export const EVENTBRITE_SEED_ORGS: { id: string; name: string; defaultCategory: string }[] = [
  // ── Music / Nightlife ───────────────────────────────────────
  { id: '105655500371', name: 'Elsewhere',              defaultCategory: 'live_music' },
  { id: '37080538453',  name: 'Chelsea Table + Stage',  defaultCategory: 'live_music' },
  { id: '17106924056',  name: 'Raygun Promotion',       defaultCategory: 'live_music' },
  { id: '71776965133',  name: 'Matinée Social Club',    defaultCategory: 'nightlife'  },
  { id: '29446193521',  name: 'VIP Nightlife NYC',      defaultCategory: 'nightlife'  },
  { id: '8625996238',   name: 'Joonbug New York',       defaultCategory: 'nightlife'  },
  { id: '17899496497',  name: 'Union Hall Brooklyn',    defaultCategory: 'live_music' },
  // ── Arts / Culture ──────────────────────────────────────────
  { id: '20002618011',  name: 'Pioneer Works',          defaultCategory: 'art'        },
  { id: '16901317817',  name: 'Art Students League NY', defaultCategory: 'art'        },
  { id: '23392749973',  name: 'The Invisible Dog',      defaultCategory: 'art'        },
  { id: '106544419551', name: 'Instituto Cervantes NY', defaultCategory: 'art'        },
  { id: '65148790433',  name: 'Brooklyn Art Haus',      defaultCategory: 'art'        },
  { id: '8184194121',   name: 'MoMA PS1',               defaultCategory: 'art'        },
  { id: '47369460253',  name: 'Museum of Arts & Design',defaultCategory: 'art'        },
  { id: '2291806125',   name: 'Brooklyn Arts Council',  defaultCategory: 'art'        },
  // ── Comedy ──────────────────────────────────────────────────
  { id: '13580085802',  name: 'Caveat NYC',             defaultCategory: 'comedy'     },
  { id: '19886909683',  name: 'EastVille Comedy Club',  defaultCategory: 'comedy'     },
  { id: '74484939183',  name: 'Flop House Comedy',      defaultCategory: 'comedy'     },
  { id: '8100188167',   name: 'Comic Strip Live',       defaultCategory: 'comedy'     },
  { id: '27620063469',  name: 'Brooklyn Comedy Collective', defaultCategory: 'comedy' },
  { id: '113214153141', name: 'New York Improv Theater',defaultCategory: 'comedy'     },
  // ── Food / Workshops ────────────────────────────────────────
  { id: '13794689586',  name: 'CocuSocial',             defaultCategory: 'food'       },
  { id: '71944821963',  name: 'Smorgasburg',            defaultCategory: 'food'       },
  { id: '9364218875',   name: 'NY Cocktail Expo',       defaultCategory: 'food'       },
  { id: '20080920317',  name: 'Time Out Market NY',     defaultCategory: 'food'       },
  { id: '4223250251',   name: 'General Assembly NYC',   defaultCategory: 'workshops'  },
  // ── Pop-ups / Markets ───────────────────────────────────────
  { id: '10039210975',  name: 'FAD Market',             defaultCategory: 'popups'     },
  { id: '105446759341', name: 'Upscale Fashion Events', defaultCategory: 'popups'     },
  // ── Outdoors / Fitness ──────────────────────────────────────
  { id: '16614815240',  name: 'Prospect Park Alliance', defaultCategory: 'outdoors'   },
  { id: '6201076797',   name: 'NY Adventure Club',      defaultCategory: 'outdoors'   },
  { id: '15679243764',  name: 'NYC Parks GreenThumb',   defaultCategory: 'outdoors'   },
  { id: '105976471551', name: 'The Female Run Club',    defaultCategory: 'fitness'    },
  { id: '11765317731',  name: 'New York Road Runners',  defaultCategory: 'fitness'    },
  // ── Community / Misc ────────────────────────────────────────
  { id: '5993389089',   name: 'NY Public Library Events', defaultCategory: 'workshops' },
  { id: '20004425576',  name: 'Big Reuse',               defaultCategory: 'outdoors'  },
  { id: '6548340747',   name: 'Housing Works Bookstore', defaultCategory: 'art'       },
];

export const MUSEUM_CONFIG = [
  {
    name: 'moma',
    url: 'https://www.moma.org/calendar',
    venue_name: 'Museum of Modern Art',
    address: '11 W 53rd St, New York, NY 10019',
    neighborhood: 'Midtown',
    borough: 'Manhattan',
    latitude: 40.7614,
    longitude: -73.9776,
    price_min: 30,
    price_max: 30,
  },
  {
    name: 'whitney',
    url: 'https://whitney.org/exhibitions',
    venue_name: 'Whitney Museum of American Art',
    address: '99 Gansevoort St, New York, NY 10014',
    neighborhood: 'West Village',
    borough: 'Manhattan',
    latitude: 40.7396,
    longitude: -74.0089,
    price_min: 30,
    price_max: 30,
  },
  {
    name: 'new_museum',
    url: 'https://www.newmuseum.org/exhibitions',
    venue_name: 'New Museum',
    address: '235 Bowery, New York, NY 10002',
    neighborhood: 'Lower East Side',
    borough: 'Manhattan',
    latitude: 40.7224,
    longitude: -73.9929,
    price_min: 18,
    price_max: 18,
  },
  {
    name: 'brooklyn_museum',
    url: 'https://www.brooklynmuseum.org/exhibitions',
    venue_name: 'Brooklyn Museum',
    address: '200 Eastern Pkwy, Brooklyn, NY 11238',
    neighborhood: 'Prospect Heights',
    borough: 'Brooklyn',
    latitude: 40.6712,
    longitude: -73.9636,
    price_min: 20,
    price_max: 20,
  },
];
