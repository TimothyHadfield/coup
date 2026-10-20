# Coup — progress

## START HERE
Read this, then `CLAUDE.md`, then `docs/rules-check.md`. Last updated: 2026-10-20 (QA fixes, browser Back, bot loop fix).

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
| Live | https://timothyhadfield.github.io/coup/ |

**Measured strength** (`data/stats.json`, `node tools/hands.js`, 2026-10-20 after the loop fix, seats rotated): Hard vs Easy 83% (1000 games), Medium vs Easy 74%, Hard vs Medium 47/53 (a 2000-game recheck gave 51/49: head-to-head they're even), three-way Easy/Medium/Hard 11/33/55% (900 games). Seat data: first player 47% (2p), 35% (3p, fair 33%), 25% (4p), 25% (5p), 19% (6p). Avg turns 2p 12 · 4p 35 · 6p 57. Best start: Duke+Duke 70% in 3p Hard games; worst Captain+Contessa 20%.

## Standing instructions (Tim's words)
- "build regular play online with a computer or other online players for all the games and their common varients that match exactly the play of the in-person game."
- "Make sure to get everything right like rules and artwork and specific numbers of cards, routes, details, etc."
- "Really work on the webdesign of the games, aswell as art, fitting it with an iphone and computer"
- Hub dark tokens, phone-first, no page scroll on main screens, ? explains why, choices live in Settings. $0.

## Traps
- `js/online.js` is a copy of `../_online/online.js`; don't edit it here.
- Python writes on Windows can turn `\b` in a string into a real backspace char; edit JS with the Edit tool or byte-safe scripts.
- UI tests must re-query after each tap (snapshots redraw the DOM); clicking stale handles throws "not attached".
- WebKit logs a page error when a reload cuts Firestore's long-poll; `ui.online.mjs` filters only that.
- Game ends the moment one player is left (the winner's last action may not pay out) — table test compares coins at turn starts.
- Port 8731 belonged to another agent's server; use 18473.
- Two WebKit pages in one test run: Playwright's "wait until stable" hangs (animation frames throttled), so `ui.online.mjs` taps with `force` and polls `waitForFunction` every 500 ms. That, not the app, was the "online game stalls" flake (measured 2026-10-20: 30-80 stuck taps per run, no move ever sent).
- `window.__coup.netLog` keeps the last 30 online snapshots/moves; the online test dumps it when stuck.
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
- Table "Your 2 cards": tapping the same card twice picks a pair; at 5-6 players the player grid goes 3 across so Undo stays on screen.

## NOT verified
- Real iPhone Safari (only WebKit headless at 393px).
- Online with 3+ real people; host vanishing mid-game (handover is online.js's job, tested there).
- Hard is only even with Medium head-to-head (tried 6 setting tweaks, all 46-54%); it's clearly best three-way and vs Easy.
- A local game once stalled on a computer's turn with no error (desktop UI run, 2026-10-20, machine at 100% CPU from other agents). Root cause not found; a 3-second safety net now restarts the game loop (logs "game loop restarted" as a console warning, `window.__coup.revived` counts it).
- After a friend reloads mid-game, online.js shows them "The server said no — you may not be in this room any more." once, though they rejoin and play on fine. That's in the shared `_online/online.js` (not ours to edit).
- Rule edge: 2-player-variant coin split (GameRules says both 1 coin).

## Rejected / parked
- ~~Win-probability meter~~ heavy on phone; claim odds answer the real question.
- ~~Reformation/Anarchy expansions~~ separate rule sets.
- ~~"Call it" trainer~~ parked; overlaps Review.
