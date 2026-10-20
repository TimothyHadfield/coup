# Coup: ideas for data, exploration and theory

Brainstormed 2026-10-19 for Tim's phase-2 ask ("Brainstorm what additions you can do to the game with data, exploration, theory, etc."). **Build** = built and live; **Skip** = not built, with the reason.

| # | Idea | Call | Where / why |
|---|------|------|-------------|
| 1 | Live odds on every claim ("71% true") at the challenge/block decision | **Build** | Play stage box + Table tab. Exact Bayes over the unseen cards plus claim history. |
| 2 | Per-player card bars (chance each opponent holds each character) | **Build** | Bars on every opponent tile; full table on laptop. |
| 3 | Unseen-card count row (how many of each character you can't account for) | **Build** | Odds table, bottom row. |
| 4 | Hint button that says *why* (the Hard computer's reasoning) | **Build** | Play, also inside the exchange sheet. |
| 5 | Study mode: see the computers' cards while playing | **Build** | Settings switch. |
| 6 | Review after each game: final hands, every claim tagged true/bluff, your calls right/wrong/missed | **Build** | Review sheet at game end (local and online). |
| 7 | Calibration line: "odds shown averaged X% true; Y% really were" | **Build** | Review sheet. Shows whether the odds can be trusted. |
| 8 | "Bluff" tag on your own action buttons when you don't hold the card | **Build** | Action grid. |
| 9 | Best starting hands (win rate of all 15 pairs, Hard x3) | **Build** | Learn tab, from `data/stats.json` (simulated). |
| 10 | Does going first help? seat win rates for 2–6 players | **Build** | Learn tab, simulated. |
| 11 | Measured computer strength table | **Build** | Learn tab + level buttons. |
| 12 | Odds calculator (hypergeometric sliders) explaining where the numbers come from | **Build** | Learn tab. |
| 13 | Friends' bluff habits carried across real-table games (by name) | **Build** | Table tab: each name's caught/challenged rate feeds that player's odds. |
| 14 | "How much people bluff" setting that drives every number | **Build** | Settings (Rarely / Some / Often). |
| 15 | Win-probability meter during a game | Skip | Needs a big rollout per move on the phone; the claim odds already answer the real question (challenge or not). |
| 16 | Exact 2-player endgame solver | Skip | Large state space with hidden info; small payoff for most games. |
| 17 | Targeting heatmap (who the computers go after) | Skip | Interesting but not a decision aid; adds a screen. |
| 18 | Reformation / Anarchy expansion (factions, Treasury, new roles) | Skip | Separate product with its own rules; base game + Inquisitor covers the common variants. |
| 19 | "Call it" trainer: rapid-fire claims, you guess true/bluff, scored | Skip (for now) | Good, but overlaps the Review; a candidate for later if Tim wants it. |
