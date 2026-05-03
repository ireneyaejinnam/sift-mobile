import { createClient } from '@supabase/supabase-js';

/**
 * Keyword-heuristic reclassifier for events.
 *
 * Runs as a post-processing step after ingest + geocode, before dedup.
 * Scans title, description, venue_name, and tags for category signals.
 * Re-evaluates ALL events from ALL sources — any source can miscategorize.
 * Rule priority order determines the winner when multiple rules could match.
 *
 * Future enhancement: replace with or augment via Claude API for higher accuracy.
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Reclassification rules ──────────────────────────────────
// Priority order: first matching rule wins.
// Each rule has keywords that trigger reclassification and a target category.

interface Rule {
  target: string;
  /** Keywords that, if found in title or description, trigger reclassification */
  keywords: string[];
  /** Keywords that, if found, PREVENT reclassification (e.g., "pop-up shop" stays popups) */
  antiKeywords?: string[];
  /** Venue name patterns that suggest this category */
  venuePatterns?: string[];
}

const RULES: Rule[] = [
  // ── Theater (highest priority — catch Broadway/musical/production first) ──
  {
    target: 'theater',
    keywords: [
      'theater', 'theatre', 'broadway', 'off-broadway',
      'musical', 'opera', 'pop opera', 'ballet', 'dance performance',
      'one-man show', 'one-woman show', 'monologue', 'curtain call',
      'production', 'tony winning', 'tony award', 'tony-winning',
      'new play', 'classic play', 'a play by', 'a play about', 'the play',
      'stage play', 'one-act', 'two-act',
      'little mermaid', 'lion king', 'wicked', 'hamilton',
      'phantom of the opera', 'les miserables', 'les mis',
      'book of mormon', 'dear evan hansen', 'moulin rouge',
      'aladdin', 'chicago the musical', 'hadestown', 'six the musical',
      'beetlejuice', 'back to the future', 'sweeney todd',
      'merrily we roll along', 'the outsiders', 'suffs',
      'the notebook', 'water for elephants', 'the great gatsby',
      'death of a salesman', 'a raisin in the sun',
      'staged reading', 'preview performance',
      'revival', 'repertory', 'playwright', 'dramaturgy', 'dramatic',
      'encores', 'three shows', 'two shows', 'stage show',
      'performing arts', 'theatrical', 'playhouse',
      'act one', 'act two', 'intermission', 'opening night',
      'cabaret', 'burlesque', 'drag show', 'drag brunch',
      'drag queen', 'drag king', 'dragmatic',
      'immersive show', 'immersive experience', 'immersive theater',
      'spectacle', 'goes beyond',
    ],
    antiKeywords: ['pop-up shop', 'sample sale', 'merch', 'bingo', 'disco', 'matinee disco'],
    venuePatterns: [
      'st. james', 'public theater', 'bam',
      'lincoln center', 'barrow street', 'signature theatre',
      'new york city center', 'city center', 'roundabout',
      'manhattan theatre club', 'second stage', 'playwrights horizons',
      'atlantic theater', 'vineyard theatre', 'irish rep',
      'new world stages', 'minetta lane', 'lucille lortel',
      'cherry lane', 'the joyce', 'the shed',
      'lunt-fontanne', 'gershwin', 'majestic', 'shubert',
      'winter garden', 'ambassador', 'al hirschfeld', 'neil simon',
      'palace theatre', 'broadhurst', 'booth', 'belasco',
      'lyceum', 'ethel barrymore', 'minskoff', 'marquis',
      'richard rodgers', 'imperial', 'eugene o\'neill',
    ],
  },
  // ── Comedy (before art so "stand-up comedy" doesn't get caught by art) ──
  {
    target: 'comedy',
    keywords: [
      'comedy', 'comedian', 'improv', 'stand-up', 'standup',
      'roast', 'open mic comedy', 'sketch comedy', 'comedy show',
      'comedy night', 'laugh', 'comic', 'comedy special',
      'comedic', 'funny', 'humor', 'satire',
      'open mic', 'open-mic', 'variety show', 'variety act',
    ],
    antiKeywords: ['pop-up shop', 'sample sale'],
    venuePatterns: [
      'comedy cellar', 'gotham comedy', 'eastville', 'comic strip',
      'stand up ny', 'caveat', 'creek and the cave',
      'the bell house', 'union hall', 'littlefield',
    ],
  },
  // ── Live Music (before art so "jazz artist" doesn't get caught by art) ──
  {
    target: 'live_music',
    keywords: [
      'concert', 'live music', 'live band', 'dj set', 'dj night',
      'album release', 'tour stop', 'music festival', 'headliner',
      'opening act', 'setlist', 'songwriter', 'rapper',
      'hip hop show', 'jazz night', 'rock show', 'edm',
      'live performance', 'acoustic set', 'jam session',
      'jazz club', 'big band', 'jazz ensemble', 'jazz quartet', 'jazz trio',
      'jazz', 'band', 'musician', 'vocalist', 'singer',
      'orchestra', 'symphony', 'philharmonic', 'ensemble',
      'vinyl', 'record release', 'listening party',
      // Latin / dance music genres (title match captures "Salsa Thursdays" etc.)
      'salsa', 'bachata', 'merengue', 'cumbia', 'reggaeton',
      'latin night', 'salsa night', 'dance night', 'latin dance',
    ],
    antiKeywords: ['merch', 'merchandise', 'pop-up shop', 'walking tour', 'guided tour', 'history tour'],
    venuePatterns: [
      'brooklyn steel', 'terminal 5', 'bowery ballroom', 'music hall',
      'irving plaza', 'webster hall', 'mercury lounge', 'rough trade',
      'baby\'s all right', 'elsewhere', 'le poisson rouge',
      'blue note', 'village vanguard', 'jazz standard',
      'beacon theatre', 'radio city', 'kings theatre',
      'birdland', 'smalls', 'dizzy\'s', 'smoke jazz', 'cellar dog', 'mezzrow',
      'madison square garden', 'msg', 'barclays center',
      'carnegie hall', 'town hall', 'joe\'s pub', 'rockwood music hall',
      'nublu', 'sultan room', 'brooklyn bowl', 'warsaw',
    ],
  },
  // ── Workshops (before art so "DIY Workshop" doesn't get caught by art) ──
  {
    target: 'workshops',
    keywords: [
      'workshop', 'masterclass', 'seminar', 'lecture', 'panel',
      'networking', 'conference', 'learn to', 'how to', 'tutorial',
      'certification', 'bootcamp', 'crash course', 'info session',
      'diy', 'hands-on', 'make your own',
      'skill share', 'skillshare', 'meetup group', 'talk and demo',
    ],
    venuePatterns: [
      'general assembly', 'wework', 'the wing', 'neuehouse',
    ],
  },
  // ── Art (after comedy/music/workshops to avoid false positives) ──
  {
    target: 'art',
    keywords: [
      'gallery', 'galleries', 'exhibition', 'exhibit',
      'painting', 'paintings', 'painter', 'painters',
      'sculpture', 'sculptures', 'sculptural', 'sculptor',
      'biennial', 'art show', 'artwork', 'artworks',
      'art fair', 'art walk', 'curator', 'curated',
      'installation art', 'contemporary art', 'fine art', 'modern art',
      'photography exhibit', 'photographic', 'mural',
      'retrospective', 'archive',
      'masterpiece', 'masterpieces', 'masterwork',
      'group show', 'solo show', 'solo exhibition', 'group exhibition',
      'on view', 'on display',
      'permanent collection', 'from its collection',
      'collection of', 'collections',
      'lithograph', 'woodcut', 'etching',
      'mixed media', 'watercolor', 'oil on canvas', 'acrylic',
      'ceramics', 'textile art', 'fiber art', 'video art',
      'new works', 'recent works', 'selected works',
      'art opening', 'opening reception', 'artist talk',
      'immersive art', 'interactive art', 'digital art',
      'visual artist', 'portraiture', 'photography',
      'artist', 'artists',
      'illustrated', 'illustration', 'illustrations',
      'century of', 'decades of',
      'posters', 'prints', 'drawings',
      // Venue/institution names as keywords (catch them in descriptions too)
      'moma', 'the met ', 'metropolitan museum', 'whitney museum',
      'guggenheim', 'brooklyn museum', 'new museum', 'cooper hewitt',
      'center for brooklyn history', 'studio museum', 'el museo',
      'jewish museum', 'morgan library', 'the frick',
      'museum of arts and design', 'museum of the city',
      'noguchi museum', 'sculpture center',
    ],
    antiKeywords: [
      'pop-up shop', 'sample sale', 'merch drop',
      'jazz', 'band', 'concert', 'dj', 'musician', 'bingo',
      'comedy', 'stand-up', 'standup', 'comedian', 'open mic', 'open-mic',
      'workshop', 'diy', 'hands-on',
      'drag show', 'drag queen', 'drag king', 'cabaret', 'burlesque',
      'nightclub', 'night club', '21 and over', 'ages 21',
      'walking tour', 'guided tour', 'history tour', 'sightseeing',
      'planting', 'wildflower', 'native plant',
      'pub crawl', 'murder mystery', 'scavenger hunt',
      'yoga', 'pilates', 'fitness', 'workout', 'hiit', 'run club',
      'bar crawl', 'rave', 'dance party',
    ],
    venuePatterns: [
      'museum', 'gallery', 'galleries',
      'moma', 'the met', 'metropolitan museum', 'met breuer', 'met cloisters',
      'whitney', 'guggenheim', 'new museum', 'brooklyn museum',
      'studio museum', 'el museo', 'jewish museum',
      'museum of arts and design', 'mad museum',
      'rubin museum', 'asia society', 'japan society',
      'museum of the city', 'intrepid',
      'morgan library', 'frick', 'frick madison',
      'international center of photography', 'icp',
      'museum of the moving image', 'noguchi museum',
      'dia beacon', 'dia chelsea', 'dia:',
      'gagosian', 'pace gallery', 'david zwirner', 'hauser & wirth',
      'lehmann maupin', 'sean kelly', 'gladstone',
      'james cohan', 'lisson', 'white cube', 'petzel',
      'perrotin', 'kasmin', 'jack shainman',
      'pioneer works', 'the kitchen', 'artists space',
      'sculpture center', 'swiss institute', 'drawing center',
      'new york historical', 'cooper hewitt',
      'center of brooklyn history', 'brooklyn historical',
      'staten island museum', 'queens museum',
      'bronx museum', 'museum of chinese', 'tenement museum',
      'national museum', 'american museum',
      'moma ps1', 'ps1', 'bric', 'smack mellon',
      'invisible dog',
    ],
  },
  // ── Sports (before outdoors so "Yankees" doesn't get caught by outdoors) ──
  {
    target: 'sports',
    keywords: [
      'sports', 'basketball', 'football', 'soccer', 'golf', 'baseball',
      'yankees', 'mets', 'knicks', 'nets', 'rangers', 'islanders',
      'nycfc', 'liberty', 'red bulls',
      'tournament', 'match day', 'game day', 'playoffs', 'championship',
      'home game', 'away game', 'doubleheader', 'opening day',
      'hockey', 'tennis', 'boxing match', 'ufc', 'mma',
      'world series', 'super bowl', 'nba', 'nfl', 'mlb', 'nhl', 'mls',
    ],
    antiKeywords: ['esports', 'e-sports', 'gaming', 'video game'],
    venuePatterns: [
      'madison square garden', 'msg', 'barclays center',
      'yankee stadium', 'citi field', 'metlife stadium',
      'usta billie jean king', 'arthur ashe', 'red bull arena',
      'audi field', 'prudential center',
    ],
  },
  // ── Outdoors ──
  {
    target: 'outdoors',
    keywords: [
      'hike', 'hiking', 'parade',
      'kayak', 'bike ride', 'cycling tour', 'outdoor adventure',
      'nature walk', 'bird watching', 'foraging', 'fishing',
      'rock climbing', 'sailing', 'rowing',
      'walking tour', 'guided tour', 'history tour', 'historical tour',
      'sightseeing tour', 'sightseeing', 'neighborhood tour', 'city tour',
      'tv tour', 'movie tour', 'film tour', 'food tour', 'architecture tour',
      'boat tour', 'harbor cruise', 'ferry ride', 'tour of',
      'postcard tour', 'brooklyn tour', 'manhattan tour', 'nyc tour',
      'staten island tour', 'bronx tour', 'queens tour',
      'best of brooklyn', 'best of manhattan', 'best of nyc',
      'greetings from',
      'planting', 'wildflower', 'native plant', 'botanical',
      'community garden', 'earth day', 'earth month',
      'park event', 'outdoor market', 'picnic',
      'scavenger hunt', 'outdoor yoga',
    ],
    antiKeywords: ['tour stop', 'album release', 'headliner', 'setlist', 'concert tour'],
    venuePatterns: [
      'prospect park', 'central park',
      'brooklyn bridge park', 'battery park', 'hudson river park',
      'governors island', 'randalls island', 'high line',
      'botanical garden', 'bronx zoo', 'queens botanical',
      'brooklyn botanic', 'wave hill', 'snug harbor',
      'fort tryon park', 'flushing meadows', 'riverside park',
      'historical society',
    ],
  },
  // ── Fitness ──
  {
    target: 'fitness',
    keywords: [
      'yoga', 'run club', 'running', 'hiit', 'fitness class',
      'marathon', 'cycling class', 'pilates', 'barre', 'crossfit',
      'boot camp', 'workout', 'spin class', 'strength training',
      '5k', '10k', 'half marathon',
      'zumba', 'kickboxing', 'boxing class', 'dance fitness',
      'stretch', 'meditation class', 'tai chi',
    ],
    venuePatterns: [
      'equinox', 'soulcycle', 'barry\'s', 'peloton', 'orangetheory',
    ],
  },
  // ── Food ──
  {
    target: 'food',
    keywords: [
      'tasting', 'food festival', 'brunch', 'dinner party',
      'chef', 'culinary', 'cocktail class', 'wine tasting',
      'beer tasting', 'supper club', 'cooking class',
      'food truck', 'restaurant week',
      'bakery', 'pastry', 'patisserie', 'chocolate',
      'cheese tasting', 'spirit tasting', 'mixology',
      'prix fixe', 'omakase', 'pop-up dinner', 'food crawl',
      'wine dinner', 'beer dinner', 'tasting menu',
    ],
    antiKeywords: [
      'concert', 'live band', 'live music', 'opening act',
      'headline', 'tour date', 'performing live', 'live show',
      'band performs', 'on tour', 'tickets on sale',
    ],
    venuePatterns: [
      'smorgasburg', 'eataly', 'time out market', 'chelsea market',
    ],
  },
  // ── Nightlife ──
  {
    target: 'nightlife',
    keywords: [
      'bar crawl', 'club night', 'after dark',
      'late night party', 'bottle service', 'vip night',
      'dance party', 'rave', 'techno night', 'house music night',
      'nightclub', 'night club', '21 and over', '21+', 'ages 21',
      'after hours', 'dance floor', 'clubbing',
      'bottle pop', 'guestlist', 'guest list',
      'lounge night', 'rooftop party',
    ],
    venuePatterns: [
      'output', 'house of yes', 'good room', 'mirage',
      'basement', 'marquee', '1oak', 'lavo',
      'le bain', 'ph-d', 'tao', 'avenue', 'up&down',
      'nebula', 'brooklyn mirage', 'nowadays',
    ],
  },
];

// Keywords that confirm something IS a genuine popup
const POPUP_CONFIRM_KEYWORDS = [
  'sample sale', 'pop-up shop', 'popup shop', 'brand activation',
  'trunk show', 'flea market', 'holiday market', 'pop-up market',
  'bazaar', 'flash sale', 'limited edition drop',
  'merch drop', 'merchandise pop-up', 'build-a-box', 'beauty pop-up',
  'skincare pop-up', 'fashion pop-up', 'product launch',
];

type Confidence = 'high' | 'medium' | 'low';

interface ReclassifyResult {
  newCategory: string;
  confidence: Confidence;
  matchedKeyword: string;
  matchSource: 'title' | 'description' | 'venue' | 'tags';
}

function tryReclassify(
  title: string,
  description: string,
  venueName: string,
  tags: string[],
  currentCategory?: string
): ReclassifyResult | null {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const venueLower = venueName.toLowerCase();
  const tagsLower = tags.map((t) => t.toLowerCase()).join(' ');
  const allText = `${titleLower} ${descLower} ${venueLower} ${tagsLower}`;

  // Check if it's a confirmed popup — reclassify TO popups if not already, or leave if already popups
  for (const kw of POPUP_CONFIRM_KEYWORDS) {
    if (allText.includes(kw)) {
      if (currentCategory === 'popups') return null; // already correct
      return {
        newCategory: 'popups',
        confidence: 'high' as Confidence,
        matchedKeyword: kw,
        matchSource: 'title' as const,
      };
    }
  }

  // Try each rule in priority order.
  // IMPORTANT: Anti-keywords only block description-level matches.
  // Title keywords and venue patterns are high-confidence signals that
  // should NOT be overridden by anti-keywords — a MoMA exhibition
  // mentioning "jazz" in its description is still art.
  for (const rule of RULES) {
    const hasAntiKeyword = rule.antiKeywords?.some((ak) => allText.includes(ak)) ?? false;

    // Title match = high confidence (anti-keywords do NOT block)
    for (const kw of rule.keywords) {
      if (titleLower.includes(kw)) {
        return {
          newCategory: rule.target,
          confidence: 'high',
          matchedKeyword: kw,
          matchSource: 'title',
        };
      }
    }

    // Venue match = high confidence (anti-keywords do NOT block)
    if (rule.venuePatterns) {
      for (const vp of rule.venuePatterns) {
        if (venueLower.includes(vp)) {
          return {
            newCategory: rule.target,
            confidence: 'high',
            matchedKeyword: vp,
            matchSource: 'venue',
          };
        }
      }
    }

    // Description match = medium confidence (anti-keywords DO block)
    if (!hasAntiKeyword) {
      for (const kw of rule.keywords) {
        if (descLower.includes(kw)) {
          return {
            newCategory: rule.target,
            confidence: 'medium',
            matchedKeyword: kw,
            matchSource: 'description',
          };
        }
      }
    }

    // Tags match = low confidence (skip — not confident enough)
  }

  return null;
}

/**
 * Reclassify ALL events in Supabase using keyword heuristics.
 * Runs as part of the ingest pipeline post-processing step.
 */
export async function reclassifyEvents(): Promise<void> {
  console.log('[Reclassify] Starting reclassification pass...');

  // Fetch ALL events — any source can miscategorize, so we recheck everything.
  // Paginate to handle large datasets (Supabase default limit is 1000).
  const allEvents: any[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, venue_name, tags, category, source')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('[Reclassify] Failed to fetch events:', error.message);
      return;
    }
    if (!data || data.length === 0) break;
    allEvents.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const events = allEvents;

  console.log(`[Reclassify] Found ${events.length} events to evaluate`);

  // Collect updates grouped by new category, then batch update by ID list
  const updates = new Map<string, { id: string; title: string; oldCat: string }[]>();
  let skipped = 0;

  // Sources whose category data is reliable enough to skip reclassification
  const TRUST_SOURCE_CATEGORIES = ['ticketmaster', 'resident_advisor', 'dice'];

  for (const event of events) {
    if (TRUST_SOURCE_CATEGORIES.includes(event.source)) {
      skipped++;
      continue;
    }

    const result = tryReclassify(
      event.title || '',
      event.description || '',
      event.venue_name || '',
      event.tags || [],
      event.category
    );

    if (
      result &&
      (result.confidence === 'high' || result.confidence === 'medium') &&
      result.newCategory !== event.category
    ) {
      if (!updates.has(result.newCategory)) updates.set(result.newCategory, []);
      updates.get(result.newCategory)!.push({ id: event.id, title: event.title, oldCat: event.category });
    } else {
      skipped++;
    }
  }

  // Batch update: one query per category
  let reclassified = 0;
  for (const [newCategory, items] of updates) {
    const ids = items.map((i) => i.id);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const { error: updateError } = await supabase
        .from('events')
        .update({ category: newCategory })
        .in('id', batch);

      if (updateError) {
        console.error(`[Reclassify] Batch update to ${newCategory} failed:`, updateError.message);
      } else {
        reclassified += batch.length;
      }
    }
    // Log a few examples per category
    const examples = items.slice(0, 3).map((i) => `"${i.title}" (${i.oldCat})`).join(', ');
    console.log(`[Reclassify] → ${newCategory}: ${items.length} events (e.g. ${examples})`);
  }

  console.log(`[Reclassify] Done: ${reclassified} reclassified, ${skipped} kept as-is`);
}

/**
 * Reclassify a single event in-memory (for use with hardcoded/local data).
 * Returns the new category or the original if no reclassification needed.
 */
export function reclassifyLocal(
  title: string,
  description: string,
  venueName: string,
  tags: string[],
  currentCategory: string
): string {
  const result = tryReclassify(title, description, venueName, tags, currentCategory);
  if (result && (result.confidence === 'high' || result.confidence === 'medium')) {
    return result.newCategory;
  }
  return currentCategory;
}

if (require.main === module) {
  reclassifyEvents().catch(console.error);
}
