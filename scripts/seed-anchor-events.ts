/**
 * seed-anchor-events.ts
 *
 * Seeds lib/ai-collect-data/output/ai_new_events.json with a verified, real-URL
 * anchor list (Frieze, Met Gala, Kith drops, sample sales, Knockdown, etc.) —
 * hand-compiled with WebSearch + WebFetch, window Apr 16 – May 16, 2026.
 *
 * No schema changes. Output shape matches what upsert-ai-events.ts expects.
 *
 * After running this:
 *   npx tsx --env-file=.env lib/ai-collect-data/upsert-ai-events.ts --keep-local
 *
 * Usage:
 *   npx tsx scripts/seed-anchor-events.ts            # write file + validation report
 *   npx tsx scripts/seed-anchor-events.ts --dry      # validation report only
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(__dirname, '..', 'lib', 'ai-collect-data', 'output');
const OUTPUT_PATH = join(OUTPUT_DIR, 'ai_new_events.json');

// sanitizeEvent contract (copied from lib/ai-collect-data/upsert-ai-events.ts)
const VALID_CATEGORIES = new Set([
  'art', 'live_music', 'comedy', 'food', 'outdoors',
  'nightlife', 'popups', 'fitness', 'theater', 'workshops',
]);
const VALID_BOROUGHS = new Set([
  'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Various borough',
]);

// Map the hand-compiled categories to Sift's VALID_CATEGORIES.
const CATEGORY_MAP: Record<string, string> = {
  culture: 'art',
  music: 'live_music',
  sports: 'outdoors',
  fashion: 'popups',
  nightlife: 'nightlife',
  food: 'food',
  theater: 'theater',
  fitness: 'fitness',
  comedy: 'comedy',
  popups: 'popups',
  workshops: 'workshops',
  outdoors: 'outdoors',
  art: 'art',
};

interface AnchorEvent {
  title: string;
  venue: string;
  address?: string;
  borough: string;
  date: string;
  end_date?: string;
  category: string;
  description: string;
  url: string;
  ticket_url?: string;
  is_free?: boolean;
  price_min?: number;
  price_max?: number;
  tags?: string[];
}

const EVENTS: AnchorEvent[] = [
  {
    title: 'MoMA PS1: Greater New York 2026',
    venue: 'MoMA PS1',
    address: '22-25 Jackson Ave, Long Island City, NY 11101',
    borough: 'Queens',
    date: '2026-04-16',
    end_date: '2026-08-24',
    category: 'culture',
    description: "The survey that only happens every five years, landing on PS1's 50th anniversary. 53 NYC-based artists, the entire building, most works never exhibited. The one museum show people are actually planning their weekends around.",
    url: 'https://www.momaps1.org/en/programs/702-greater-new-york-2026',
    price_min: 10,
    tags: ['museum', 'anchor'],
  },
  {
    title: 'Marcel Duchamp Retrospective',
    venue: 'Museum of Modern Art',
    address: '11 W 53rd St, New York, NY 10019',
    borough: 'Manhattan',
    date: '2026-04-12',
    end_date: '2026-08-15',
    category: 'culture',
    description: 'The most comprehensive Duchamp retrospective in the U.S. since 1973 — six decades of the guy who invented the idea that the idea is the art. Easy reason to spend two hours uptown.',
    url: 'https://www.moma.org/calendar/exhibitions',
    price_min: 30,
    price_max: 30,
    tags: ['museum', 'retrospective'],
  },
  {
    title: 'Whitney Biennial 2026',
    venue: 'Whitney Museum of American Art',
    address: '99 Gansevoort St, New York, NY 10014',
    borough: 'Manhattan',
    date: '2026-03-08',
    end_date: '2026-08-23',
    category: 'culture',
    description: '82nd Biennial, 56 artists, the show every gallery person is texting about. Meatpacking after, Westside Highway for the sunset.',
    url: 'https://whitney.org/exhibitions/2026-biennial',
    price_min: 30,
    tags: ['museum', 'anchor'],
  },
  {
    title: 'Frieze New York 2026',
    venue: 'The Shed',
    address: '545 W 30th St, New York, NY 10001',
    borough: 'Manhattan',
    date: '2026-05-13',
    end_date: '2026-05-17',
    category: 'culture',
    description: "The week everyone's downtown is secretly in a cab to Hudson Yards. ~70 galleries, 15th edition, and the Frieze Week party map is basically the social grid for five days.",
    url: 'https://www.theshed.org/program/520-frieze-new-york-2026',
    price_min: 60,
    tags: ['art-fair', 'anchor', 'frieze-week'],
  },
  {
    title: "Met Gala 2026: 'Costume Art' (the steps)",
    venue: 'The Metropolitan Museum of Art',
    address: '1000 5th Ave, New York, NY 10028',
    borough: 'Manhattan',
    date: '2026-05-04',
    category: 'culture',
    description: "You're not in. The sidewalk IS the event. Dress code 'Fashion is Art', Condé Nast Galleries open the next day, and every NYC-based fashion account films from 5th Ave.",
    url: 'https://www.metmuseum.org/about-the-met/press/news/2026/met-gala',
    is_free: true,
    price_min: 0,
    tags: ['anchor', 'fashion-moment'],
  },
  {
    title: 'NYCxDesign 2026 Festival',
    venue: 'Various (200+ venues across NYC)',
    address: 'various places',
    borough: 'Various borough',
    date: '2026-05-14',
    end_date: '2026-05-20',
    category: 'culture',
    description: "200+ events across the boroughs for design week's 14th year — open studios, showrooms, ICFF at Javits 5/17–19. If your apartment has a Hay chair, you're going.",
    url: 'https://nycxdesign.org/festival-calendar',
    is_free: false,
    price_min: 0,
    tags: ['design-week', 'anchor'],
  },
  {
    title: 'Gothic by Design: The Dawn of Architectural Draftsmanship',
    venue: 'The Metropolitan Museum of Art',
    address: '1000 5th Ave, New York, NY 10028',
    borough: 'Manhattan',
    date: '2026-04-16',
    category: 'culture',
    description: 'Opens today at The Met. Drawings of Gothic cathedrals treated as fine art instead of blueprints. A tight, focused show for the 45-minute museum trip, not the marathon one.',
    url: 'https://www.metmuseum.org/exhibitions',
    price_min: 30,
    tags: ['exhibit'],
  },
  {
    title: 'Carol Bove: Rotunda Survey',
    venue: 'Guggenheim Museum',
    address: '1071 5th Ave, New York, NY 10128',
    borough: 'Manhattan',
    date: '2026-04-16',
    end_date: '2026-05-16',
    category: 'culture',
    description: "Geneva-born sculptor takes over Wright's spiral rotunda — her first museum survey. The building itself is the reason you go; Bove gives you the excuse.",
    url: 'https://www.guggenheim.org/exhibitions',
    price_min: 30,
    tags: ['museum'],
  },
  {
    title: 'Long Play Festival 2026 (Oneohtrix Point Never, headliner)',
    venue: 'Pioneer Works',
    address: '159 Pioneer St, Brooklyn, NY 11231',
    borough: 'Brooklyn',
    date: '2026-04-30',
    end_date: '2026-05-03',
    category: 'music',
    description: '70+ concerts across Pioneer Works, Public Records, Littlefield, and a dozen Red Hook spaces. Bang on a Can curated — the kind of festival where you stumble into a solo cello set at midnight.',
    url: 'https://longplayfestival.org',
    price_min: 60,
    tags: ['festival', 'experimental'],
  },
  {
    title: 'Knicks Playoffs Round 1 Game 1 vs Hawks',
    venue: 'Madison Square Garden',
    address: '4 Pennsylvania Plaza, New York, NY 10001',
    borough: 'Manhattan',
    date: '2026-04-18',
    category: 'sports',
    description: 'Playoffs at MSG, 3-seed vs 6-seed, 6pm tip. Peak NYC sports moment — resale is brutal, but the walk through Penn after the buzzer is the thing.',
    url: 'https://www.msg.com/events-tickets/new-york-knicks-atlanta-hawks-madison-square-garden-april-2026/3B00644AE005830D',
    ticket_url: 'https://www.ticketmaster.com/new-york-knicks-tickets/artist/806080',
    price_min: 150,
    tags: ['playoffs', 'anchor'],
  },
  {
    title: 'Subway Series: Yankees @ Citi Field',
    venue: 'Citi Field',
    address: '41 Seaver Way, Queens, NY 11368',
    borough: 'Queens',
    date: '2026-05-15',
    end_date: '2026-05-17',
    category: 'sports',
    description: 'Three-game set, Flushing end of the series. You post the stub, you argue with a stranger on the 7 train, you eat a Shake Shack at the ballpark.',
    url: 'https://www.mlb.com/mets/schedule',
    price_min: 35,
    tags: ['baseball', 'anchor'],
  },
  {
    title: 'RBC Brooklyn Half Marathon 2026',
    venue: 'Prospect Park → Coney Island',
    address: 'Prospect Park, Brooklyn, NY 11215',
    borough: 'Brooklyn',
    date: '2026-05-16',
    category: 'fitness',
    description: 'THE race this crowd runs. Bandit/Tracksmith shakeout runs in the days before are the secondary event, the Riegelmann Boardwalk finish is the primary.',
    url: 'https://events.nyrr.org/rbc-brooklyn-half',
    price_min: 110,
    tags: ['running', 'anchor'],
  },
  {
    title: 'Bandit Running — The Program: Brooklyn Half (Spring 2026)',
    venue: 'Bandit Running (Brooklyn + Manhattan shops)',
    address: '41 Grattan St, Brooklyn, NY 11237',
    borough: 'Brooklyn',
    date: '2026-04-16',
    end_date: '2026-05-16',
    category: 'fitness',
    description: 'Anchor run-club brand. 2x/week coached training into Brooklyn Half. The shakeout run the day before Brooklyn Half is the social event for every runner in the city.',
    url: 'https://banditrunning.com/pages/the-program-spring-2026',
    price_min: 100,
    tags: ['run-club', 'bandit'],
  },
  {
    title: 'Kith for the Knicks 2026 Playoffs (x Giorgio Armani)',
    venue: 'Kith Manhattan',
    address: '337 Lafayette St, New York, NY 10012',
    borough: 'Manhattan',
    date: '2026-04-13',
    end_date: '2026-05-16',
    category: 'fashion',
    description: "Kith × Armani × Knicks playoffs — Armani's first NBA collab. Dropped 4/13, still shoppable in-store. Wear it in the Penn concourse or you weren't there.",
    url: 'https://kith.com/collections/kith-for-the-new-york-knicks-2026-playoffs',
    price_min: 0,
    tags: ['drop', 'kith', 'anchor'],
  },
  {
    title: 'The Elder Statesman Sample Sale',
    venue: '260 Sample Sale — Nomad',
    address: '260 5th Ave, New York, NY 10001',
    borough: 'Manhattan',
    date: '2026-04-29',
    end_date: '2026-05-03',
    category: 'fashion',
    description: 'LA cashmere house, $800 beanies for $150, tie-dye blankets you can afford. Anchor-tier sample sale — in every fashion girl\'s Notes app.',
    url: 'https://donyc.com/events/2026/4/29/the-elder-statesman-tickets',
    tags: ['sample-sale', 'anchor'],
  },
  {
    title: '260 Edit: Denim & Daywear Sample Sale (FRAME + more)',
    venue: '260 Sample Sale',
    address: '260 5th Ave, New York, NY 10001',
    borough: 'Manhattan',
    date: '2026-04-15',
    end_date: '2026-04-19',
    category: 'fashion',
    description: 'FRAME-led multi-brand denim and daywear under one roof at 260 Fifth. Four days only.',
    url: 'https://260samplesale.com/pages/physical-events',
    tags: ['sample-sale'],
  },
  {
    title: 'VIP Stuart Weitzman Sample Sale',
    venue: 'Arlettie NYC',
    address: 'Midtown, Manhattan',
    borough: 'Manhattan',
    date: '2026-04-16',
    end_date: '2026-04-19',
    category: 'fashion',
    description: 'Four-day Weitzman sample sale via Arlettie — the French sample-sale operator NYC fashion people stalk on IG.',
    url: 'https://arlettie.us',
    tags: ['sample-sale'],
  },
  {
    title: 'BeautySpace Sample Sale',
    venue: '260 Sample Sale — Nomad',
    address: '260 5th Ave, New York, NY 10001',
    borough: 'Manhattan',
    date: '2026-04-21',
    end_date: '2026-04-26',
    category: 'fashion',
    description: 'Multi-brand beauty sale at the 260 Fifth Ave location. Good for restocking the medicine cabinet.',
    url: 'https://260samplesale.com/pages/physical-events',
    tags: ['sample-sale', 'beauty'],
  },
  {
    title: 'Oday Shakar Sample Sale',
    venue: 'Oday Shakar NYC (RSVP required)',
    address: 'Manhattan (location on RSVP)',
    borough: 'Manhattan',
    date: '2026-04-16',
    end_date: '2026-04-19',
    category: 'fashion',
    description: 'Red-carpet gown designer does a rare four-day sale, NYC-only, RSVP-gated.',
    url: 'https://odayshakar.com',
    tags: ['sample-sale'],
  },
  {
    title: 'Brock Collection Sample Sale',
    venue: 'WeFashion NYC',
    address: 'Manhattan',
    borough: 'Manhattan',
    date: '2026-04-16',
    end_date: '2026-04-20',
    category: 'fashion',
    description: 'LA romantic-prairie house you see on Instagram weddings — rare NYC sale window.',
    url: 'https://brockcollection.com',
    tags: ['sample-sale'],
  },
  {
    title: 'Brooklyn Flea Record Fair — Spring Edition',
    venue: 'Brooklyn Flea, DUMBO',
    address: '80 Pearl St, Brooklyn, NY 11201',
    borough: 'Brooklyn',
    date: '2026-04-26',
    category: 'fashion',
    description: "One day. Dozens of record dealers under the Manhattan Bridge. Crate-diggers line up at 9am, you'll sift Velvet Underground bootlegs until the coffee kicks in.",
    url: 'https://www.brooklynflea.com',
    is_free: true,
    price_min: 0,
    tags: ['flea', 'records'],
  },
  {
    title: 'Brooklyn Flea — Saturdays + Sundays (outdoor season)',
    venue: 'Brooklyn Flea, DUMBO',
    address: '80 Pearl St, Brooklyn, NY 11201',
    borough: 'Brooklyn',
    date: '2026-04-18',
    end_date: '2026-05-16',
    category: 'fashion',
    description: "Outdoor season is open every Saturday + Sunday under the bridge. Vintage Levi's, cast-iron skillets, a surprise $30 Eames lamp.",
    url: 'https://www.brooklynflea.com',
    is_free: true,
    price_min: 0,
    tags: ['flea', 'vintage'],
  },
  {
    title: 'Artists & Fleas Williamsburg',
    venue: 'Artists & Fleas',
    address: '70 N 7th St, Brooklyn, NY 11249',
    borough: 'Brooklyn',
    date: '2026-04-18',
    end_date: '2026-05-16',
    category: 'fashion',
    description: "Saturdays + Sundays. Indie designers, vintage dealers, and the occasional viral small-brand you've been seeing on your For You page.",
    url: 'https://www.artistsandfleas.com',
    is_free: true,
    price_min: 0,
    tags: ['market', 'vintage'],
  },
  {
    title: 'Peso Pluma — DINASTÍA Tour (w/ Tito Double P)',
    venue: 'Madison Square Garden',
    address: '4 Pennsylvania Plaza, New York, NY 10001',
    borough: 'Manhattan',
    date: '2026-04-30',
    category: 'music',
    description: 'Biggest Latin artist on the planet at MSG. Full DINASTÍA production, Tito Double P opening — this is the one Latin music fans have been waiting for.',
    url: 'https://www.ticketmaster.com/dinastia-tour-by-peso-pluma-tito-new-york-new-york-04-30-2026/event/3B0062C4DFC329C8',
    price_min: 95,
    tags: ['anchor', 'latin'],
  },
  {
    title: 'Bring Me The Horizon',
    venue: 'Madison Square Garden',
    address: '4 Pennsylvania Plaza, New York, NY 10001',
    borough: 'Manhattan',
    date: '2026-05-02',
    category: 'music',
    description: 'Arena rock headline w/ Motionless In White + The Plot In You. The first BMTH NYC arena show since NEX GEN.',
    url: 'https://www.ticketmaster.com/madison-square-garden-tickets-new-york/venue/483329',
    price_min: 65,
    tags: ['arena', 'rock'],
  },
  {
    title: 'Bruce Springsteen & The E Street Band',
    venue: 'Madison Square Garden',
    address: '4 Pennsylvania Plaza, New York, NY 10001',
    borough: 'Manhattan',
    date: '2026-05-11',
    category: 'music',
    description: 'Bruce at The Garden. Three-hour set, full E Street, the dad-rock pilgrimage.',
    url: 'https://brucespringsteen.net/tour',
    price_min: 120,
    tags: ['arena', 'legend'],
  },
  {
    title: 'Bruce Springsteen & The E Street Band (Barclays)',
    venue: 'Barclays Center',
    address: '620 Atlantic Ave, Brooklyn, NY 11217',
    borough: 'Brooklyn',
    date: '2026-05-14',
    category: 'music',
    description: 'Second NYC-area Bruce date, this one in Brooklyn. Barclays acoustics, full E Street.',
    url: 'https://www.barclayscenter.com/events',
    price_min: 120,
    tags: ['arena', 'legend'],
  },
  {
    title: 'Alejandro Sanz — ¿Y ahora qué? Tour',
    venue: 'Barclays Center',
    address: '620 Atlantic Ave, Brooklyn, NY 11217',
    borough: 'Brooklyn',
    date: '2026-04-18',
    category: 'music',
    description: 'Spanish pop icon at Barclays — a 25-Grammy career, the kind of show you bring your mom to and both cry during "Corazón Partío".',
    url: 'https://www.barclayscenter.com/events',
    price_min: 75,
    tags: ['latin', 'arena'],
  },
  {
    title: 'BLESSD — El Mejor Hombre Del Mundo Tour',
    venue: 'Barclays Center',
    address: '620 Atlantic Ave, Brooklyn, NY 11217',
    borough: 'Brooklyn',
    date: '2026-04-17',
    category: 'music',
    description: 'Colombian reggaeton act doing his first Barclays headline. Peak tour, the flex is going before he plays arenas everywhere.',
    url: 'https://www.barclayscenter.com/events',
    price_min: 55,
    tags: ['latin', 'reggaeton'],
  },
  {
    title: 'Peekaboo',
    venue: 'Brooklyn Steel',
    address: '319 Frost St, Brooklyn, NY 11222',
    borough: 'Brooklyn',
    date: '2026-05-02',
    category: 'nightlife',
    description: 'Bass-music producer at the right club in NYC for bass music. Low ceiling, Funktion-One rig, lasers actually hit.',
    url: 'https://www.bkstl.com',
    price_min: 40,
    tags: ['electronic', 'bass'],
  },
  {
    title: 'Fakemink',
    venue: 'Terminal 5',
    address: '610 W 56th St, New York, NY 10019',
    borough: 'Manhattan',
    date: '2026-05-01',
    category: 'music',
    description: 'Miami SoundCloud-to-stage act at Terminal 5. Gen Z audience, glitchy trap, 20-minute encore.',
    url: 'https://www.terminal5nyc.com',
    price_min: 40,
    tags: ['hip-hop', 'underground'],
  },
  {
    title: 'Nettspend',
    venue: 'Terminal 5',
    address: '610 W 56th St, New York, NY 10019',
    borough: 'Manhattan',
    date: '2026-04-28',
    category: 'music',
    description: "Teenage rage-rap kid from Virginia whose TikToks looped all of 2025. This is the 'saw him before he was huge' show.",
    url: 'https://www.terminal5nyc.com',
    price_min: 35,
    tags: ['rage', 'hip-hop'],
  },
  {
    title: 'Good Kid',
    venue: 'Brooklyn Steel',
    address: '319 Frost St, Brooklyn, NY 11222',
    borough: 'Brooklyn',
    date: '2026-04-17',
    category: 'music',
    description: 'Toronto indie-rock band whose song "Alchemist" will not leave your Spotify Wrapped. Sold-out Brooklyn Steel night.',
    url: 'https://www.bkstl.com',
    price_min: 35,
    tags: ['indie', 'sold-out'],
  },
  {
    title: 'Iron & Wine with Improvement Movement',
    venue: 'Brooklyn Steel',
    address: '319 Frost St, Brooklyn, NY 11222',
    borough: 'Brooklyn',
    date: '2026-05-13',
    category: 'music',
    description: 'Sam Beam on a new record, the whispery folk institution at 2026 scale. Bring the person you want to miss brunch for.',
    url: 'https://www.bkstl.com',
    price_min: 50,
    tags: ['folk', 'indie'],
  },
  {
    title: 'CMAT',
    venue: 'Brooklyn Steel',
    address: '319 Frost St, Brooklyn, NY 11222',
    borough: 'Brooklyn',
    date: '2026-05-15',
    category: 'music',
    description: 'Irish country-pop breakout act — the one your UK friends keep telling you about. First NYC headline at Brooklyn Steel.',
    url: 'https://www.bkstl.com',
    price_min: 40,
    tags: ['pop', 'breakout'],
  },
  {
    title: 'Clara La San',
    venue: 'Brooklyn Steel',
    address: '319 Frost St, Brooklyn, NY 11222',
    borough: 'Brooklyn',
    date: '2026-05-16',
    category: 'music',
    description: "Manchester R&B producer-singer with a cult catalog and a glacial release pace — the kind of artist you bookmark because she doesn't tour often.",
    url: 'https://www.bkstl.com',
    price_min: 35,
    tags: ['r&b', 'cult'],
  },
  {
    title: 'The Afghan Whigs with Mercury Rev',
    venue: 'Webster Hall',
    address: '125 E 11th St, New York, NY 10003',
    borough: 'Manhattan',
    date: '2026-04-30',
    category: 'music',
    description: "Greg Dulli's Whigs + Mercury Rev double bill at Webster Hall. Elder-millennial indie canon on one stage.",
    url: 'https://www.websterhall.com',
    price_min: 45,
    tags: ['indie', 'legacy'],
  },
  {
    title: 'An Evening With Maya Hawke — The Maitreya Corso Tour',
    venue: 'Bowery Ballroom',
    address: '6 Delancey St, New York, NY 10002',
    borough: 'Manhattan',
    date: '2026-05-01',
    category: 'music',
    description: 'Maya Hawke on her third record, intimate Bowery show. Stranger Things kid doing folk with actual chops.',
    url: 'https://www.boweryballroom.com',
    price_min: 45,
    tags: ['indie', 'intimate'],
  },
  {
    title: 'Dirty Projectors',
    venue: 'Public Records',
    address: '233 Butler St, Brooklyn, NY 11217',
    borough: 'Brooklyn',
    date: '2026-04-30',
    category: 'music',
    description: 'Longstreth + co at Public Records — art-pop band in the city\'s best-sounding room. Tight capacity, high-end audio.',
    url: 'https://publicrecords.nyc',
    price_min: 40,
    tags: ['indie', 'audiophile'],
  },
  {
    title: 'Octave One with Len Faki',
    venue: 'Knockdown Center',
    address: '52-19 Flushing Ave, Maspeth, NY 11378',
    borough: 'Queens',
    date: '2026-04-25',
    category: 'nightlife',
    description: 'Detroit techno legends + Berghain resident B2B. Knockdown is the right room for it — high ceilings, the good kind of loud.',
    url: 'https://www.knockdown.center/upcoming',
    price_min: 40,
    tags: ['techno', 'anchor'],
  },
  {
    title: 'Wire Festival 2026',
    venue: 'Knockdown Center',
    address: '52-19 Flushing Ave, Maspeth, NY 11378',
    borough: 'Queens',
    date: '2026-05-14',
    end_date: '2026-05-17',
    category: 'nightlife',
    description: 'Multi-day electronic festival. Overlaps Frieze Week + NYCxDesign — the full culture-week ecosystem lives here.',
    url: 'https://www.knockdown.center/upcoming',
    price_min: 80,
    tags: ['techno', 'festival'],
  },
  {
    title: 'Elsewhere Rooftop — Season Opens',
    venue: 'Elsewhere',
    address: '599 Johnson Ave, Brooklyn, NY 11237',
    borough: 'Brooklyn',
    date: '2026-05-07',
    category: 'nightlife',
    description: "Bushwick's best rooftop opens for the season. Sunset sets from the regulars, the one place you bring out-of-towners without apologizing.",
    url: 'https://www.elsewherebrooklyn.com',
    price_min: 15,
    tags: ['rooftop', 'season-opener'],
  },
  {
    title: 'Pallbearer',
    venue: 'Elsewhere',
    address: '599 Johnson Ave, Brooklyn, NY 11237',
    borough: 'Brooklyn',
    date: '2026-04-18',
    category: 'music',
    description: 'Arkansas doom metal, slow and heavy. Elsewhere main room — loud in the right way.',
    url: 'https://www.elsewherebrooklyn.com',
    price_min: 30,
    tags: ['metal', 'heavy'],
  },
  {
    title: 'WU LYF',
    venue: 'Elsewhere',
    address: '599 Johnson Ave, Brooklyn, NY 11237',
    borough: 'Brooklyn',
    date: '2026-04-24',
    category: 'music',
    description: "The Manchester post-punk band everyone thought was done. First US show in a decade. Bookmark-tier for anyone who overplayed 'Heavy Pop' in college.",
    url: 'https://www.elsewherebrooklyn.com',
    price_min: 45,
    tags: ['indie', 'reunion'],
  },
  {
    title: 'Inner Wave with Los Mesoneros',
    venue: 'Elsewhere',
    address: '599 Johnson Ave, Brooklyn, NY 11237',
    borough: 'Brooklyn',
    date: '2026-05-10',
    category: 'music',
    description: 'LA dream-pop act + Venezuelan rock openers. Bilingual room, mellow Saturday night energy.',
    url: 'https://www.elsewherebrooklyn.com',
    price_min: 30,
    tags: ['indie', 'latin'],
  },
  {
    title: 'Field Medic',
    venue: "Baby's All Right",
    address: '146 Broadway, Brooklyn, NY 11211',
    borough: 'Brooklyn',
    date: '2026-04-16',
    category: 'music',
    description: "Cassette-fuzz folk at Baby's. One voice, one guitar, an actual lyricist. The room is tiny, the beer is cheap, the set is early.",
    url: 'https://babysallright.com',
    price_min: 25,
    tags: ['folk', 'intimate'],
  },
  {
    title: 'Jaguar Sun',
    venue: "Baby's All Right",
    address: '146 Broadway, Brooklyn, NY 11211',
    borough: 'Brooklyn',
    date: '2026-04-30',
    category: 'music',
    description: "Toronto dream-pop at Baby's — the last show of their spring run. Ends early enough to grab food in South Williamsburg after.",
    url: 'https://babysallright.com',
    price_min: 25,
    tags: ['dream-pop', 'indie'],
  },
  {
    title: 'Smorgasburg Williamsburg — Season Saturdays',
    venue: 'Marsha P. Johnson State Park',
    address: '90 Kent Ave, Brooklyn, NY 11249',
    borough: 'Brooklyn',
    date: '2026-04-18',
    end_date: '2026-05-16',
    category: 'food',
    description: "Season in full swing every Saturday. 74 vendors, 22 new this year, leaning international. You'll eat a $15 sandwich outdoors and call it a day well spent.",
    url: 'https://www.smorgasburg.com',
    is_free: true,
    price_min: 0,
    tags: ['market', 'food', 'anchor'],
  },
  {
    title: 'Bar Ferdinando (opening month)',
    venue: 'Bar Ferdinando',
    address: 'Carroll Gardens, Brooklyn',
    borough: 'Brooklyn',
    date: '2026-04-16',
    end_date: '2026-05-16',
    category: 'food',
    description: 'Italian-American natural wine spot from the Popina team, just opened in Carroll Gardens. First month = walk-in luck, by June you\'re calling at 5:01pm for a Resy.',
    url: 'https://resy.com/cities/new-york-ny',
    price_min: 40,
    tags: ['new-opening', 'natural-wine'],
  },
  {
    title: 'The Fear of 13 (starring Adrien Brody + Tessa Thompson)',
    venue: 'James Earl Jones Theatre',
    address: '138 W 48th St, New York, NY 10036',
    borough: 'Manhattan',
    date: '2026-04-15',
    end_date: '2026-08-02',
    category: 'theater',
    description: "Broadway transfer of the Donmar thriller, Adrien Brody's stage debut. A 13-year wrongful-imprisonment story, done one-set, done tight.",
    url: 'https://www.broadway.com/shows/the-fear-of-13',
    price_min: 89,
    tags: ['broadway', 'play'],
  },
  {
    title: 'The Rocky Horror Show (starring Luke Evans)',
    venue: 'Studio 54',
    address: '254 W 54th St, New York, NY 10019',
    borough: 'Manhattan',
    date: '2026-04-23',
    end_date: '2026-08-30',
    category: 'theater',
    description: "50-year revival at Studio 54, Luke Evans as Frank-N-Furter. You know the songs. You will yell the callbacks. You'll wear fishnets in the cab home.",
    url: 'https://rockyhorrorbroadway.com',
    price_min: 79,
    tags: ['broadway', 'revival'],
  },
  {
    title: 'Schmigadoon! The Musical',
    venue: 'Nederlander Theatre',
    address: '208 W 41st St, New York, NY 10036',
    borough: 'Manhattan',
    date: '2026-04-20',
    end_date: '2026-08-30',
    category: 'theater',
    description: 'The Apple TV+ cult hit becomes a Broadway musical. Campy, knowing, Kristen Chenoweth-adjacent humor for the "I listened to the original cast recording" crowd.',
    url: 'https://schmigadoonbroadway.com',
    price_min: 79,
    tags: ['broadway', 'musical'],
  },
  {
    title: 'Fallen Angels (starring Kelli O\'Hara + Rose Byrne)',
    venue: 'Todd Haimes Theatre',
    address: '227 W 42nd St, New York, NY 10036',
    borough: 'Manhattan',
    date: '2026-04-19',
    end_date: '2026-07-12',
    category: 'theater',
    description: "Noël Coward revival, Roundabout production. Kelli O'Hara + Rose Byrne as two wives anxiously waiting for a former lover. Sharp, short, actually funny.",
    url: 'https://www.roundabouttheatre.org',
    price_min: 79,
    tags: ['broadway', 'revival'],
  },
  {
    title: 'Hans Hofmann (opening)',
    venue: 'Miles McEnery Gallery',
    address: '520 W 21st St, New York, NY 10011',
    borough: 'Manhattan',
    date: '2026-04-16',
    end_date: '2026-05-09',
    category: 'culture',
    description: 'Chelsea opening — mid-century color-field works from the Hofmann estate. A gallery show you can walk through in 20 minutes and still feel smarter after.',
    url: 'https://milesmcenery.com',
    is_free: true,
    price_min: 0,
    tags: ['gallery', 'chelsea'],
  },
  {
    title: 'Luiza Gottschalk — SOL',
    venue: 'SLAG & RX',
    address: 'Chelsea, Manhattan',
    borough: 'Manhattan',
    date: '2026-04-16',
    end_date: '2026-05-16',
    category: 'culture',
    description: 'Brazilian-born painter\'s first NYC solo. Slow, sunlit figuration — the exact Chelsea stop between two other gallery openings on a Saturday afternoon.',
    url: 'https://www.slaggallery.com',
    is_free: true,
    price_min: 0,
    tags: ['gallery', 'chelsea'],
  },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function toAiEvent(e: AnchorEvent) {
  const yyyyMm = e.date.slice(0, 7);
  const sourceId = `ai-${slugify(e.title)}-${yyyyMm}`;
  const siftCategory = CATEGORY_MAP[e.category] ?? e.category;
  return {
    source_id: sourceId,
    title: e.title,
    category: siftCategory,
    description: e.description,
    start_date: e.date,
    end_date: e.end_date ?? undefined,
    venue_name: e.venue,
    address: e.address ?? null,
    borough: e.borough,
    price_min: typeof e.price_min === 'number' ? e.price_min : 0,
    price_max: typeof e.price_max === 'number' ? e.price_max : undefined,
    is_free: e.is_free === true,
    event_url: e.url,
    image_url: null,
    ticket_url: e.ticket_url ?? undefined,
    tags: e.tags ?? [],
    source_url: e.url,
  };
}

// Mirrors sanitizeEvent() + post-sanitize filters from upsert-ai-events.ts
function validate(raw: any, today: string): { ok: true } | { ok: false; reason: string } {
  if (!raw.source_id || !raw.title || !raw.start_date || !raw.category) {
    return { ok: false, reason: 'missing required field (source_id/title/start_date/category)' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.start_date)) {
    return { ok: false, reason: 'invalid start_date format' };
  }
  if (!VALID_CATEGORIES.has(raw.category)) {
    return { ok: false, reason: `invalid category "${raw.category}"` };
  }
  const effectiveEnd = raw.end_date ?? raw.start_date;
  if (effectiveEnd < today) {
    return { ok: false, reason: `already ended (${effectiveEnd} < ${today})` };
  }
  if (raw.borough && !VALID_BOROUGHS.has(raw.borough)) {
    return { ok: false, reason: `invalid borough "${raw.borough}" (will be nulled)` };
  }
  return { ok: true };
}

function main() {
  const dryRun = process.argv.includes('--dry');
  const today = new Date().toISOString().split('T')[0];

  const rows = EVENTS.map(toAiEvent);

  // ── Validation report ────────────────────────────────────────────────
  let passed = 0;
  const drops: { title: string; reason: string }[] = [];
  const seen = new Set<string>();
  const dupes: string[] = [];

  for (const r of rows) {
    if (seen.has(r.source_id)) dupes.push(r.source_id);
    seen.add(r.source_id);
    const result = validate(r, today);
    if (result.ok) passed++;
    else drops.push({ title: r.title, reason: result.reason });
  }

  const catCounts: Record<string, number> = {};
  const boroCounts: Record<string, number> = {};
  for (const r of rows) {
    catCounts[r.category] = (catCounts[r.category] ?? 0) + 1;
    boroCounts[r.borough ?? 'null'] = (boroCounts[r.borough ?? 'null'] ?? 0) + 1;
  }

  console.log('\n── Anchor Event Seed Validation ──');
  console.log(`Today:       ${today}`);
  console.log(`Total events: ${rows.length}`);
  console.log(`Pass sanitize: ${passed}`);
  console.log(`Drops:        ${drops.length}`);
  if (drops.length) {
    console.log('\nDropped events:');
    for (const d of drops) console.log(`  - "${d.title}" → ${d.reason}`);
  }
  if (dupes.length) {
    console.log(`\nDuplicate source_ids: ${dupes.join(', ')}`);
  }

  console.log('\nCategory distribution:');
  for (const [k, v] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }
  console.log('\nBorough distribution:');
  for (const [k, v] of Object.entries(boroCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(k).padEnd(16)} ${v}`);
  }

  if (dryRun) {
    console.log('\n[dry-run] No file written.');
    return;
  }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`\n✓ Wrote ${rows.length} events → ${OUTPUT_PATH}`);
  console.log('\nNext (requires approval):');
  console.log('  npx tsx --env-file=.env lib/ai-collect-data/upsert-ai-events.ts --keep-local');
}

main();
