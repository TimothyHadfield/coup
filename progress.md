# Coup — progress

## START HERE
Read this, then `CLAUDE.md`, then `docs/rules-check.md`. Last updated: 2026-10-28 (wave 3: Factions variant, Learn videos, Confirm challenges, coach offer no longer covers the tab bar, `tests/factions.test.js` + `tests/ui.wave3.mjs`; before that the improve pass: Hard look-ahead, My stats / Daily / Undo / guided game / Rules / home-screen install, `tests/ui.improve.mjs`; before that the visibility pass, the weird-situation pass, the real-table look, sounds/animations and the visual design pass).

## Goal right now
Feature-complete per the common brief + phase-2 brief. Waiting on Tim's look at it on his phone.

## Status
| Part | State |
|---|---|
| Wave-3 kit sweep (build 16, 2026-10-28) | Done. game-coach 1.2.0 (offer `place:'auto', avoid:['#tab-play [data-new]']`, local phone `.coach-offer{top;bottom:auto}` removed, laptop right-corner rule kept) + game-pwa 1.4.0; offer clear of tab bar + Deal at 393×659/320×568/659×393; Settings 320 no sideways scroll; no `<select>`. |
| Engine (base + Inquisitor + official 2-player deal) | Done, 24 tests |
| Odds (exact Bayes over unseen cards + claim evidence) | Done, 9 tests (brute-force match) |
| Computers Easy/Medium/Hard | Done, measured (below) |
| Play tab: odds on claims, Hint with reason, study mode, Review + calibration | Done |
| Table tab (real-table companion, friends' bluff habits by name) | Done, 4 tests (200 replayed games match the engine) |
| Learn tab (rules in own words, odds calculator, measured data) | Done |
| Online rooms (any seat friend or computer, reload resumes) | Done, node tests + real two-browser run |
| Visual design pass (2026-10-20) | Done: CSS block at the end of `styles.css` ("design pass") |
| Sound & effects (2026-10-20) | Done: `js/fx.js` (copy of `../_fx/fx.js`, never edit) + the "sound & effects" block in `js/app.js`; Settings has a Sound & effects section; `tests/ui.fx.mjs` |
| Real-table look (2026-10-20) | Done: dark wood table, Court deck stack + Treasury coin heap in the middle, opponents round the far side on an arc with brass name plates, your 2 cards tilted in front of you with a real coin pile, actions on a cream reference card; cards fly from the deck when dealt / returned. Kit = `css/table.css` + `js/tablekit.js` (copies of `../_table/`, never edit); our CSS is the "table look" block at the end of `styles.css` |
| Weird-situation pass (2026-10-20) | Done: 53 scenarios, 5 failed and fixed (table below); `tests/ui.edge.mjs` re-runs the 41 browser ones |
| Visibility pass (2026-10-27) | Done: opponents' cards sized to fill the far side (`fitSeats` in `js/app.js`, worked out once per screen size + player count so nothing jumps), tap a seat for a close-up (`openSeat`), phone questions use the full table width, reference card compacts when a question needs room (`fitTight`), 320 px fits its column; CSS "visibility pass" block at the end of `styles.css`; `tests/ui.visibility.mjs` (14 checks) |
| Improve pass (2026-10-27) | Done: Hard looks ahead (`js/ai.js` "Hard: look ahead": samples likely hands from the odds, plays each top choice 4 turns out with Medium-style play, 600 ms cap); My stats + achievements + Daily game (`_profile` 1.1.0), Undo vs the computer, guided first game + Rules sheet (`_coach`), home-screen install + offline (`_pwa` 1.2.0, `tests/pwa-check.json`, 18/18); `tests/ui.improve.mjs` (33 checks) |
| Wave 3 (2026-10-28, build 15) | Done: **Factions** variant (Settings → Variants, off by default; Reformation rules under a generic name: Loyalist/Reformist sides, Convert, Embezzle, Almshouse; engine + all 3 computers + odds + online rooms; `tests/factions.test.js` 15 tests, failed 12/15 on the old code); **Videos** section in the Rules sheet (5 links, below); **Confirm challenges** switch (Settings → Play, off by default); first-visit coach offer moved to the top of the screen (over the decorative card fan; top-right corner on laptops) so it covers neither the tab bar nor Deal (`.coach-offer` override in `styles.css`, no kit edit; in landscape phone it still covers the Opponents row); `tests/ui.wave3.mjs` (21 WebKit checks) |
| Live | https://timothyhadfield.github.io/coup/ |

**Factions strength** (`node tools/ladder-factions.js 400`, 2026-10-28, seats rotated; numbers not written to stats.json): Hard vs Medium 74.8%, Medium vs Easy 73.8%, Hard vs Easy 76.3% (400 each); three-way Easy/Medium/Hard 6/15.8/78.3%; Hard vs 3 Medium 78.5% (200, fair 25%); Medium vs 3 Easy 45% (200). Ladder holds.

**Learn videos** (each checked with YouTube oembed 2026-10-28; `VIDEOS` in `js/app.js`): lPlBDZnxHQA "Coup - How To Play" (Watch It Played) · NHLV9BEfAog "Coup - Shut Up & Sit Down Review" · SBf-kE5rAVo "How to Win at Coup Every Time! | Simple Strategy #13" (StrataGames) · 1yX9bwlQk8I "Coup Reformation Review - with Tom Vasel" (Dice Tower) · qy-W3W5togk "Coup Reformation | Game the Game" (Geek & Sundry).

**Weird-situation pass** (`node tests/ui.edge.mjs <url> <outDir> [ids]`, WebKit; rules ones in node):
| Area | Checked | Was broken, now fixed |
|---|---|---|
| Rules (2,100 AI games, all sizes/variants) | treasury never runs dry (max 38 of 50 coins held), deck never empty in play (min 1), no stalemate (max 83 turns), odds always 0-100%, 0 AI errors; double loss, refunds, steal 0/1, actor out on own turn, examine target out | none (no rules gaps) |
| Taps | double taps on Income / Allow / Keep, Deal twice, taps during computer turns, dead target, Cancel, Hint everywhere, Quit box left open | double-tap Allow answered the *next* question too (let an Assassination through): a tap within 350 ms of a new question (by the touch's own timestamp) is now ignored |
| Reload / tabs / Back | reload on turn / in Exchange / on game over, two tabs, storage blocked, Back, settings mid-game, rotate | reload on game over lost the result + Review (now kept until Close / New game); two tabs played separate copies and overwrote each other (now the tab you touch moves the computers and the other follows the save) |
| Devices | 320x568, 393x659, 659x393, 1280, 1920, 200% zoom, 2 and 6 players, light scheme | none |
| Screens | 300-turn log, 12 / 0 coins, 4 of 6 out, no-claims Review, Table Undo after the win, long/emoji/duplicate names | none |
| Online | no internet, then back; bad codes | offline toast said "Importing a module script failed." (now "Can't reach the online server. Check your connection and try again."); a finished room with no winner would have crashed the end screen (guarded, reasoned only) |

**Event → sound map** (computers' moves at 0.85 volume; steps 150 ms apart, 0.55x on Fast; same in online games, driven by new events in each snapshot):
| Event | Sound | Animation |
|---|---|---|
| New game deal | `shuffle`, then `cardDeal` per card | each card pops in turn |
| Your turn starts (only yours) | `turn` | "Your turn" pulses |
| Claim (Tax, Steal, Exchange, Examine) | `cardSlide` | claimer pops |
| Assassinate (pays 3) | `whoosh` | "−3" floats off the coins, target pops |
| Coup (pays 7) | `coins` | "−7" floats, target pops |
| Block | `block` (custom: knock + faint ring) | blocker pops |
| Challenge | `stamp` | challenged player flashes orange; if YOU caught a bluff or your claim held: `big` star burst + ding |
| Card shown to win a challenge | `cardFlip`, `shuffle` | prover pops |
| Card lost | `cardFlip` + `hit` (`explosion` for a Coup) | player shakes and flashes red (CSS flip already turns the card) |
| Player out | `sink` | — |
| Income / Foreign aid / Tax / refund | `coin` (1) or `coins` (2-3) | "+N" floats, coins pop |
| Steal | `coins` (`miss` if 0) | a coin flies target → thief, "−N" / "+N" |
| Action blocked | `miss` | — |
| Exchange / forced swap | `shuffle` | your cards pop (or their box) |
| Examine shown / kept | `cardFlip` / `cardSlide` | — |
| Game over | `celebrate win` (confetti in your cards' colours) or `lose` | — |
| Illegal move / dead target / online move refused | `error` | target shakes |
| Table tab: turn saved / Undo / winner | `place` / `slide` / `win`, `lose` (or `big` when watching) | — |
| Any button | `tap` (fx.js, "Button clicks" switch) | — |

**Measured strength** (`node tools/ladder.js` writes `data/stats.json` "strength", 2026-10-27, seats rotated): Hard vs Medium 75% (was 47-53%), Hard vs Easy 77% (was 83%: its look-ahead assumes Medium-style opponents), Medium vs Easy 74% (1000 games each); three-way Easy/Medium/Hard 17/24/59% (900); Hard vs 3 Medium 64% (300, fair 25%; was 28%); Hard vs 5 Medium 47% (150, fair 17%); Medium vs 3 Easy 43% (fair 25%). Ratings in My stats: Easy 1200, Medium 1385, Hard 1577 (from these). Not predictable: from the same deal Hard opened 2+ different ways in 33 of 40 deals (12 tries each). Hand/seat data below is from the old Hard (`tools/hands.js`, 2026-10-20): Seat data: first player 47% (2p), 35% (3p, fair 33%), 25% (4p), 25% (5p), 19% (6p). Avg turns 2p 12 · 4p 35 · 6p 57. Best start: Duke+Duke 70% in 3p Hard games; worst Captain+Contessa 20%.

## Standing instructions (Tim's words)
- "build regular play online with a computer or other online players for all the games and their common varients that match exactly the play of the in-person game."
- "Make sure to get everything right like rules and artwork and specific numbers of cards, routes, details, etc."
- "Really work on the webdesign of the games, aswell as art, fitting it with an iphone and computer"
- Hub dark tokens, phone-first, no page scroll on main screens, ? explains why, choices live in Settings. $0.
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)
- "could you also make sure that each of the games also have a look to them so that the game (either board or card layout) looks almost identical to how the board or card layout looks like in real life, so it's easy to understand if you've already played it before, and also so it feels more like you're actually playing in real life rather than you're playing it online. Even things like how youre cards or other things are laid out infront of you, make it look like they are actual cards laid out similar to how it looks like in real life. Make the decks look like actual decks. Make the board have the same design as it does in real life with the same layouts. It should look kind of like you're looking through a camera that is connected to a user's glasses that is playing in real life (not actually, but the layout and style of everything should be similar)." (2026-10-20)

- "for a lot of the games the cards or board layout is too small to easily see what's going on. Some games just need small design imporvements like filling the screen with the board view and fitting the cards and other things in the empty space, some have severe errors like TTR. Fix this so the view of what's happening and where everything is is very clear. Consider parts of the board that are dense in what's happening and if the user can reasonably see it." (2026-10-21)
- "I've noticed the games often have good user interfaces but could be improved especially when a scenario happens that the game might've not really thought about or whatnot. Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird." (2026-10-20)

## Traps
- **Kits + online.js stamp (2026-10-27 kitsweep, build 14):** `_coach` 1.1.0 and `_pwa` 1.3.0 re-copied byte-identical; the online.js import in `js/app.js` now uses the `_online` content stamp `?v=a3d0418b` (it was `?v=1`). After a re-copy of online.js: put the new stamp from `node ../_online/tools/stamp.mjs` there, bump every `?v=` + pwa `data-version` + `js/build.js`, then `node ../_online/tools/stamp.mjs --check .` must say OK. pwa-check 18/18 WebKit.
- Double-tap guard: decision taps (actions, targets, Challenge/Allow, Block, lose/show card, Examine) within 350 ms of a new question are dropped (`promptAt`, `tapTime(e)` uses `event.timeStamp`). Tests that tap a prompt the instant it appears must wait ~400 ms first.
- Two tabs: `localStorage['coup:driver']` holds the id of the tab that moves the computers (claimed on load and on any pointerdown). The other tab follows through the `storage` event. Never re-render on pointerdown: it swapped the button out from under the finger and lost the first tap in the other tab (shipped in 5c2c5d1, fixed in the next commit; the loop now restarts after pointerup). Storage blocked = every tab drives (only one tab can exist then anyway).
- Headless WebKit on a loaded machine stretches page timers by seconds; `ui.edge.mjs` makes double taps with in-page events stamped at tap time, and finishes the sheet slide-in with `getAnimations().finish()` before measuring.
- `js/online.js` is a copy of `../_online/online.js`; don't edit it here.
- Python writes on Windows can turn `\b` in a string into a real backspace char; edit JS with the Edit tool or byte-safe scripts.
- UI tests must re-query after each tap (snapshots redraw the DOM); clicking stale handles throws "not attached".
- WebKit logs a page error when a reload cuts Firestore's long-poll; `ui.online.mjs` filters only that.
- Game ends the moment one player is left (the winner's last action may not pay out) — table test compares coins at turn starts.
- Port 8731 belonged to another agent's server; use 18473.
- Two WebKit pages in one test run: Playwright's "wait until stable" hangs (animation frames throttled), so `ui.online.mjs` taps with `force` and polls `waitForFunction` every 500 ms. That, not the app, was the "online game stalls" flake (measured 2026-10-20: 30-80 stuck taps per run, no move ever sent).
- `ui.play.mjs` used to hang forever when its 2nd decision fell on an action turn (the Hint tap redrew the screen, then the stale button threw "not attached" in a loop). Fixed 2026-10-20 by re-querying after Hint.
- `window.__coup.netLog` keeps the last 30 online snapshots/moves; the online test dumps it when stuck.
- `js/fx.js` is a byte-for-byte copy of `../_fx/fx.js`; recopy, never edit. Its switch/seg fallback CSS would win over ours, so `styles.css` ends with `.fx-set` rules that restyle its rows like the other Settings rows.
- Headless WebKit barely ticks animation frames while screenshotting: confetti looks stuck in the corners. For pictures, stub `requestAnimationFrame` with a 16 ms timer in the test page (the app is fine).
- `tests/ui.fx.mjs` fakes `AudioContext` (WebKit on Windows has none) and spies `FX.play` by intercepting `window.FX`.
- `css/table.css` + `js/tablekit.js` are byte copies of `../_table/table.css` / `table.js` (renamed because `js/table.js` is our Table tab). Recopy, never edit.
- The old `.coin i` rules are scoped `:not(.pile)`; without that they flatten the kit's real coins.
- Deal animation: cards not yet dealt are tracked in the `undealt` set ("seat:card") and re-hidden after every re-render, else they pop in early.
- My stats (`js/profile.js`, key `profile:*` on device): a game counts once (`G.recorded`). Hint or Undo → "With Hint or Undo", unrated; guided game never counts; quitting / dealing over a game you moved in = loss, even when it sits behind "Resume last game" (after an online room `G` is null but `store.game` holds it). Daily = 3 Hard, no Undo, same deal everywhere (`Profile.daily.seed`); the Daily button resumes a paused Daily instead of re-dealing.
- Factions (`rules.factions`): `E.sameSide` decides every "can't target" rule (only while both sides have a living player); Embezzle is a *denial* (`ACTIONS.embezzle.denies='Duke'`, pending `denies:true`), so challenge logic, odds and the AI all invert truth for it. Coins paid for Convert go to `s.reserve` (the Almshouse); `treasuryHTML` subtracts it. Daily and the guided game always use base rules.
- WebKit logs a fetch cut by `page.reload()` as "... due to access control checks"; `ui.wave3.mjs` waits for network idle before reloading.
- Coach "New to Coup?" offer used to cover the tab bar on a first visit (fixed in wave 3: moved to the top; just lifting it with `--coach-offer-bottom` made it cover Deal instead, which broke `ui.edge` R-storage-blocked); tests for returning players set `localStorage['coach-offer:coup-first']='1'`. `ui.edge.mjs` also blocks service workers (sw.js fetches bypass `page.route`, so the offline tests couldn't cut the net).
- Hard's search is timed (600 ms): node tests that replay games set `AI.SEARCH.budgetMs = 1e9` (plus fewer worlds) so runs are repeatable. `ai.test.js` takes ~6 min; `NO_SEARCH=1` turns the search off.
- `E.view` has `knownOut` (my set-aside cards in the 2-player deal; also inside `knownDeck`); the search keeps them out of the simulated deck.
- Hard bots used to loop forever (Assassinate vs bluffed Contessa between two last-card players, ~1.5% of games). Fixed by making repeat attacks into a past block less attractive; `ai.test.js` guards it (failed on the old AI: 300 turns).

## Decisions
- Examine (Inquisitor) is unblockable (one source says Contessa blocks; rulebook doesn't).
- Block challenge order: the actor is asked first, then others in seat order.
- Last game's winner starts the next local game (rulebook); online games pick at random.
- 2-player deal: only the starting player gets 1 coin (rulebook reading).
- Default "how much people bluff" = Some (0.3). Bot names Ava, Ben, Cleo, Dax, Esme.
- Online: Opponents setting sets the seat count; host toggles each open seat friend/computer; open seats become computers at start; computers use the host's level. At game end all cards are revealed to everyone for the Review.
- Online games don't count toward "Your wins" (now My stats; old win counts were moved in once as unrated results).
- Improve pass: Daily = you + 3 Hard; guided game = 2 Easy, fixed deal with Duke + Captain, you start; Undo button sits beside Hint/Quit; Help (Rules, Guided first game) is a Settings section; My stats + Daily buttons replace the "Your wins" line on the setup screen. Phone mid-table space left as is (opponents already show face-down cards). 7-8 players not added (needs the expansion's card counts).
- Factions (2026-10-28, manager's wave-3 brief picked it, overriding the old "Reformation parked"): generic names Loyalist/Reformist/Almshouse; starting side is random (seeded), then sides alternate round the table; the rulebook's "concede instead of revealing" option on an Embezzle challenge is left out (an embezzler with no Duke always reveals). Side chips L/R in gold/blue beside names; 9 actions on a 5-wide reference card.
- Confirm challenges (off by default) asks "Challenge NAME?" before a challenge; computer speed and remembered setup already existed.
- Browser Back: closes an open sheet first, then returns to the previous tab (history entries per tab and sheet).
- Design pass: the stage gets the space on phone (log shrinks), the stage glows blue whenever the move is yours (CSS `:has()`), game over shows the winner big and orange with the dead action grid hidden (kept in place), hand cards 78x109 on phone when there are 3 or fewer opponents, card subtitles hidden on small cards, laptop setup is wider with bigger fan cards, table setup fits 393px without scrolling, `.btn.small` 40px, `?` has a 42px hit area.
- Sound & effects section sits between Variants and Your record in Settings; win confetti uses the winner's character colours plus orange/blue/white; "big" moments = you catch a bluff, or your challenged claim holds.
- Table look: dark wood surface (Coup has no board); Court deck keeps a count badge; log is a faint strip on phone (tap for the full log) and hidden on laptop (side panel has it); dead cards dimmed face up with no stripes; landscape phone and 320px got their own layouts (actions were cut off there before).
- Table "Your 2 cards": tapping the same card twice picks a pair; at 5-6 players the player grid goes 3 across so Undo stays on screen.
- Table-look review (outside reviewer, 2026-10-20) fixes: lost cards are lighter (brightness .78, readable face up like a real table), the phone log strip shows 2 whole lines (2nd faint) instead of a half-cut fade, a 0-coin count is faint. Not done (Tim's call): odds bars, Hint/Quit look, coin piles under the cards, refcard tilt, claimed-card ghost in the middle, bigger laptop opponent cards.
- A finished game stays on the Play table after a reload; Close or New game clears it.
- Computers wait while the game is being moved by another tab; whichever tab you touch takes over.
- Visibility: with 3+ opponents the seats may sit in two rows (middle seats across the far side, outer two nearer you); on phone, while a Hint is showing, the log strip shows only the hint (the move is already in the middle); on an iPhone SE upright, Hint and Quit stack.

## NOT verified
- Real iPhone Safari (only WebKit headless at 393px). The design pass relies on CSS `:has()` (Safari 15.4+).
- How the sounds actually sound and how loud they are on a phone (tests use a fake AudioContext; nobody has listened). Online sounds from other players' moves: same code path as local (snapshot events), but not run in a two-browser test.
- With 4-5 opponents on phone, a speech bubble on a second-row opponent covers that opponent's name for a moment (from before the design pass; left alone).
- Online with 3+ real people; host vanishing mid-game (handover is online.js's job, tested there).
- Hard's look-ahead speed on a real phone (laptop: 2p ~19 ms, 4p ~51 ms, 6p ~207 ms a decision, worst ~0.9 s). Offline install only checked in headless WebKit (`tools/pwa-check.mjs`), not on an iPhone home screen.
- A local game once stalled on a computer's turn with no error (desktop UI run, 2026-10-20, machine at 100% CPU from other agents). Root cause not found; a 3-second safety net now restarts the game loop (logs "game loop restarted" as a console warning, `window.__coup.revived` counts it).
- After a friend reloads mid-game, online.js shows them "The server said no — you may not be in this room any more." once, though they rejoin and play on fine. That's in the shared `_online/online.js` (not ours to edit).
- Table look: reviewer ran 2026-10-20 on the old screenshots; its small fixes are in, the bigger ones are listed under Decisions as Tim's call. Card proportions 63x88 are from sleeve listings (reasoned).
- Weird-situation pass: page left in the background for 10 minutes, Firestore dropping mid-game, AFK / host leaving online, and the "finished room with no winner" guard were not run (reasoned).
- Factions online with real people (node online test + engine stand-in test only); Factions + Inquisitor together only run in node tests; Hard's search speed under Factions on a phone.
- Rule edge: 2-player-variant coin split (GameRules says both 1 coin).
- Visibility pass: with 6 players on a phone, opponents' cards stay 34-36 px wide (lost-card names ~7 px); the height is the limit because the middle keeps room for any question so nothing jumps. Tap a seat for the 112 px close-up. Laptop Hint/Quit stay small (Tim's call, see Decisions).

## Rejected / parked
- ~~Win-probability meter~~ heavy on phone; claim odds answer the real question.
- Reformation was parked here; built as the "Factions" variant on 2026-10-28 (manager's brief). ~~Anarchy expansion~~ still parked: separate rule set.
- ~~"Call it" trainer~~ parked; overlaps Review.
