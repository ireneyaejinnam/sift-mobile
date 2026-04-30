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
  { id: '71944821963',  name: 'Smorgasburg',            defaultCategory: 'food'       },
  { id: '20080920317',  name: 'Time Out Market NY',     defaultCategory: 'food'       },
  // ── Pop-ups / Markets ───────────────────────────────────────
  { id: '10039210975',  name: 'FAD Market',             defaultCategory: 'popups'     },
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
  // ── Additional Music / Nightlife ────────────────────────────
  // Note: verify IDs via: GET /v3/events/{event_id}/?expand=organizer on any event from that venue
  { id: '80178987919',  name: 'Baby\'s All Right',       defaultCategory: 'live_music' },
  { id: '15225306209',  name: 'The Bell House',          defaultCategory: 'live_music' },
  { id: '108059631798', name: 'Good Room Brooklyn',      defaultCategory: 'nightlife'  },
  { id: '98623503703',  name: 'Sultan Room',             defaultCategory: 'live_music' },
  { id: '16767618769',  name: 'Brooklyn Bazaar',         defaultCategory: 'live_music' },
  { id: '35475817773',  name: 'Villain NYC',             defaultCategory: 'nightlife'  },
  { id: '18404538619',  name: 'Threes Brewing',          defaultCategory: 'food'       },
  { id: '114742148965', name: 'Trans-Pecos',             defaultCategory: 'live_music' },
  { id: '10726044631',  name: 'Rough Trade NYC',         defaultCategory: 'live_music' },
  { id: '8193451277',   name: 'Joe\'s Pub',              defaultCategory: 'live_music' },
  { id: '32397083804',  name: 'Subculture NYC',          defaultCategory: 'theater'    },
  // ── Additional Food & Drink ─────────────────────────────────
  { id: '17827428451',  name: 'Russ & Daughters',        defaultCategory: 'food'       },
  { id: '29612369487',  name: 'Brooklyn Night Bazaar',   defaultCategory: 'food'       },
  { id: '69027975613',  name: 'Le Bain',                 defaultCategory: 'nightlife'  },
  // ── Additional Art & Culture ─────────────────────────────────
  { id: '13580085802',  name: 'Poster House',            defaultCategory: 'art'        },
  { id: '14716968613',  name: 'Fotografiska NY',         defaultCategory: 'art'        },
  { id: '21571898619',  name: 'Metrograph Cinema',       defaultCategory: 'art'        },
  { id: '54817044443',  name: 'Spectacle Theater',       defaultCategory: 'art'        },
  // ── Additional Fitness ───────────────────────────────────────
  { id: '21823631539',  name: 'November Project NYC',    defaultCategory: 'fitness'    },
  { id: '12648527741',  name: 'Black Sheep Running Club', defaultCategory: 'fitness'  },
  // ── Target-demographic venues (IDs to be looked up) ─────────
  // To find an org ID: GET /v3/events/{event_id}/?expand=organizer
  // Venues to add (Williamsburg/Bushwick/LES/Ridgewood vibe):
  // { id: 'TODO', name: 'Nowadays',           defaultCategory: 'nightlife'  },
  // { id: 'TODO', name: 'Knockdown Center',   defaultCategory: 'live_music' },
  // { id: 'TODO', name: 'Public Records',     defaultCategory: 'nightlife'  },
  // { id: 'TODO', name: 'TV Eye',             defaultCategory: 'live_music' },
  // { id: 'TODO', name: 'Sunnyvale Brooklyn', defaultCategory: 'nightlife'  },
  // { id: 'TODO', name: 'Market Hotel',       defaultCategory: 'live_music' },
  // { id: 'TODO', name: 'Alphaville',         defaultCategory: 'art'        },
  // { id: 'TODO', name: "C'mon Everybody",    defaultCategory: 'live_music' },
  // { id: 'TODO', name: 'National Sawdust',   defaultCategory: 'live_music' },
  // { id: 'TODO', name: 'Roulette',           defaultCategory: 'live_music' },
  // { id: 'TODO', name: 'BRIC',               defaultCategory: 'art'        },
  // { id: 'TODO', name: 'Nitehawk Cinema',    defaultCategory: 'art'        },
  // { id: 'TODO', name: 'Lot 45',             defaultCategory: 'nightlife'  },
  // { id: 'TODO', name: 'Our Wicked Lady',    defaultCategory: 'live_music' },
  // { id: 'TODO', name: 'Forrest Point',      defaultCategory: 'nightlife'  },
  // { id: 'TODO', name: 'Artists & Fleas',    defaultCategory: 'popups'     },
  // { id: 'TODO', name: 'Hester Street Fair', defaultCategory: 'popups'     },
  // { id: 'TODO', name: 'Jalopy Theatre',     defaultCategory: 'live_music' },
  // { id: 'TODO', name: 'Catland Books',      defaultCategory: 'workshops'  },
  // { id: 'TODO', name: 'Maison Premiere',    defaultCategory: 'food'       },
];

// Curated Luma calendar slugs for NYC events.
// To find a slug: go to a Luma calendar page (e.g. lu.ma/pitch-and-run),
// the slug is the part after lu.ma/.
// To find a specific org: search lu.ma, go to their calendar, copy the URL.
export const LUMA_SEED_CALENDARS: { slug: string; name: string; defaultCategory: string }[] = [
  { slug: 'pitchandrun',      name: 'Pitch and Run',       defaultCategory: 'fitness'   },
  // Add more as you find them — format: { slug: 'the-url-slug', name: 'Display Name', defaultCategory: 'category' }
  // Good ones to look for: run clubs, art collectives, market organizers, nightlife venues
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
