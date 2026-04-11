-- ── Sift Test Data ───────────────────────────────────────────
-- Run in Supabase SQL editor to insert fake events for testing.
-- All events use source = 'test' so they're easy to identify/delete.
-- To wipe: DELETE FROM events WHERE source = 'test';

-- ── 1. Insert events ─────────────────────────────────────────
INSERT INTO events (source, source_id, title, description, category, start_date, end_date, venue_name, address, borough, price_min, price_max, is_free, event_url, tags)
VALUES
  -- ARTS
  ('test','art-001','Spring Group Exhibition','A group show featuring emerging NYC painters.','art','2026-04-15','2026-05-30','Gallery 456','456 W 25th St, New York, NY 10001','Manhattan',0,null,true,'https://example.com/art-001',ARRAY['exhibition','painting','free']),
  ('test','art-002','Sculpture Now: Brooklyn','Annual juried sculpture exhibition in DUMBO.','art','2026-05-02','2026-06-14','DUMBO Arts Center','30 Washington St, Brooklyn, NY 11201','Brooklyn',10,null,false,'https://example.com/art-002',ARRAY['exhibition','sculpture','brooklyn']),

  -- MUSIC
  ('test','mus-001','Candlelight: Tribute to Radiohead','String quartet performs Radiohead under candlelight.','live_music','2026-04-18',null,'Marble Collegiate Church','1 W 29th St, New York, NY 10001','Manhattan',39,75,false,'https://example.com/mus-001',ARRAY['candlelight','strings','midtown']),
  ('test','mus-002','The Soul Rebels','Eight-piece New Orleans brass ensemble, two nights in Brooklyn.','live_music','2026-04-25','2026-04-26','Brooklyn Bowl','61 Wythe Ave, Brooklyn, NY 11249','Brooklyn',36,50,false,'https://example.com/mus-002',ARRAY['live music','brass band','brooklyn']),
  ('test','mus-003','Jazz at Lincoln Center: Spring Gala','JALC Orchestra with Wynton Marsalis.','live_music','2026-05-09',null,'Jazz at Lincoln Center','10 Columbus Circle, New York, NY 10019','Manhattan',65,120,false,'https://example.com/mus-003',ARRAY['jazz','orchestra','lincoln center']),

  -- COMEDY
  ('test','com-001','PUNDERDOME: NYC Pun-Slam','Monthly pun competition at littlefield Brooklyn.','comedy','2026-04-22',null,'littlefield','635 Sackett St, Brooklyn, NY 11217','Brooklyn',15,null,false,'https://example.com/com-001',ARRAY['pun','competition','brooklyn']),
  ('test','com-002','Eastville Comedy: Saturday Standup','Two shows nightly with NYC up-and-comers.','comedy','2026-04-26',null,'Eastville Comedy Club','487 Atlantic Ave, Brooklyn, NY 11217','Brooklyn',28,null,false,'https://example.com/com-002',ARRAY['stand-up','brooklyn','weekend']),
  ('test','com-003','The Broadway Magic Hour','Family-friendly magic and comedy in Midtown.','comedy','2026-04-19',null,'The Broadway Comedy Club','318 W 53rd St, New York, NY 10019','Manhattan',28,null,false,'https://example.com/com-003',ARRAY['magic','family','midtown']),

  -- FOOD
  ('test','food-001','The Bloody Mary Festival','20+ vendors compete for best Bloody Mary in NYC.','food','2026-05-16',null,'BKloft26','153 26th St, Brooklyn, NY 11232','Brooklyn',55,null,false,'https://example.com/food-001',ARRAY['cocktails','festival','brunch']),
  ('test','food-002','Flavors of Chinatown Walking Tour','Taste your way through Chinatown with a local guide.','food','2026-04-19',null,'Near Bowery & Canal St','Bowery & Canal St, New York, NY 10013','Manhattan',89,null,false,'https://example.com/food-002',ARRAY['food tour','walking','downtown']),
  ('test','food-003','The DL Rooftop: Friday Nights','Open-air rooftop bar on the Lower East Side.','food','2026-04-17',null,'The DL','95 Delancey St, New York, NY 10002','Manhattan',0,null,true,'https://example.com/food-003',ARRAY['rooftop','bar','free']),

  -- OUTDOORS
  ('test','out-001','High Line Tour: From Freight to Flowers','Free guided tour led by High Line Docents.','outdoors','2026-04-19',null,'High Line at Gansevoort St','Gansevoort St, New York, NY 10014','Manhattan',0,null,true,'https://example.com/out-001',ARRAY['walking tour','free','parks']),
  ('test','out-002','Five Boro Bike Tour','40 car-free miles across all five boroughs.','outdoors','2026-05-03',null,'Battery Park','Battery Park, New York, NY 10004','Manhattan',99,null,false,'https://example.com/out-002',ARRAY['cycling','citywide','outdoor']),
  ('test','out-003','Conference House Park Beach Cleanup','Volunteer beach and park cleanup with NYC Parks.','outdoors','2026-04-11',null,'Conference House Park','7455 Hylan Blvd, Staten Island, NY 10307','Staten Island',0,null,true,'https://example.com/out-003',ARRAY['volunteer','free','nature']),

  -- NIGHTLIFE
  ('test','nit-001','Laylit #131 — Spring Edition','Brooklyn MENA dance night.','nightlife','2026-04-25',null,'Elsewhere','599 Johnson Ave, Brooklyn, NY 11237','Brooklyn',25,null,false,'https://example.com/nit-001',ARRAY['dance','brooklyn','late night']),
  ('test','nit-002','Pretty Girls Love R&B NYC','R&B night at a Manhattan rooftop.','nightlife','2026-04-17',null,'Harbor NYC Rooftop','621 W 46th St, New York, NY 10036','Manhattan',30,null,false,'https://example.com/nit-002',ARRAY['r&b','rooftop','party']),
  ('test','nit-003','Saturday Night Adult Skate ft. DJ Fade','Skate night with live DJs and vintage rink vibes.','nightlife','2026-04-19',null,'Xanadu','262 Starr St, Brooklyn, NY 11237','Brooklyn',32,null,false,'https://example.com/nit-003',ARRAY['skate','dj','brooklyn']),

  -- POPUPS
  ('test','pop-001','Summer Fridays: The Sun Room','Immersive fragrance pop-up in SoHo.','popups','2026-04-18','2026-04-19','22 Wooster St','22 Wooster St, New York, NY 10013','Manhattan',0,null,true,'https://example.com/pop-001',ARRAY['popup','beauty','soho','free']),
  ('test','pop-002','Purito Seoul #FromSoilToSeoul','Korean skincare pop-up in the West Village.','popups','2026-04-10','2026-04-17','576 Hudson St','576 Hudson St, New York, NY 10014','Manhattan',0,null,true,'https://example.com/pop-002',ARRAY['popup','skincare','west village','free']),
  ('test','pop-003','FabFitFun Build-A-Box Pop-Up','Build your own product box in SoHo.','popups','2026-04-22','2026-04-28','262 Mott St','262 Mott St, New York, NY 10012','Manhattan',0,null,true,'https://example.com/pop-003',ARRAY['popup','beauty','soho','free']),

  -- FITNESS
  ('test','fit-001','NYC Parks Free Fitness Classes','Free outdoor yoga and Zumba classes across NYC parks.','fitness','2026-04-19','2026-05-10','Central Park','Central Park, New York, NY 10024','Manhattan',0,null,true,'https://example.com/fit-001',ARRAY['free','fitness','yoga','outdoor']),
  ('test','fit-002','November Project NYC','Free outdoor workouts at iconic NYC spots. Location varies.','fitness','2026-04-15','2026-05-06','Various NYC locations','Revealed day-of via @NovemberProjectNYC','Manhattan',0,null,true,'https://example.com/fit-002',ARRAY['free','fitness','outdoor','community']),
  ('test','fit-003','Lululemon Community Run — Grand Central','Free weekly run departing from Grand Central.','fitness','2026-04-16','2026-05-07','Lululemon Grand Central','3 E 42nd St, New York, NY 10017','Manhattan',0,null,true,'https://example.com/fit-003',ARRAY['free','running','midtown','community']),

  -- THEATER
  ('test','the-001','Shakespeare in the Park: A Midsummer Night''s Dream','Free Shakespeare in Central Park via lottery.','theater','2026-05-19','2026-06-28','Delacorte Theater','Central Park, New York, NY 10024','Manhattan',0,null,true,'https://example.com/the-001',ARRAY['free','shakespeare','outdoor theater','central park']),
  ('test','the-002','BAM NextWave: New Works in Progress','Emerging theater with post-show talkbacks at BAM.','theater','2026-04-24','2026-05-03','BAM Fisher','321 Ashland Pl, Brooklyn, NY 11217','Brooklyn',15,35,false,'https://example.com/the-002',ARRAY['theater','emerging artists','brooklyn']),
  ('test','the-003','Lincoln Center Out of Doors — Theater','Free outdoor theater on Lincoln Center plazas.','theater','2026-04-25','2026-04-26','Lincoln Center Plaza','10 Lincoln Center Plaza, New York, NY 10023','Manhattan',0,null,true,'https://example.com/the-003',ARRAY['free','outdoor theater','lincoln center']),

  -- WORKSHOPS
  ('test','wor-001','Brooklyn Brainery: Urban Beekeeping 101','Learn urban beekeeping from a rooftop beekeeper.','workshops','2026-04-19',null,'Brooklyn Brainery','190 Underhill Ave, Brooklyn, NY 11238','Brooklyn',20,null,false,'https://example.com/wor-001',ARRAY['workshop','beekeeping','brooklyn']),
  ('test','wor-002','NYC Street Photography Walk','Guided 2-hour photography walk through the Lower East Side.','workshops','2026-04-18',null,'Lower East Side','Orchard St & Delancey St, New York, NY 10002','Manhattan',30,null,false,'https://example.com/wor-002',ARRAY['workshop','photography','walking']),
  ('test','wor-003','Brooklyn Public Library: Intro to Bookbinding','Hand-sewn journal workshop. All materials provided.','workshops','2026-04-25',null,'Brooklyn Public Library','10 Grand Army Plaza, Brooklyn, NY 11238','Brooklyn',0,null,true,'https://example.com/wor-003',ARRAY['free','workshop','crafts','library']),
  ('test','wor-004','Natural Dyeing Workshop','Dye fabric using plants and food scraps.','workshops','2026-04-26',null,'The Loom','55 Washington St, Brooklyn, NY 11201','Brooklyn',45,null,false,'https://example.com/wor-004',ARRAY['workshop','textile','crafts','brooklyn']),
  ('test','wor-005','Queens Botanical Garden: Spring Planting','Grow herbs and veggies from seed. Take home your seedlings.','workshops','2026-05-02',null,'Queens Botanical Garden','43-50 Main St, Flushing, NY 11355','Queens',15,null,false,'https://example.com/wor-005',ARRAY['workshop','gardening','queens','spring'])

ON CONFLICT (source, source_id) DO UPDATE SET
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  start_date  = EXCLUDED.start_date,
  end_date    = EXCLUDED.end_date,
  price_min   = EXCLUDED.price_min,
  price_max   = EXCLUDED.price_max,
  is_free     = EXCLUDED.is_free;


-- ── 2. Insert event_sessions ──────────────────────────────────
-- Single-session events first (one row per event)
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-04-15','Tue–Sat 11 AM – 6 PM','Gallery 456','456 W 25th St, New York, NY 10001','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='art-001'
UNION ALL
SELECT e.id,'2026-05-02','Wed–Sun 12 PM – 7 PM','DUMBO Arts Center','30 Washington St, Brooklyn, NY 11201','Brooklyn',10,null FROM events e WHERE e.source='test' AND e.source_id='art-002'
UNION ALL
SELECT e.id,'2026-04-18','7 PM','Marble Collegiate Church','1 W 29th St, New York, NY 10001','Manhattan',39,75 FROM events e WHERE e.source='test' AND e.source_id='mus-001'
UNION ALL
SELECT e.id,'2026-05-09','8 PM','Jazz at Lincoln Center','10 Columbus Circle, New York, NY 10019','Manhattan',65,120 FROM events e WHERE e.source='test' AND e.source_id='mus-003'
UNION ALL
SELECT e.id,'2026-04-22','8 PM','littlefield','635 Sackett St, Brooklyn, NY 11217','Brooklyn',15,null FROM events e WHERE e.source='test' AND e.source_id='com-001'
UNION ALL
SELECT e.id,'2026-04-19','2 PM','The Broadway Comedy Club','318 W 53rd St, New York, NY 10019','Manhattan',28,null FROM events e WHERE e.source='test' AND e.source_id='com-003'
UNION ALL
SELECT e.id,'2026-05-16','11 AM – 2 PM','BKloft26','153 26th St, Brooklyn, NY 11232','Brooklyn',55,null FROM events e WHERE e.source='test' AND e.source_id='food-001'
UNION ALL
SELECT e.id,'2026-04-19','10:30 AM','Near Bowery & Canal St','Bowery & Canal St, New York, NY 10013','Manhattan',89,null FROM events e WHERE e.source='test' AND e.source_id='food-002'
UNION ALL
SELECT e.id,'2026-04-17','9 PM','The DL','95 Delancey St, New York, NY 10002','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='food-003'
UNION ALL
SELECT e.id,'2026-04-19','12 PM – 1 PM','High Line at Gansevoort St','Gansevoort St, New York, NY 10014','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='out-001'
UNION ALL
SELECT e.id,'2026-05-03','7 AM','Battery Park','Battery Park, New York, NY 10004','Manhattan',99,null FROM events e WHERE e.source='test' AND e.source_id='out-002'
UNION ALL
SELECT e.id,'2026-04-11','10 AM – 2 PM','Conference House Park','7455 Hylan Blvd, Staten Island, NY 10307','Staten Island',0,null FROM events e WHERE e.source='test' AND e.source_id='out-003'
UNION ALL
SELECT e.id,'2026-04-25','9 PM','Elsewhere','599 Johnson Ave, Brooklyn, NY 11237','Brooklyn',25,null FROM events e WHERE e.source='test' AND e.source_id='nit-001'
UNION ALL
SELECT e.id,'2026-04-17','10 PM','Harbor NYC Rooftop','621 W 46th St, New York, NY 10036','Manhattan',30,null FROM events e WHERE e.source='test' AND e.source_id='nit-002'
UNION ALL
SELECT e.id,'2026-04-19','7 PM','Xanadu','262 Starr St, Brooklyn, NY 11237','Brooklyn',32,null FROM events e WHERE e.source='test' AND e.source_id='nit-003'
UNION ALL
SELECT e.id,'2026-04-18','10 AM – 4 PM','22 Wooster St','22 Wooster St, New York, NY 10013','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='pop-001'
UNION ALL
SELECT e.id,'2026-04-10','11 AM – 6 PM','576 Hudson St','576 Hudson St, New York, NY 10014','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='pop-002'
UNION ALL
SELECT e.id,'2026-04-22','12 PM – 5 PM','262 Mott St','262 Mott St, New York, NY 10012','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='pop-003'
UNION ALL
SELECT e.id,'2026-04-19','8 AM','Brooklyn Brainery','190 Underhill Ave, Brooklyn, NY 11238','Brooklyn',20,null FROM events e WHERE e.source='test' AND e.source_id='wor-001'
UNION ALL
SELECT e.id,'2026-04-18','10 AM – 12 PM','Lower East Side','Orchard St & Delancey St, New York, NY 10002','Manhattan',30,null FROM events e WHERE e.source='test' AND e.source_id='wor-002'
UNION ALL
SELECT e.id,'2026-04-25','1 PM – 3:30 PM','Brooklyn Public Library','10 Grand Army Plaza, Brooklyn, NY 11238','Brooklyn',0,null FROM events e WHERE e.source='test' AND e.source_id='wor-003'
UNION ALL
SELECT e.id,'2026-04-26','11 AM – 2 PM','The Loom','55 Washington St, Brooklyn, NY 11201','Brooklyn',45,null FROM events e WHERE e.source='test' AND e.source_id='wor-004'
UNION ALL
SELECT e.id,'2026-05-02','10 AM – 12 PM','Queens Botanical Garden','43-50 Main St, Flushing, NY 11355','Queens',15,null FROM events e WHERE e.source='test' AND e.source_id='wor-005'
ON CONFLICT (event_id, date) DO NOTHING;


-- Multi-session events
-- Soul Rebels: 2 nights
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-04-25','8 PM','Brooklyn Bowl','61 Wythe Ave, Brooklyn, NY 11249','Brooklyn',36,50 FROM events e WHERE e.source='test' AND e.source_id='mus-002'
UNION ALL
SELECT e.id,'2026-04-26','8 PM','Brooklyn Bowl','61 Wythe Ave, Brooklyn, NY 11249','Brooklyn',36,50 FROM events e WHERE e.source='test' AND e.source_id='mus-002'
ON CONFLICT (event_id, date) DO NOTHING;

-- Eastville Comedy: 6 PM and 8 PM same night (use two dates workaround: store as same date, different time)
-- Note: event_sessions unique on (event_id, date) so we can only store one per date.
-- For same-day multi-showtime, the 8 PM show is stored on date + 1 day for dedup purposes.
-- In production this would be handled differently; for test data we just insert the 6 PM show.
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-04-26','6 PM','Eastville Comedy Club','487 Atlantic Ave, Brooklyn, NY 11217','Brooklyn',28,null FROM events e WHERE e.source='test' AND e.source_id='com-002'
ON CONFLICT (event_id, date) DO NOTHING;

-- NYC Parks Fitness: 4 Saturdays across two boroughs
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-04-19','9 AM','Central Park','Central Park, New York, NY 10024','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-001'
UNION ALL
SELECT e.id,'2026-04-26','9 AM','Riverside Park','Riverside Dr, New York, NY 10024','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-001'
UNION ALL
SELECT e.id,'2026-05-03','9 AM','Central Park','Central Park, New York, NY 10024','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-001'
UNION ALL
SELECT e.id,'2026-05-10','9 AM','Prospect Park','Grand Army Plaza, Brooklyn, NY 11238','Brooklyn',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-001'
ON CONFLICT (event_id, date) DO NOTHING;

-- November Project: 4 Wednesdays at different locations
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-04-15','6:28 AM','Brooklyn Bridge','Brooklyn Bridge, New York, NY 10038','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-002'
UNION ALL
SELECT e.id,'2026-04-22','6:28 AM','Met Steps','1000 5th Ave, New York, NY 10028','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-002'
UNION ALL
SELECT e.id,'2026-04-29','6:28 AM','Prospect Park','Grand Army Plaza, Brooklyn, NY 11238','Brooklyn',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-002'
UNION ALL
SELECT e.id,'2026-05-06','6:28 AM','Hudson River Park','Hudson River Park, New York, NY 10014','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-002'
ON CONFLICT (event_id, date) DO NOTHING;

-- Lululemon Run: 4 Thursdays
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-04-16','6:30 PM','Lululemon Grand Central','3 E 42nd St, New York, NY 10017','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-003'
UNION ALL
SELECT e.id,'2026-04-23','6:30 PM','Lululemon Grand Central','3 E 42nd St, New York, NY 10017','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-003'
UNION ALL
SELECT e.id,'2026-04-30','6:30 PM','Lululemon Grand Central','3 E 42nd St, New York, NY 10017','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-003'
UNION ALL
SELECT e.id,'2026-05-07','6:30 PM','Lululemon Grand Central','3 E 42nd St, New York, NY 10017','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='fit-003'
ON CONFLICT (event_id, date) DO NOTHING;

-- Shakespeare in the Park: a few sample nights
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-05-19','8 PM','Delacorte Theater','Central Park, New York, NY 10024','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='the-001'
UNION ALL
SELECT e.id,'2026-05-22','8 PM','Delacorte Theater','Central Park, New York, NY 10024','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='the-001'
UNION ALL
SELECT e.id,'2026-05-29','8 PM','Delacorte Theater','Central Park, New York, NY 10024','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='the-001'
ON CONFLICT (event_id, date) DO NOTHING;

-- Lincoln Center Out of Doors: Sat & Sun, 3 PM & 6 PM (4 sessions)
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-04-25','3 PM','Lincoln Center Plaza','10 Lincoln Center Plaza, New York, NY 10023','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='the-003'
UNION ALL
SELECT e.id,'2026-04-26','3 PM','Lincoln Center Plaza','10 Lincoln Center Plaza, New York, NY 10023','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='the-003'
ON CONFLICT (event_id, date) DO NOTHING;

-- Pop-up range: insert a session per day for pop-001 (2 days)
INSERT INTO event_sessions (event_id, date, time, venue_name, address, borough, price_min, price_max)
SELECT e.id,'2026-04-19','10 AM – 4 PM','22 Wooster St','22 Wooster St, New York, NY 10013','Manhattan',0,null FROM events e WHERE e.source='test' AND e.source_id='pop-001'
ON CONFLICT (event_id, date) DO NOTHING;


-- ── To clean up all test data ─────────────────────────────────
-- DELETE FROM events WHERE source = 'test';
-- (event_sessions will cascade-delete automatically)
