# Coup — chat log

## 2026-10-19 — first build + phase 2 (builder agent)
- **Asked:** build Coup (vs computer with measured levels, odds on every claim, hint + study review, real-table companion), then phase 2: exact rules + variants, online seats, ideas, art, design, QA.
- **Built:** engine (base, Inquisitor, 2-player deal), Bayesian odds, three computer levels, Play/Table/Learn/Settings, original SVG art (art sub-agent), online rooms via shared online.js, `data/stats.json` simulations, `docs/rules-check.md` (research sub-agent), `docs/ideas.md`.
- **Verified:** node tests (engine 24, odds 9, table 4, online 6, ai strength); each suite failed once against a deliberately broken engine/odds/table/adapter then passed restored; WebKit UI runs playing whole games at 393px and 1280px with zero console errors; two-browser online game to the end incl. friend reload; live check of commit a7dba41.
- **Open:** QA sub-agent findings; Tim's phone check.
