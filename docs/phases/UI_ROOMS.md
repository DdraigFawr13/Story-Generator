# UI redesign: Four rooms

Morgan asked on 2026-10-14 for a few things: a personal page for each character reachable from Legends, a way to watch a single town, and a simpler, more modern UI. Morgan approved the "Four rooms" mock-up (v8) on 2026-10-14 at 05:36 UTC. The mock-up is at https://claude.ai/artifact/VT6XLBU3RDeB7KDqa17Ysy, and a copy with the map scripts is in `/mnt/project-files/worldgen/ui-redesign/fresh-ideas/`. This redesign is UI only: the engine and the history do not change.

## Shape

There are four rooms, chosen from a left rail on desktop and a bottom tab bar on phones:

- **Tales:** the world map, where history plays out.
- **People:** a page for each person.
- **Book:** the chronicle.
- **Town:** a single watched site.

A **World** item at the foot of the rail opens the existing map, with its layers, inspector, saves and embark.

The build has three steps. Each step is one PR, gets one coordinator review, and merges on green CI; Morgan's approval covers all three.

1. **U1 Tales room** (this spec): the storybook map, its map modes, the pause-and-ask playback and the time ribbon.
2. **U2 People room and Follow:** personal pages reached from Legends and from the pause card.
3. **U3 Book room** and **U4 Town room** (split in two PRs on 2026-10-14; each is as large as a room).

## U1 Tales room

**Where it lives:** `src/app/tales/` holds the room, the map drawing (`atlas.ts`), the markers and the CSS. The room replaces `HistoryPlayback` at the same entry points: after Generate, and from the slider's play button. While the rooms are still being built, the rail's People and Book items open the existing Legends pane and Town opens the embark flow. Closing Tales returns to the existing map at the year shown.

**The map** is drawn on a canvas from the world cells and the playback data (`bordersAt`, `sitesAt`, `seatsAt`). It follows the mock-up's look:

- sea `#c7d5d7`, with faint coastal ripples;
- paper land with soft biome tints;
- small deterministic symbols for terrain and plants:
  - shaded peaks and crags, and hills drawn as arcs;
  - two-tone trees that grow denser towards a forest's heart, and pines;
  - palms, reeds, dunes and stones, acacias, tufts and dashes;
- smoothed rivers, wider where the flow is larger;
- an ink coastline;
- a thin double frame and a compass rose;
- region names from `world.regions` in spaced italics.

The terrain layer is drawn once per world. The political layer is redrawn only when `borderYear` changes. That layer holds:

- **Fills** for the chosen mode.
- **Wild land:** land no realm holds gets a faint diagonal hatch and a dotted edge.
- **Borders:** each realm's border is a soft, half-transparent band just inside its edge, in that realm's own colour.
  - Realm colours come from 11 hues by greedy graph colouring over neighbouring realms, so neighbours are far apart on the colour wheel.
  - A realm keeps the same colour in every mode.
  - Lakes inside a realm get no ring.
- **Roads**, faint.
- **Towns** as circles sized by population, with a double ring for each capital.

**Map modes:** Land, Realms (realm names written at each realm's centroid in a dark shade of its colour), Peoples (by race), Faiths and Plain.

- Faiths colours the land by each realm's faith and marks holy cities with a small sign.
- Religion (#109) stores only the faith a realm holds at the end of history. Faiths mode therefore shows that end state for every year, and the room says so in one line.

**Markers** sit in a DOM layer over the canvas:

- Capital names.
- Great beasts alive in the year shown, with a small mark and their name at the lair.
- Great figures alive in the year shown, as a gold star at their home site.
- Armies in a war, as a flag that walks the road graph from the attacker's capital to the battle site, leaving a dotted trail.
- Whatever moves glides. Nothing appears out of nowhere: things fade in and out.
- At most 3 short tags are shown at once.

**Pause and ask:**

- A "Pauses on" chooser offers legends, wars and new realms by default. Battles, new rulers, treasure and faith (holy wars, prophets, schisms) can be switched on.
- On a pause, the map dims slightly and a ring marks the place; the view never zooms.
- A card shows the event's title and its chronicle line, with three buttons:
  - Read the story (opens the Legends page);
  - Follow (when a person acted in the event);
  - Keep playing.
- The card plays on by itself after 8 s, with a progress bar.

**Follow:** a "Following X ✕" chip appears, a lane for that person is added to the ribbon, and playback then pauses only on their events.

**Time ribbon:**

- Play/pause and the speed (the existing speeds).
- Event dots coloured by kind.
- Scrubbing moves to any year.

**Phone (≤ 600 px wide):**

- The map fills the screen.
- The modes appear as a short chip row.
- The card becomes a bottom sheet.
- The rail becomes the tab bar.
- There is no sideways scroll at 390 px.

**Budgets:** the terrain layer takes at most 700 ms and a border-year redraw at most 120 ms, on a production build in Chromium at desktop size.

**Fonts:** Alegreya and Alegreya Sans SC, served from `public/fonts` under the SIL Open Font License (see its README there).

**Tests:**

- unit tests for the colouring (no two neighbouring realms share a hue) and for the pause filter;
- the Chromium smoke drives the Tales room where it drove the playback.

## U2 People room and Follow

**Where it lives:** `src/app/rooms/` holds the shared rail and room shell, taken out of the Tales room so that every room uses the same ones. `src/app/people/` holds the People room. The look matches Tales: paper colours, Alegreya type, and the same rail and phone tab bar. The layout follows the mock-up's People screen (`rooms-r3d`, `rooms-r3p`).

**People index** (the rail's People):
- A search box and filter chips: Legends, Rulers, Mages, Heroes, Priests and prophets, and Living.
- One row per notable figure: an initial disc in the colour of their realm, a gold dot for a legend, their name, a one-line role, their years, and their realm.
- Rows are sorted by fame. On a phone the list is a single column.

**Personal page:**
- **Header:**
  - name;
  - role line: tier, aptitude, office and realm;
  - chips: race, birth year and place, age or death, line or house, fame, faith.
- **Actions:**
  - **Watch \<home town\>** uses the existing watch-a-site action. It is greyed out, with a reason, when that action is unavailable.
  - **Follow their story** opens Tales with this person followed.
- **Tabs:**
  - **Life:** age and year on the left, with a dot for each event (gold for legend deeds).
  - **Family:** spouses, children and parents, as links.
  - **Deeds:** spells, battles, duels, works and treasures.
  - **Rivals.**
  - **All records:** the existing chronicle.
- **Side panel:** family, rivals, and "Lives at X" with that town's people and race and a Watch link.
- **Links:** every name links to its own page. Realms, towns, events and items open the existing Legends pages until the Book room takes them over.

**Entry points:**
- The Legends person links open the People page.
- The Tales card's Follow button and its lane chip link to the person.
- URLs use `?open=person:<id>` (the existing parse).
- Browser back returns to where the reader came from.

**Faith:** the faith chip shows the person's faith, taken from their town or their realm. A high priest or prophet has that role in the role line, and their page lists their preaching and schisms under Deeds.

**Tests:**
- unit tests for building a person's life rows and roles from the world;
- the browser smoke opens a person from the index and from a Tales card, then follows them back into Tales.

## U3 Book room

**Where it lives:** `src/app/book/`. It uses the shared rail. The layout follows the mock-up's Book screen (`rooms-r4d`).

**Contents** (left column):
- **Books of the realms:** one book per realm, largest first, with its years. Its chapters are the realm's annal eras (`annals()`, M4.9), with their engine names and years.
- **Lives:** legends and other famous figures, each linking to People.
- **Perilous places:** each linking to its Legends page.
- A search box finds names, places and years.

**Page:**
- **Chapter heading:** the chapter number and the book's title, the era name as the chapter title, and its years.
- **Summary:** one line that names its wars, rulers and deaths, built only from the era's own events.
- **Body:** the era's key events rendered as prose paragraphs with the existing chronicle text. Events of the same year form one paragraph. A drop cap and small-caps years give it the bookish look.
- **Plate:** a small map of only the places the chapter names, drawn by the Tales atlas in Plain mode.
- **Navigation:** previous and next chapter, with a progress bar.

**Margin notes:**
- Clicking a name opens a note in the right margin instead of leaving the page.
  - A person's note has their role and life, with "Read their life" (People) and "Watch them in X" (the watch action).
  - A place's note has its size and owner, and links to its page.
- On a phone, notes open as a bottom sheet.

**Book rules:** no invented facts or titles. Every sentence comes from event templates or engine fields. A chapter title is the engine's era name.

**Entry points:**
- The rail's Book item.
- Legends realm pages, which get a "Read the book" link.
- The Tales card's "Read the story" button opens the chapter that holds that event, with the event highlighted.

**Tests:**
- unit tests for building chapters from annals (years cover the history without gaps, and every event's chapter is found);
- the browser smoke opens a chapter from Tales and a margin note.

## U4 Town room

**Where it lives:** `src/app/town/`. It is a calmer drawing of the watched site, made from the same site state that `site-render.ts` reads. It replaces the coloured-letter tiles for the Town room only; the old site view stays under World. The layout follows the mock-up's Town screen (`rooms-r5d`):
- soft ground and paths;
- fields as striped beds;
- buildings as paper blocks with names on the ones that have a purpose: hall, alehouse, smithy, shrine, bakehouse, well;
- people as small dots that ease between places. A followed person is an orange dot with a name tag.

**Header:** the town's name, and a line with its kind, realm, people and how many can be followed. A card shows the time of day, the date, the weather and the temperature.

**Side panel:**
- **Following:** the person's role, age and mood word, what they are doing now and earlier, and needs bars. "Their whole life" links to People.
- **With them:** the people who share their building.
- **Tales told here:** recent world events that reached this town, from existing site and world links. No invented tales.

**Controls:** pause and play, and the speed (the existing day speeds). "Hall of records" opens the town's Book or Legends page, and "Leave for the world" returns to Tales.

**Entry points:**
- The rail's Town item opens the last watched town, or a picker of towns that can be watched.
- Watch from People and from the Book.

**Phone:** the map fills the top, the panel becomes a sheet, and the tab bar sits at the bottom.

**Tests:**
- unit tests for the scene model (which buildings are labelled, who shares a room);
- the browser smoke watches a town from People and plays a day.

## Status

- Family tree (2026-10-17): in progress as a dynasty tree screen in the People room (build order item 6's leftover).
- Tales after the play-through (#117, 2026-10-16): once history ends the Tales map zooms and pans, names every town when close and marks each shown kind of event at its place; a mark or town opens a small card with its story, records and watch, and the end card offers Read the book. The rail's world button opens a new-world sheet (seed, size, years; the classic viewer stays reachable from it), every record page opens in the People room's shell, and Show on map opens Tales. Peoples colours take hues from the realm palette so neighbouring peoples stay apart on the wheel. Left for later: an about 0.4 s pause when the sharper map swaps in, and stepped borders at full zoom.
- Tales tweaks (Morgan, 2026-10-14): Realms is the default mode, listed first. Realm, people and faith fills lie over the land tints at 0.42 opacity (marks at 0.8), so biomes, rivers and towns show through. The key gains a legend for the mode: the realms held in the shown year, the peoples or faiths of the realms (six rows, then "and N more"), or the biomes over 3% of the land. The first play of a world runs to the present without pausing; reaching the present (or Skip) marks the world played, and every later play pauses (default chosen: "every play after the first"; following someone still pauses on their story). The "Pauses on" chooser becomes an Events filter with Show and Pause per kind; shown kinds mark the map (tags, armies for wars or battles, great figures for legends) and the ribbon, and only shown kinds can pause. New kinds: towns taken (razed or conquered) and famine and plague (importance 7+); peace files under wars. Shown by default: legends, wars and new realms, the kinds that pause (S1 ribbon: 109 dots; battles 190, rulers 259, famine and plague 238 more). Peace shows with wars but never pauses. Coordinator review (15 items): the first play never pauses, even when following; Skip also ends the first play; the key lists army, great figure and great beast only when drawn; realm rows capped at 4 with "named on the map"; swatches at the map's 0.42; battles light coral and towns teal; per-kind counts in the filter; the filter is kept in sessionStorage; phones show one map tag at a time; the phone present-day card sits above the chip and the ribbon. The Faiths key lists the faiths of the realms drawn in the shown year, which is what the map colours.
- U4: built (2026-10-14). `src/app/town/` holds `TownRoom.tsx`, `TownPicker.tsx`, `paint.ts` (canvas), `scene.ts` (pure model) and `town.css`. Labelled buildings are every definition except home, field and wall, and the hall reads "Jarl's hall" under a jarl. "With them" lists the others in the same building (the engine's place, else the footprint) or, outdoors, those outdoors within 4 tiles. Tales told here are events the legend index files under the town, importance 5 or more (`site.notable.minImportance`), from before the watch. Fires and threats pause the clock. Hall of records opens the town's Legends page (the Book has no place page). Links: `?site=N&day=D&room=town&follow=P` and `?room=town` (picker).
- U3: built (2026-10-14); coordinator review applied (12 bugs, 9 design items; the double "the" in some engine era names is left for an engine follow-up). Chapters draw from all the era's events by priority (key events, rulers, wars, famous deaths) to about 150–250 words; the year shows once per paragraph; realm, person and place names open margin notes; the plate marks only places the text names and is drawn at screen resolution. Perilous places list the towns near beast and dragon lairs, sorted by deaths. "Read the story" falls back to the Legends event page when no realm's book holds the event.
- U2: merged as #111 (2026-10-14). Shared rail in `rooms/`; People room in `people/`. Legends person links open the People page; the Tales card adds "Who is X?"; Follow from a page starts Tales at the person's birth year. Life rows are the events they acted in, with repeats folded; gold marks legend deeds only. The URL names the room, follow and year.
- U1: merged as #110 (2026-10-14). `HistoryPlayback`, `playback.css` and `playback/player.ts` are gone; the speeds now live in `tales/TalesRoom.tsx`. Town opens the map, the nearest existing entry to the embark flow.
- U1 review: no dark mode in U1. The Tales map is a parchment map and stays light in either scheme; a dark treatment is a later decision (2026-10-14).
