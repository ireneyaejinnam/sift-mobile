# Prompt: Gen Z Event Quality Overhaul

> Paste this entire file into a Claude Code session on the `sift-mobile` repo.

---

## Context

You are working on **Sift**, a NYC event discovery app for **Gen Z and young millennials (22–32)**. The target user is culturally curious, taste-driven, and allergic to anything that feels corporate or tourist-oriented. They discover events through TikTok, Instagram Stories, and word of mouth — not by searching "things to do in NYC." They live anywhere in the city but gravitate toward events that feel intentional, niche, and community-driven regardless of borough. The app's entire value proposition is **curation** — surfacing events that feel handpicked by a friend with great taste, not algorithmically scraped from every corner of the internet.

The ingest pipeline currently has:
- **8 active sources**: Eventbrite (35 seed orgs), Ticketmaster, Luma, Fever, Resident Advisor, Dice.fm, NYC Parks, Museums
- **8 disabled sources**: nyc_tourism, nyc_gov, yelp, meetup, CozyCretives, NYCForFree, TheSkint, NYCTourism
- **AI collection pipeline** (`lib/ai-collect-data/`) using GPT-5.4 + web search for enrichment
- **Claude vibe check** scoring events 1–10, suppressing ≤4
- **Composite ranking**: vibe (60%) + timeliness (25%) + completeness (15%) × category taste weight
- **82 title blocklist patterns**, 9 description spam signals
- **35-rule keyword reclassifier** with anti-keywords and confidence tiers

The problem: **the feed still doesn't feel curated enough**. Too many events feel generic, corporate, or wrong-demographic. The events that DO land well are underground music, niche art openings, neighborhood-specific food pop-ups, and culturally specific community events. We need more of those and fewer of everything else.

---

## The Gen Z Event Hook Formula

What makes a Gen Z user in NYC open an event card, save it, and actually show up:

### 1. FOMO + Scarcity
- "One night only", "Limited to 50 people", "Sold out last time"
- Warehouse parties with no address until day-of
- Events that feel like you need to "know someone" to know about them
- **Signal in data**: limited capacity, waitlist, one-time (no recurring), unusual venue

### 2. Venue & Scene Identity
- The venue IS the brand — Elsewhere, Le Poisson Rouge, Jazz Gallery, Minton's, SOB's
- Every neighborhood has its gems: Harlem jazz clubs, LES dive bars, Astoria beer gardens, Bronx art collectives
- Neighborhood precision matters for discovery — "Astoria" is more useful than "Queens"
- **Signal in data**: neighborhood field precision, venue reputation, not just borough

### 3. Cultural Specificity > Generic Category
- "Japanese noise music at Trans-Pecos" > "live music"
- "Nigerian suya pop-up" > "food event"
- "Queer cumbia night" > "nightlife"
- "Harlem jazz jam session" > "music in Manhattan"
- The more specific and culturally rooted, the better it performs
- **Signal in data**: description richness, niche tags, cultural keywords in title

### 4. Anti-Corporate Radar
- If it looks like a brand activation, a sponsored experience, or a corporate team-building event disguised as fun — kill it
- Chain venues (Dave & Buster's, Bowlero, TopGolf) are instant no
- Events with "presented by [brand]" in the title lose points
- **Signal in data**: venue type, sponsor mentions, corporate language patterns

### 5. Visual Quality
- Stock photos and corporate headshots = scroll past
- Moody venue shots, crowd energy, poster art = stop and look
- No image is better than a bad image (use the venue's own aesthetic)
- **Signal in data**: image_url source quality, Google Places vs. event-specific imagery

### 6. Social Proof
- "Your friend Sarah is going" (future feature)
- "200 people interested" (future feature)
- Events from venues/orgs with a track record of quality
- **Signal in data**: social_signal count, organizer reputation, recurring venue quality

### 7. Time-Sensitivity
- "Tonight" and "This weekend" drive urgency
- Something 3 weeks out needs to be extraordinary to get attention
- Last-chance events (closing exhibitions, final performances) create urgency
- **Signal in data**: timeliness score in ranking, ending_soon flag

### 8. Taste Matching Over Search
- Gen Z doesn't search "comedy shows near me" — they scroll, discover, get surprised
- The app should know you liked Japanese noise music and show you a butoh performance
- Adjacent categories matter: if you like nightlife, you probably like live_music
- **Signal in data**: category taste weights, cross-category recommendation

---

## What to Implement (Prioritized)

### Priority 1: Expand Eventbrite Seed Orgs (Immediate Impact)

The biggest bang-for-buck improvement. These are respected independent venues across NYC that consistently host events our demographic cares about. Many are already TODO'd in `lib/ingest/config.ts` (lines 102-124).

**Task**: Look up the Eventbrite organizer IDs for each venue below and add them to `EVENTBRITE_SEED_ORGS` in `config.ts`. 

To find an org ID:
1. Search eventbrite.com for the venue name + "NYC"
2. Find any event they're hosting
3. Copy the event ID from the URL
4. Run: `curl "https://www.eventbriteapi.com/v3/events/{EVENT_ID}/?expand=organizer" -H "Authorization: Bearer $EVENTBRITE_OAUTH_TOKEN" | jq '.organizer.id'`

**Venues to add** (replace the TODO comments):

| Venue | Category | Neighborhood | Why |
|---|---|---|---|
| Nowadays | nightlife | Ridgewood | Outdoor dance floor, DJ culture, exactly our demo |
| Knockdown Center | live_music | Ridgewood | Art + music crossover, warehouse vibes |
| Public Records | nightlife | Gowanus | Sound-system culture, vinyl-forward, restaurant+club |
| TV Eye | live_music | Ridgewood | Punk/indie/experimental, DIY ethos |
| Sunnyvale Brooklyn | nightlife | Bushwick | Late-night spot, DJ sets, neighborhood staple |
| Market Hotel | live_music | Bushwick | DIY venue, indie rock, punk, the real deal |
| Alphaville | nightlife | Bushwick | Bar + event space, neighborhood hub |
| C'mon Everybody | live_music | Crown Heights | Black-owned, live music + DJ, community anchor |
| National Sawdust | live_music | Williamsburg | New music, experimental, architecturally stunning |
| Roulette Intermedium | theater | Downtown Brooklyn | Experimental music + dance, artist-run |
| BRIC | art | Fort Greene | Gallery + performance, community arts |
| Nitehawk Cinema | art | Williamsburg / Park Slope | Indie film + food, cult screenings |
| Lot 45 | nightlife | Bushwick | Multi-room venue, DJ culture |
| Our Wicked Lady | live_music | Bushwick | Rooftop, live bands, DIY |
| Forrest Point | nightlife | Ridgewood | Cocktail bar + events, neighborhood gem |
| Artists & Fleas | popups | Williamsburg / Chelsea | Maker market, vintage, local designers |
| Hester Street Fair | popups | LES | Weekend market, food + vintage |
| Jalopy Theatre | live_music | Red Hook | Folk, bluegrass, old-time, deeply niche |
| Catland Books | workshops | Bushwick | Occult bookshop + events, extremely niche |
| Maison Premiere | food | Williamsburg | Oyster bar + absinthe, cocktail events |
| The Lot Radio | live_music | Williamsburg | Open-air radio station, DJ sets, free |
| Mood Ring | nightlife | Bushwick | Queer nightlife, DJ sets, community events |
| House of Yes | nightlife | Bushwick | Immersive, circus, queer, costume parties |
| Jupiter Disco | nightlife | Bushwick | Sound system culture, intimate dance floor |
| Wonderville | nightlife | Bushwick | Arcade + indie games + live music |
| Film Forum | art | West Village | Revival cinema, indie film institution |
| Metrograph | art | LES | Boutique cinema + restaurant + bookshop |
| IFC Center | art | West Village | Indie/foreign film, midnight screenings |
| Le Poisson Rouge | live_music | Greenwich Village | Music venue, eclectic booking, intimate |
| (Le) Poisson Rouge | live_music | Greenwich Village | Alias check — same venue |
| SOB's | live_music | Hudson Square | Latin, Afrobeats, hip-hop, legendary |
| Nuyorican Poets Cafe | art | LES | Spoken word, poetry slams, institution |
| The Jazz Gallery | live_music | Flatiron | Contemporary jazz, artist-focused |
| Minton's Playhouse | live_music | Harlem | Historic jazz club, live sets |
| Silvana | live_music | Harlem | Bar + music venue, eclectic |
| The Bronx Museum | art | South Bronx | Contemporary art, community-rooted |
| Andrew Freedman Home | art | South Bronx | Art + events in historic mansion |
| QED Astoria | comedy | Astoria | Comedy + variety, community-run |
| Museum of the Moving Image | art | Astoria | Film, media art, screenings |
| Bohemian Hall & Beer Garden | food | Astoria | Historic beer garden, outdoor events |
| Jamaica Center for Arts | art | Jamaica, Queens | Community arts, exhibitions |
| Pregones/PRTT | theater | South Bronx | Latinx theater, bilingual performances |

If a venue isn't on Eventbrite, skip it and note it in a comment.

### Priority 2: Sharpen the Vibe Check Prompt

The current vibe check in `api/cron/ingest-score.ts` (line 137) is good but can be more precise. Replace it with a prompt that:

1. **Scores on multiple dimensions** instead of a single 1-10:
   - `cultural_fit` (1-10): Would our target demo actually go?
   - `uniqueness` (1-10): How differentiated is this from every other event?
   - `fomo_factor` (1-10): Would you feel bad missing it?

2. **Returns a composite vibe_score** (weighted average) PLUS the individual dimensions stored as JSON in a new `vibe_dimensions` JSONB column (requires migration).

3. **Uses sharper anti-patterns**:
   - "Presented by [Fortune 500]" → -3 points
   - Chain venue (Dave & Buster's, Bowlero, TopGolf, Hard Rock) → auto-suppress
   - "All ages" + venue that's normally 21+ → suspicious, check context
   - Generic description ("Join us for a night of fun!") → penalty
   - Specific cultural reference in title → bonus (e.g., "Afrobeats", "Shoegaze", "Butoh")

4. **Tourist-trap aware**: Events at known tourist-trap locations (Times Square, Pier 83 cruises, etc.) that aren't at a respected venue get penalized. Great events can happen anywhere in NYC — don't bias toward or against any borough or neighborhood.

New prompt template:
```
You are a taste filter for Sift, a NYC event app for culturally curious 22–32 year olds. They're the kind of person who follows niche Instagram accounts, has opinions about natural wine, discovers events through group chats and TikTok, and would rather go to a weird one-off thing than a polished corporate experience. They live all over the city.

Score this event on three dimensions (1-10 each, be strict):

1. CULTURAL FIT: Would our target user actually go? 
   - 9-10: Underground, niche, buzzy. Fills up via word of mouth. A Harlem jazz jam, a Bronx art collective opening, a warehouse party, a secret supper club.
   - 7-8: Interesting venue, culturally specific, would see on a friend's story. An indie film screening, a curated vintage market, a DJ set at a real venue.
   - 5-6: Fine but generic. Average bar event, chain-venue comedy, standard brunch.
   - 1-4: Wrong demographic entirely. Tourist, corporate, MLM, webinar, networking mixer.

2. UNIQUENESS: How differentiated from every other event listing?
   - 9-10: Only happens here, only happens once, can't find this anywhere else.
   - 7-8: Specific genre/culture/community, not just "DJ night" or "comedy show".
   - 5-6: Standard format, standard venue, seen it before.
   - 1-4: Cookie-cutter. Could be in any city. Generic "night out" energy.

3. FOMO FACTOR: Would you feel bad missing it?
   - 9-10: If you missed this, you'd hear about it for weeks.
   - 7-8: Limited run, interesting lineup, respected venue.
   - 5-6: It'll happen again. Or something similar will.
   - 1-4: Literally nobody will talk about this.

Event:
Title: {title}
Venue: {venue_name}
Neighborhood: {neighborhood}
Category: {category}
Source: {source}
Description: {description (first 400 chars)}

Auto-suppress signals (score cultural_fit ≤ 3 if any match):
- Chain venues: Dave & Buster's, Bowlero, TopGolf, Hard Rock, Madame Tussauds
- "Presented by" a Fortune 500 brand as the main draw
- Networking, professional development, career fair
- Boat cruise, harbor tour, helicopter ride, hop-on-hop-off
- Tourist packaging: murder mystery pub crawl, scavenger hunt, "NYC experience"
- Webinar, virtual event, online workshop

Bonus signals (add 1-2 points to relevant dimension):
- Respected independent venue (any borough — a Bronx art space counts as much as a Brooklyn club)
- Specific cultural reference (Afrobeats, shoegaze, butoh, cumbia, salsa, spoken word, etc.)
- "One night only", "limited", "intimate", "secret location", "closing night"
- Artist/performer name suggests a real act (not "DJ TBD" or "Various Artists")
- Community-rooted: Black-owned, queer, immigrant community, mutual aid, artist-run

Return ONLY valid JSON:
{"cultural_fit": <1-10>, "uniqueness": <1-10>, "fomo": <1-10>, "score": <weighted average, round to 1 decimal>, "reason": "<10 words max>"}
```

Weighting: `score = cultural_fit * 0.50 + uniqueness * 0.25 + fomo * 0.25`

Suppress threshold: `score ≤ 4.0` (same as current)
Boost threshold: `score ≥ 8.0` (curator_boost)

### Priority 3: Add New Sources (Gen Z Platforms)

These sources are where our target demographic actually discovers events. Add them as new source generators in `lib/ai-collect-data/collect-names.ts`:

#### 3a. Shotgun (electronic music, warehouse parties)
- URL: `https://shotgun.live/cities/new-york`
- Why: THE platform for underground electronic music events, warehouse parties, rave culture
- Method: Scrape HTML or check for `__NEXT_DATA__` JSON (similar to Dice pattern)

#### 3b. Sofar Sounds (secret location concerts)
- URL: `https://www.sofarsounds.com/cities/new-york`
- Why: Intimate, secret-location concerts. Peak FOMO. Exactly our demo.
- Method: HTML scrape or API if available

#### 3c. Ohmyrockness (indie music blog)
- URL: `https://www.ohmyrockness.com/shows`
- Why: Curated indie/punk/experimental shows in NYC. Respected taste filter.
- Method: HTML scrape, likely has structured event data

#### 3d. Nonsense NYC (weekly newsletter, legendary in NYC underground scene)
- URL: `https://nonsensenyc.com/`
- Why: THE source for underground, weird, one-of-a-kind NYC events. If it's on Nonsense, it's exactly what we want.
- Method: Scrape latest newsletter post, extract event names + links

#### 3e. The Lot Radio (live DJ sets, free, Williamsburg institution)
- URL: `https://www.thelotradio.com/schedule`
- Why: Free DJ sets in Williamsburg, community institution, our exact demo
- Method: Scrape schedule page

#### 3f. Ampled / Withfriends (artist-direct event platforms)
- URLs: `https://www.withfriends.co/search?city=new+york`
- Why: Artist-run events, house shows, DIY spaces — the antithesis of corporate
- Method: HTML scrape

**Implementation pattern** (follow existing generators in `collect-names.ts`):
```typescript
async function* genShotgun(): AsyncGenerator<Candidate> {
  try {
    const res = await fetch('https://shotgun.live/cities/new-york', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return;
    const html = await res.text();
    // Try __NEXT_DATA__ first (like Dice pattern)
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const data = JSON.parse(m[1]);
      // Extract events from props...
    }
    // Fallback to JSON-LD
    for (const candidate of extractJsonLdEvents(html)) {
      yield candidate;
    }
  } catch (err) {
    console.error('[collect] Shotgun error:', (err as Error).message);
  }
}
```

Register each in the `sources` array in `collectAllNames()`.

### Priority 4: Tourist-Trap Penalty in Ranking

In `src/lib/getEvents.ts`, the `computeEventScore` function doesn't account for venue context. Add a light penalty for events in known tourist-trap zones that don't have a strong vibe score to back them up. This is NOT about penalizing neighborhoods — great events happen everywhere. It's about deprioritizing "Times Square Comedy Show" when it doesn't have the quality signals to justify surfacing.

```typescript
const TOURIST_TRAP_ZONES = new Set([
  'Times Square', 'Rockefeller Center', 'South Street Seaport',
  'World Trade Center',
]);

function contextPenalty(event: SiftEvent): number {
  // Only penalize tourist-trap zones when the event doesn't have a strong vibe score
  if (TOURIST_TRAP_ZONES.has(event.neighborhood ?? '')) {
    // If vibe score is high, the event earned its spot — no penalty
    if (event.vibeScore && event.vibeScore >= 7) return 1.0;
    return 0.85; // light penalty for unproven events in tourist zones
  }
  return 1.0;
}
```

Apply in `computeEventScore`:
```typescript
return base * categoryWeight * contextPenalty(event);
```

### Priority 5: Smarter Blocklist Patterns

Add these to `TITLE_BLOCKLIST` in `lib/ingest/normalize.ts`:

```typescript
// Corporate / brand activations
/\bpresented by\b.*\b(chase|citi|amex|mastercard|capital one|wells fargo|td bank)\b/i,
/\bsponsored by\b/i,
/\bbrand (activation|experience|pop.?up)\b/i,
/\bcorporate (event|experience|retreat)\b/i,

// Chain venues (these should never surface)
/\b(dave & buster|bowlero|topgolf|hard rock cafe|madame tussauds|ripley.s)\b/i,

// Tourist traps
/\b(statue of liberty|empire state|top of the rock|one world|edge observation)\b/i,
/\b(helicopter tour|bus tour|walking tour of manhattan|sightseeing)\b/i,
/\b(hop on hop off|double decker)\b/i,

// Wrong format
/\b(zoom|virtual|online|webcast|livestream)\s+(event|class|workshop|meetup)\b/i,
/\b(career|job|hiring|recruitment)\s+(fair|event|expo)\b/i,
/\b(real estate|property|mortgage)\s+(event|seminar|expo)\b/i,

// Kid-focused (wrong demo)
/\bkids?\s+(event|party|class|workshop)\b/i,
/\bfamily\s+fun\b/i,
/\bchildren.s\s+(event|show|workshop)\b/i,

// Generic low-effort
/\bhappy hour\b(?!.*\b(dj|live|set|performance|art|gallery)\b)/i,
/\btrivia night\b(?!.*\b(themed|special|niche)\b)/i,
/\bkaraoke\b(?!.*\b(themed|drag|queer|japanese|private)\b)/i,
```

### Priority 6: Image Quality Heuristic

In `src/lib/getEvents.ts`, add image quality awareness to the completeness score:

```typescript
// Better image sources get higher completeness scores
const imageScore = !event.imageUrl ? 0
  : event.imageUrl.includes('unsplash.com') ? 0.2   // stock fallback, meh
  : event.imageUrl.includes('maps.googleapis') ? 0.25 // venue photo, ok
  : 0.4;  // source-provided image, best

const completeness =
  imageScore +
  (event.description && event.description.length > 20 ? 0.3 : 0) +
  (event.location ? 0.2 : 0) +
  (event.priceLabel && event.priceLabel !== "See tickets" ? 0.1 : 0);
```

---

## Files to Modify

| File | What Changes |
|---|---|
| `lib/ingest/config.ts` | Add ~28 new Eventbrite seed orgs (look up IDs via API) |
| `api/cron/ingest-score.ts` | Replace vibe check prompt with 3-dimension scoring |
| `lib/ai-collect-data/collect-names.ts` | Add 6 new source generators (Shotgun, Sofar, Ohmyrockness, Nonsense NYC, Lot Radio, Withfriends) |
| `src/lib/getEvents.ts` | Add tourist-trap context penalty to ranking, image quality heuristic |
| `lib/ingest/normalize.ts` | Add ~20 new blocklist patterns |

## Order of Operations

1. **Eventbrite seed orgs** — requires API calls but highest immediate impact
2. **Blocklist patterns** — 5 minutes, kills obvious junk
3. **Tourist-trap penalty** — 5 minutes, deprioritizes unproven events in tourist zones
4. **Vibe check prompt** — requires Supabase migration for `vibe_dimensions` column
5. **New sources** — most complex, implement one at a time, test each
6. **Image quality** — small change, incremental improvement

## Important Notes

- **Never commit `.env`** — it contains secrets
- **Never push to main** — create a feature branch
- **Test each source individually** before enabling in production: `npx tsx --env-file=.env lib/ai-collect-data/run-all.ts --source shotgun --limit 5`
- The Eventbrite OAuth token is in `.env` as `EVENTBRITE_OAUTH_TOKEN`
- Current branch convention: `feat/` prefix for features
