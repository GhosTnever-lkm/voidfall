# Changelog

## 1.0.9 — 2026-10-25

- Limit service-worker cache cleanup and cache reads to VOIDFALL-owned storage, preserving other apps hosted on the same origin.
- Add a regression test covering cache isolation during service-worker activation.

## 1.0.8 — 2026-10-13

- Show a persistent warning when browser storage cannot save the career profile.
- Clarify relic purchase and run results when progress exists only for the current session.
- Check storage failures without rewriting the player's profile at startup.

## 1.0.7 — 2026-10-13

- Version the offline shell cache with each app release so returning players do not keep running stale cached game files.
- Add a regression check tying the service-worker cache version to the package and HUD version.

## 1.0.6 — 2026-10-13

- Count only fully cleared waves toward career records and essence rewards; show the reached wave separately after a run ends.
- Add regression coverage for cleared waves, an active wave, and the per-run reward calculation.

## 1.0.5 — 2026-10-13

- Derive the in-game HUD version from one module and include that module in the offline app shell, preventing the displayed version from lagging behind the release.
- Add version consistency coverage and automatically attach a Windows-ready source ZIP with a SHA-256 manifest to tagged releases.

## 1.0.4 — 2026-10-11

- Add a CI workflow that runs the contract test suite (8 tests) on every push and pull request; previously the tests existed but were not run in CI.

## 1.0.3 — 2026-10-09

- Completed the MIT license text with the standard limitation-of-liability clause.

## 1.0.2 — 2026-10-08

- Added a runnable Node.js regression suite for run contracts.
- Added `npm test` and documented how to run the suite.
- Shortened the survival contract label to natural Russian UI wording.

## 1.0.1 — 2026-10-08

- Removed temporary development artifacts from the public repository.
- Kept the game code and release content unchanged.

## 1.0.0 — 2026-10-08

- First public release of VOIDFALL: Last Signal.
- Added an endless arena roguelite loop with escalating waves, varied enemy patterns, elite threats, and a boss every fifth wave.
- Added auto-fire aimed with the mouse, WASD/arrow movement, a dash, and three active abilities with separate cooldowns.
- Added 16 run upgrades, persistent local profile, five permanent relics, career records, and an in-game relic armory.
- Added three rotating run contracts for kills, crystal pickups, and survival time; each pays a one-time XP reward.
- Added responsive desktop/mobile layout, optional generated audio, offline PWA shell, and local profile storage.
- Game state and profile stay in the browser; no account or server is required.
