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
3. **U3 Book and Town rooms:** the Town room needs a calmer site drawing.

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

## Status

- U1: built, awaiting review (2026-10-14). `HistoryPlayback`, `playback.css` and `playback/player.ts` are gone; the speeds now live in `tales/TalesRoom.tsx`. Town opens the map, the nearest existing entry to the embark flow.
