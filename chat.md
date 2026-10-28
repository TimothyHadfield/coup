# Coup — chat log

## 2026-10-19 — first build + phase 2 (builder agent)
- **Asked:** build Coup (vs computer with measured levels, odds on every claim, hint + study review, real-table companion), then phase 2: exact rules + variants, online seats, ideas, art, design, QA.
- **Built:** engine (base, Inquisitor, 2-player deal), Bayesian odds, three computer levels, Play/Table/Learn/Settings, original SVG art (art sub-agent), online rooms via shared online.js, `data/stats.json` simulations, `docs/rules-check.md` (research sub-agent), `docs/ideas.md`.
- **Verified:** node tests (engine 24, odds 9, table 4, online 6, ai strength); each suite failed once against a deliberately broken engine/odds/table/adapter then passed restored; WebKit UI runs playing whole games at 393px and 1280px with zero console errors; two-browser online game to the end incl. friend reload; live check of commit a7dba41.
- **Open:** QA sub-agent findings; Tim's phone check.

## 2026-10-20 — QA fixes (builder agent)
- **Asked:** fix the 9 QA findings + make browser Back go to the previous tab/screen.
- **Built:** 6-player table fits at 393px; bad room code shows "No room" instead of hanging; name fields keep focus; pair pick; hover only on real mouse; codes with spaces work; "Your turn" grammar + Watching names; Resume hides finished games; history Back. Also: Hard bots no longer loop forever (found by the desktop UI run), stats re-measured; online test flake traced to the test harness (two WebKit pages), fixed in the test.
- **Verified:** node tests (engine 24, odds 9, table 4, ai 6, online 6); new ai loop test failed on the old AI (300 turns) then passed; WebKit UI play at 393px + 1280px; two-browser online game; QA scripts for Back/focus/pair/6-player.
- **Open:** Tim's phone check.

## 2026-10-20 — visual design pass (builder agent)
- **Asked (Tim):** "review them again for design improvements especially visually."
- **Built:** CSS-only polish (plus a `sub` class on the card-art subtitle): the stage is bigger and glows when it's your move, the game-over headline is big, hand cards are bigger, action labels are bigger with equal rows, the laptop setup is wider with bigger fan cards, table setup fits without scrolling, tap targets are at least 40px, and the settings rows are tighter. Also fixed a hang in `tests/ui.play.mjs` (the test tapped a stale button after Hint).
- **Verified:** node tests (engine 24, odds 9, table 4, ai 6, online 6); `ui.play.mjs` 2/2 games at 393px and 1280px with no errors; before/after screenshots of every tab and 9 game states at both sizes; measured the table Start button above the tab bar (583 vs 601) and the 5-opponent game fitting (actions end at 593, tab bar at 601).
- **Open:** Tim's phone check.

## 2026-10-20 — sounds, celebrations, animations (builder agent)
- **Asked (Tim):** "add opptional sounds … win celebrations, and other fun annimations … make sure everything is customizable in the settings".
- **Built:** shared `js/fx.js` copied in; every engine event mapped to a sound + small animation (map in progress.md), deal sounds, your-turn chime, win confetti / lose fall, "big" star burst when you win a challenge, error sound for refused moves, Table-tab sounds; Settings gets a Sound & effects section styled like the other rows. No rules changed; online.js untouched.
- **Verified:** new `tests/ui.fx.mjs` (3 WebKit games: all on, Sound off, Animations off) failed before the change (no FX), passes after; also failed when the turn chime and celebrate kind were deliberately broken. Node tests engine 24, odds 9, table 4, ai 6 pass; `ui.play.mjs` 2/2 games at 393px + 1/1 at 1280px, no errors; storage-blocked run, no errors; screenshots of Settings, mid-game and win confetti at both sizes.
- **Open:** listening on a real phone; online sounds not run in a two-browser test.

## 2026-10-20 — real-table look (builder agent)
- **Asked (Tim):** make each game look like the real thing on a table, "like you're looking through a camera ... connected to a user's glasses".
- **Built:** shared `_table` kit copied in; Play tab is now a wood table: Court deck stack and Treasury coin heap in the middle, opponents on an arc with name plates, your cards tilted in front of you with a coin pile, actions on a reference card; deals and returns fly to/from the deck, coins slide between players and the Treasury. fx.js re-copied (1.0.3). No rule changes.
- **Verified:** engine 24, odds 9, table 4, online node test, `ui.play.mjs` (393 + 1280), `ui.fx.mjs`, `ui.online.mjs`; before/after shots of setup/mid/late/end at 393, 1280, 320 and 659 landscape with no errors, overflow, page scroll or off-screen buttons; Effects speed doesn't change the game Speed.
- **Open:** reviewer sub-agent not run; Tim's phone check.

## 2026-10-20 — weird-situation pass (builder agent)
- **Asked (Tim):** "focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird." Plus the table-look outside review that was skipped.
- **Built:** double-tap guard on every decision; finished game survives a reload; two tabs stay in step (one drives the computers); plain-words offline message; no-winner end screen guard; review fixes (lighter lost cards, whole-line log strip, faint 0 coins). New `tests/ui.edge.mjs`. No rules changes (none were wrong).
- **Verified:** 53 scenarios (list in progress.md); the 5 failures each failed on the old code and pass now; 2,100-game node simulation for rules oddities; engine/odds/table/online node tests, `ui.play.mjs` (393 + 1280), `ui.fx.mjs`.
- **Open:** background-for-10-minutes, Firestore drop mid-game, real iPhone.
- **Follow-up (same day):** a tighter two-tab test showed the first tap in the other tab was lost (the driver hand-off re-drew the table on pointerdown). Fixed: the loop restarts after pointerup. Test failed on 5c2c5d1 live, passes on the fix.

## 2026-10-21 / 10-27 — visibility pass (builder agents)
- **Asked (Tim):** "for a lot of the games the cards or board layout is too small to easily see what's going on ... Fix this so the view of what's happening and where everything is is very clear."
- **Built:** opponents' cards sized to fill the far side of the table (laptop 46 -> 73-88 px wide, 2 players on phone 36 -> 73 px); 6 seats no longer slide under the laptop Odds panel; tap an opponent to see their cards up close; Challenge/Block buttons use the full table width on phone and the reference card goes compact while a question needs the room (nothing pushed off screen or over your cards); the Hint reason shows in the log strip; at 320 px the table fits its column (was 13 px past the right gutter) and Hint/Quit stack so Quit isn't cut off; landscape Hint/Quit stack too; Table tab cards bigger (laptop 34 -> 52 px, 3 across). Paused 10-21 as a WIP commit, finished 10-27.
- **Verified:** new `tests/ui.visibility.mjs` (14 checks, WebKit): each failed on the old build, all pass now; tap hits checked in WebKit and Chrome at 320/393/1280; before/after shots of 8 states x 5 sizes, outside reviewer; full suite (engine, odds, table, ai, online, ui.play 393 + 1280, ui.fx, ui.edge).
- **Open:** 6 players on a phone: opponents' cards stay 34-36 px wide (height-limited; tap a seat to zoom). Real iPhone.

## 2026-10-27 — improve pass (builder agent, manager brief)
- **Asked:** per-game improve pass: a stronger Hard (≥65% vs Medium, ladder holds, not predictable); My stats/achievements/Daily, guided first game + Rules, install/offline (shared kits), Undo vs computer; no online changes.
- **Built:** Hard look-ahead search; kits `_coach`, `_profile` 1.1.0, `_pwa` 1.2.0 copied in, `_fx` re-copied; Undo; Daily (3 Hard); guided game; Rules sheet; strength wording + ratings from a new 1000-game ladder. Fixed along the way: Table companion kept a bluffing Assassin's refund after they went out; Hard's search used the wrong deck in the 2-player deal; a moved-in game parked behind "Resume" escaped the quit-loss and the Daily could be re-dealt (reviewer findings).
- **Verified:** Hard vs Medium 75% (was 47-53%), vs 3 Medium 64% (was 28%); new ai/table/ui.improve checks each seen failing on the old code; full suite (engine 24, odds 9, table 4, ai 8, ui.improve 33, ui.edge 41, ui.visibility 14, ui.fx, ui.play 393 + 1280, pwa-check 18/18, 3/18 on the old build); shots at 320/393/1280.
- **Open:** Tim's calls (7-8 players, achievement names, Hard vs Easy dipped 83→77%); real iPhone; search speed on a phone.

## 2026-10-28 — wave 3 (builder agent, manager brief)
- **Asked (Tim):** "go through each project adding features or changing things that you think should be changed ... links to youtube videos ... variations like common house rules ... making the layout better on iphone ... Just make the games better." Manager picked: Learn videos, a Factions (Reformation-style) variant the computers play, practical settings, first-visit offer covering the tab bar.
- **Built:** Factions variant (engine, Easy/Medium/Hard, odds, online, Table tab ignores it), Videos in the Rules sheet, Confirm challenges switch, coach offer lifted above the tab bar; build 15.
- **Verified:** factions.test 15/15 (12/15 failed on old code), engine 24, odds 9, table 4, online 6, ai 8; Factions ladder Hard>Medium>Easy (progress.md); ui.wave3 21 WebKit checks at 393/320/landscape/1280/1440 (offer covered the tab bar on the old live build: 645 vs 601); pwa-check 18/18; stamp OK.
- **Open:** Tim's calls (generic names, concede option left out); Factions online with real people.

## 2026-10-28 — wave-3 kit sweep (build 16)
- game-coach 1.2.0 + game-pwa 1.4.0 copied; offer `place:'auto'` avoiding Deal, own phone top-offer css removed. Verified: engine 24, odds 9, table 4, factions 15, ai 8, ui.wave3 21/21, pwa-check 18/18, offer rects at 393/320/659×393, Settings 320 no overflow, 393 + laptop screenshots looked at.
