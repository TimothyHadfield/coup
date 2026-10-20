# Coup — progress

## START HERE
Read this, then `CLAUDE.md`, then `docs/rules-check.md`. Last updated: 2026-10-20 (sounds, celebrations and animations via shared fx.js; before that the visual design pass).

## Goal right now
Feature-complete per the common brief + phase-2 brief. Waiting on Tim's look at it on his phone.

## Status
| Part | State |
|---|---|
| Engine (base + Inquisitor + official 2-player deal) | Done, 24 tests |
| Odds (exact Bayes over unseen cards + claim evidence) | Done, 9 tests (brute-force match) |
| Computers Easy/Medium/Hard | Done, measured (below) |
| Play tab: odds on claims, Hint with reason, study mode, Review + calibration | Done |
| Table tab (real-table companion, friends' bluff habits by name) | Done, 4 tests (200 replayed games match the engine) |
| Learn tab (rules in own words, odds calculator, measured data) | Done |
| Online rooms (any seat friend or computer, reload resumes) | Done, node tests + real two-browser run |
| Visual design pass (2026-10-20) | Done: CSS block at the end of `styles.css` ("design pass") |
| Sound & effects (2026-10-20) | Done: `js/fx.js` (copy of `../_fx/fx.js`, never edit) + the "sound & effects" block in `js/app.js`; Settings has a Sound & effects section; `tests/ui.fx.mjs` |
| Live | https://timothyhadfield.github.io/coup/ |

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

**Measured strength** (`data/stats.json`, `node tools/hands.js`, 2026-10-20 after the loop fix, seats rotated): Hard vs Easy 83% (1000 games), Medium vs Easy 74%, Hard vs Medium 47/53 (a 2000-game recheck gave 51/49: head-to-head they're even), three-way Easy/Medium/Hard 11/33/55% (900 games). Seat data: first player 47% (2p), 35% (3p, fair 33%), 25% (4p), 25% (5p), 19% (6p). Avg turns 2p 12 · 4p 35 · 6p 57. Best start: Duke+Duke 70% in 3p Hard games; worst Captain+Contessa 20%.

## Standing instructions (Tim's words)
- "build regular play online with a computer or other online players for all the games and their common varients that match exactly the play of the in-person game."
- "Make sure to get everything right like rules and artwork and specific numbers of cards, routes, details, etc."
- "Really work on the webdesign of the games, aswell as art, fitting it with an iphone and computer"
- Hub dark tokens, phone-first, no page scroll on main screens, ? explains why, choices live in Settings. $0.
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)

## Traps
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
- Hard bots used to loop forever (Assassinate vs bluffed Contessa between two last-card players, ~1.5% of games). Fixed by making repeat attacks into a past block less attractive; `ai.test.js` guards it (failed on the old AI: 300 turns).

## Decisions
- Examine (Inquisitor) is unblockable (one source says Contessa blocks; rulebook doesn't).
- Block challenge order: the actor is asked first, then others in seat order.
- Last game's winner starts the next local game (rulebook); online games pick at random.
- 2-player deal: only the starting player gets 1 coin (rulebook reading).
- Default "how much people bluff" = Some (0.3). Bot names Ava, Ben, Cleo, Dax, Esme.
- Online: Opponents setting sets the seat count; host toggles each open seat friend/computer; open seats become computers at start; computers use the host's level. At game end all cards are revealed to everyone for the Review.
- Online games don't count toward "Your wins".
- Browser Back: closes an open sheet first, then returns to the previous tab (history entries per tab and sheet).
- Design pass: the stage gets the space on phone (log shrinks), the stage glows blue whenever the move is yours (CSS `:has()`), game over shows the winner big and orange with the dead action grid hidden (kept in place), hand cards 78x109 on phone when there are 3 or fewer opponents, card subtitles hidden on small cards, laptop setup is wider with bigger fan cards, table setup fits 393px without scrolling, `.btn.small` 40px, `?` has a 42px hit area.
- Sound & effects section sits between Variants and Your record in Settings; win confetti uses the winner's character colours plus orange/blue/white; "big" moments = you catch a bluff, or your challenged claim holds.
- Table "Your 2 cards": tapping the same card twice picks a pair; at 5-6 players the player grid goes 3 across so Undo stays on screen.

## NOT verified
- Real iPhone Safari (only WebKit headless at 393px). The design pass relies on CSS `:has()` (Safari 15.4+).
- How the sounds actually sound and how loud they are on a phone (tests use a fake AudioContext; nobody has listened). Online sounds from other players' moves: same code path as local (snapshot events), but not run in a two-browser test.
- With 4-5 opponents on phone, a speech bubble on a second-row opponent covers that opponent's name for a moment (from before the design pass; left alone).
- Online with 3+ real people; host vanishing mid-game (handover is online.js's job, tested there).
- Hard is only even with Medium head-to-head (tried 6 setting tweaks, all 46-54%); it's clearly best three-way and vs Easy.
- A local game once stalled on a computer's turn with no error (desktop UI run, 2026-10-20, machine at 100% CPU from other agents). Root cause not found; a 3-second safety net now restarts the game loop (logs "game loop restarted" as a console warning, `window.__coup.revived` counts it).
- After a friend reloads mid-game, online.js shows them "The server said no — you may not be in this room any more." once, though they rejoin and play on fine. That's in the shared `_online/online.js` (not ours to edit).
- Rule edge: 2-player-variant coin split (GameRules says both 1 coin).

## Rejected / parked
- ~~Win-probability meter~~ heavy on phone; claim odds answer the real question.
- ~~Reformation/Anarchy expansions~~ separate rule sets.
- ~~"Call it" trainer~~ parked; overlaps Review.
