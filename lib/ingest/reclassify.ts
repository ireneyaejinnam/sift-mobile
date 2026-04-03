import { createClient } from '@supabase/supabase-js';

/**
 * Keyword-heuristic reclassifier for events.
 *
 * Runs as a post-processing step after ingest + geocode, before dedup.
 * Scans title, description, venue_name, and tags for category signals.
 * Only reclassifies events currently tagged as low-confidence categories
 * (popups, or Ticketmaster "Miscellaneous" catch-all).
 *
 * Future enhancement: replace with or augment via Claude API for higher accuracy.
 */

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Categories that are likely catch-all / low-confidence assignments.
// The reclassifier re-evaluates events in these categories.
const LOW_CONFIDENCE_CATEGORIES = ['popups'];

// Additionally, re-check ALL events from sources known to have poor categorization.
// Ticketmaster "Miscellaneous" maps to popups, but other sources may also miscategorize.
const RECHECK_ALL_SOURCES = ['ticketmaster', 'dice', 'meetup', 'yelp', 'nycgov', 'theskint', 'eventbrite', 'nyctourism'];

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
      'musical', 'opera', 'ballet', 'dance performance',
      'one-man show', 'one-woman show', 'monologue', 'curtain call',
      'production', 'tony winning', 'tony award', 'tony-winning', 'new play',
      'little mermaid', 'lion king', 'wicked', 'hamilton',
      'phantom of the opera', 'les miserables', 'les mis',
      'book of mormon', 'dear evan hansen', 'moulin rouge',
      'aladdin', 'chicago the musical', 'hadestown', 'six the musical',
      'beetlejuice', 'back to the future', 'sweeney todd',
      'merrily we roll along', 'the outsiders', 'suffs',
      'the notebook', 'water for elephants', 'the great gatsby',
      'staged reading', 'preview performance',
      'revival', 'repertory', 'playwright', 'dramaturgy',
      'encores', 'three shows', 'two shows', 'stage show',
      'performing arts', 'theatrical', 'playhouse',
      'act one', 'act two', 'intermission', 'opening night',
    ],
    antiKeywords: ['pop-up shop', 'sample sale', 'merch', 'jazz', 'dj', 'bingo', 'disco', 'matinee disco'],
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
    ],
    venuePatterns: [
      'comedy cellar', 'gotham comedy', 'eastville', 'comic strip',
      'stand up ny', 'caveat', 'creek and the cave',
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
    ],
    antiKeywords: ['merch', 'merchandise', 'pop-up shop'],
    venuePatterns: [
      'brooklyn steel', 'terminal 5', 'bowery ballroom', 'music hall',
      'irving plaza', 'webster hall', 'mercury lounge', 'rough trade',
      'baby\'s all right', 'elsewhere', 'le poisson rouge',
      'blue note', 'village vanguard', 'jazz standard',
      'beacon theatre', 'radio city', 'kings theatre',
      'birdland', 'smalls', 'dizzy\'s', 'smoke jazz', 'cellar dog', 'mezzrow',
      'madison square garden', 'msg', 'barclays center',
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
    ],
    venuePatterns: [
      'general assembly', 'wework', 'the wing', 'neuehouse',
    ],
  },
  // ── Art (after comedy/music/workshops to avoid false positives) ──
  {
    target: 'art',
    keywords: [
      'gallery', 'exhibition', 'painting', 'sculpture',
      'sculptures', 'sculptural', 'biennial', 'art show',
      'art fair', 'art walk', 'curator', 'curated',
      'installation art', 'contemporary art', 'fine art', 'modern art',
      'photography exhibit', 'mural',
      'retrospective', 'archive',
      'masterpiece', 'masterpieces', 'masterwork',
      'group show', 'solo show', 'solo exhibition', 'group exhibition',
      'on view', 'on display',
      'permanent collection', 'from its collection',
      'lithograph', 'woodcut', 'etching',
      'mixed media', 'watercolor', 'oil on canvas', 'acrylic',
      'ceramics', 'textile art', 'fiber art', 'video art',
      'new works', 'recent works', 'selected works',
      'art opening', 'opening reception', 'artist talk',
      'immersive art', 'interactive art', 'digital art',
      'visual artist',
    ],
    antiKeywords: [
      'pop-up shop', 'sample sale', 'merch drop',
      'jazz', 'band', 'concert', 'dj', 'musician', 'bingo',
      'comedy', 'stand-up', 'standup', 'comedian',
      'workshop', 'diy', 'class', 'hands-on',
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
      'moma ps1', 'ps1', 'bric', 'smack mellon',
      'invisible dog', 'brooklyn art haus',
    ],
  },
  // ── Outdoors ──
  {
    target: 'outdoors',
    keywords: [
      'sports', 'basketball', 'football', 'soccer', 'golf',
      'tournament', 'match day', 'game day', 'hike', 'hiking',
      'kayak', 'bike ride', 'cycling tour', 'outdoor adventure',
      'nature walk', 'bird watching', 'foraging', 'fishing',
      'rock climbing', 'sailing', 'rowing',
    ],
    venuePatterns: [
      'prospect park', 'central park', 'stadium',
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
    ],
    venuePatterns: [
      'output', 'house of yes', 'good room', 'mirage',
      'basement', 'marquee', '1oak', 'lavo',
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

  // If currently popups, check if it's a confirmed popup — if so, don't reclassify
  if (!currentCategory || currentCategory === 'popups') {
    for (const kw of POPUP_CONFIRM_KEYWORDS) {
      if (allText.includes(kw)) {
        return null; // confirmed popup, leave it
      }
    }
  }

  // Try each rule in priority order
  for (const rule of RULES) {
    // Check anti-keywords first
    if (rule.antiKeywords?.some((ak) => allText.includes(ak))) {
      continue;
    }

    // Title match = high confidence
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

    // Venue match = medium confidence
    if (rule.venuePatterns) {
      for (const vp of rule.venuePatterns) {
        if (venueLower.includes(vp)) {
          return {
            newCategory: rule.target,
            confidence: 'medium',
            matchedKeyword: vp,
            matchSource: 'venue',
          };
        }
      }
    }

    // Description match = medium confidence
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

    // Tags match = low confidence (skip — not confident enough)
  }

  return null;
}

/**
 * Reclassify events in Supabase that are in low-confidence categories
 * OR from sources known to have poor categorization.
 * Runs as part of the ingest pipeline.
 */
export async function reclassifyEvents(): Promise<void> {
  console.log('[Reclassify] Starting reclassification pass...');

  // Fetch events from low-confidence categories
  const { data: lowConfEvents, error: err1 } = await supabase
    .from('events')
    .select('id, title, description, venue_name, tags, category, source')
    .in('category', LOW_CONFIDENCE_CATEGORIES)
    .limit(2000);

  // Also fetch events from sources with poor categorization (all categories)
  const { data: sourceEvents, error: err2 } = await supabase
    .from('events')
    .select('id, title, description, venue_name, tags, category, source')
    .in('source', RECHECK_ALL_SOURCES)
    .limit(3000);

  if ((err1 && err2) || (!lowConfEvents && !sourceEvents)) {
    console.error('[Reclassify] Failed to fetch events:', err1 || err2);
    return;
  }

  // Merge and deduplicate by ID
  const allMap = new Map<string, any>();
  for (const e of [...(lowConfEvents ?? []), ...(sourceEvents ?? [])]) {
    allMap.set(e.id, e);
  }
  const events = Array.from(allMap.values());

  console.log(`[Reclassify] Found ${events.length} events to evaluate`);

  // Collect updates grouped by new category, then batch update by ID list
  const updates = new Map<string, { id: string; title: string; oldCat: string }[]>();
  let skipped = 0;

  for (const event of events) {
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
