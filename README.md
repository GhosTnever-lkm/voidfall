<div align="center">

# ◈ VOIDFALL

### LAST SIGNAL

**An offline-ready sci-fi arena roguelite. Survive the waves. Shape the build. Hold the line.**

[▶ Play in browser](https://GhosTnever-lkm.github.io/voidfall/) · [Windows download](https://github.com/GhosTnever-lkm/voidfall/releases/latest) · [Русский](#русский)

</div>

You are the last pilot inside a collapsing sector. Each run is a compact fight for survival: clear escalating enemy waves, collect energy, draft upgrades, complete three rotating contracts, then spend earned essence on permanent ship relics. A named boss arrives every fifth wave.

VOIDFALL runs as a static browser game. It needs no account, backend, external game engine, or install step. Once the page has loaded, the app shell and game are available offline in browsers that support service workers. Career progress is stored in that browser's local storage.

## Play

Open the [live game](https://GhosTnever-lkm.github.io/voidfall/) in a modern desktop browser and select **Начать миссию**. On Windows, you can instead download and extract the portable release, install [Node.js](https://nodejs.org/), then double-click `start-game.bat`.

The GitHub Pages link may take a few minutes to activate after the first deployment. If it is not live yet, use the Windows download or run from source below.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` or arrow keys | Move the pilot |
| Mouse | Aim |
| Hold left mouse button | Fire at the aim direction |
| `Shift` | Dash with brief invulnerability |
| `Q` | Phase shift toward the pointer |
| `E` | Void Nova: area damage and knockback |
| `R` | Time Fold: slow enemies and enemy shots |
| `Esc` | Pause / resume |

The three tactical abilities also have clickable HUD buttons. Sound starts muted; use the music-note button to enable it after the page opens.

## What is in the game

- **Endless escalating waves:** new enemy archetypes and attack patterns join as the run advances; elite variants add pressure.
- **Boss encounters:** a named boss enters on every fifth wave with a dedicated attack pattern and health bar.
- **Build choices:** level-ups offer three choices from 16 run upgrades spanning damage, fire rate, projectiles, critical hits, armor, health, movement, recovery, and energy collection.
- **Tactical abilities:** dash, Phase Shift, Void Nova, and Time Fold create different ways to escape or control a crowded arena.
- **Rotating contracts:** each run asks you to hunt enemies, gather energy, and survive. Each contract pays its XP once, then stays marked complete.
- **Persistent career:** runs grant essence and update your best wave/score. Spend essence in the armory on five permanent relics.
- **Offline-ready app shell:** install the page from a supported browser and launch it like an app. Audio is synthesized locally; no media download is needed.
- **Responsive controls and HUD:** the desktop layout keeps the arena and mission data visible; a compact layout adapts to smaller screens.

## Tests

Run the contract regression suite with Node.js 18 or newer:

```powershell
npm test
```

## Run from source

Requirements: Node.js 18 or newer. No package install is required.

```powershell
git clone https://github.com/GhosTnever-lkm/voidfall.git
cd voidfall
npm start
```

Or double-click `start-game.bat`. The local server binds only to `127.0.0.1:8765`.

## Progress and privacy

- No accounts, telemetry, analytics, online leaderboard, or network API.
- Career profile and relic purchases live in the browser's `localStorage` under `voidfall.profile.v1`.
- Clearing browser data clears local progression. Use the same browser profile to keep the save.
- During play, no external request is needed for game logic or audio. Google Fonts are optional visual enhancement; system fonts are the fallback.
- The game does not read files from your computer or modify other software.

## Project status

VOIDFALL is a single-player browser game, version 1.0.2. It has not been tuned against a broad player cohort. Enemies and upgrades are designed for readable arcade runs, but balance will change as play feedback comes in. The initial UI language is Russian.

## ☕ Support

The game is free and open source under the MIT license. Follow development or support the author on [Boosty](https://boosty.to/azizazimov).

If you send a contribution to a public wallet, use only the matching asset on its matching network:

- Bitcoin: `bc1qn75pj4n7gyl2k5kf2f97elvyenz52q6nn2g30u`
- TRON: `TCBSy38X57hA6w2onJcxom24x1febc1mP1`
- BNB Smart Chain: `0xD431a917961E0b086B96D9F72b5C8fF19b19068a`

## Русский

**VOIDFALL: Last Signal** — браузерный космический roguelite. Переживай бесконечные волны, собирай энергию, выбирай улучшения и побеждай боссов каждой пятой волны. За задания забега выдаётся опыт, а за результат — эссенция для постоянных реликвий корабля.

Открой [игру в браузере](https://GhosTnever-lkm.github.io/voidfall/) или скачай архив для Windows в разделе [Releases](https://github.com/GhosTnever-lkm/voidfall/releases). Для запуска из исходников установи Node.js и запусти `npm start` либо `start-game.bat`.

Управление: `WASD`/стрелки — движение, мышь — прицел, зажатая левая кнопка — стрельба, `Shift` — рывок, `Q` — фазовый сдвиг, `E` — Всплеск Бездны, `R` — Складка времени, `Esc` — пауза. Три способности доступны и кнопками в HUD.

Профиль и покупки сохраняются локально в браузере. Сетевые аккаунты и серверы не используются. Игра не анализирует файлы компьютера и не меняет другие программы.

## License

MIT. See [LICENSE](LICENSE).
