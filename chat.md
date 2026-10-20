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
