# Coup (project rules for Claude)

**What:** Coup card game site. Play vs 1–5 computers (Easy/Medium/Hard, measured), online rooms with friends + computers (shared `online.js`, Firebase `th-board-games`), live odds that each claim is true, Hint, study mode, Review after each game, and a real-table companion. Static GitHub Pages, $0, no build step.

- Live: https://timothyhadfield.github.io/coup/ · Repo: https://github.com/TimothyHadfield/coup (public)
- Read `progress.md` first (state, traps, decisions, NOT verified).

## Files
- `js/engine.js` pure rules engine (`newGame`, `act` in place, `apply` pure, `viewFor(state, seat)` hides `_` fields). `js/odds.js` Bayesian card odds. `js/ai.js` computer players. `js/table.js` real-table companion (turn log -> derived state). `js/coupgame.js` engine wrapped in the online.js interface. `js/online.js` copied **unchanged** from `Board and Card Games/_online/` (never edit here; recopy). `js/art.js` original SVG card art. `js/app.js` all screens.
- `data/stats.json` made by `node tools/hands.js` (~10 min, 15 parallel parts). `tools/sim.js` matchups, `tools/diag.js` behaviour counts.
- `docs/rules-check.md` rules with sources; `docs/ideas.md` ideas Build/Skip.

## How to test
- Node: `node tests/engine.test.js`, `odds.test.js`, `table.test.js`, `node tests/online.test.mjs` (~3 min), `ai.test.js` (slow, strength asserts).
- Browser (WebKit, headless): serve the folder (`python -m http.server 18473 --bind 127.0.0.1`, background), then `node tests/ui.play.mjs <url> 2 <outDir>` (+ `--desktop`) plays whole games by tapping; `node tests/ui.online.mjs <url> <outDir>` runs two browsers in one real online room (uses a little of the shared free quota).
- Sound & effects: `node tests/ui.fx.mjs <url> <outDir>` (3 short games: all on, Sound off, Animations off).
- Weird situations: `node tests/ui.edge.mjs <url> <outDir> [ids]` (41 checks: odd sizes, double taps, reloads, two tabs, offline online; one check briefly makes a real online room).
- Bump `?v=N` on every script/style in `index.html` and `js/build.js` when shipping.
