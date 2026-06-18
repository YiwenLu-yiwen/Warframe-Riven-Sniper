<p align="center">
  <img src="assets/logo.svg" alt="Warframe Riven Sniper logo" width="128" height="128">
</p>

<h1 align="center">Warframe Riven Sniper</h1>

<p align="center">
  A weapon-family Riven auction sniper with conservative Warframe.Market refresh behavior.
</p>

<p align="center">
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-43853d">
  <img alt="Version v1.1" src="https://img.shields.io/badge/version-v1.1-d6a84c">
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-d6a84c">
  <img alt="Data source Warframe Market" src="https://img.shields.io/badge/source-warframe.market-78b7bd">
  <img alt="Riven weapons 423" src="https://img.shields.io/badge/riven_weapons-423-1d1a14">
</p>

<p align="center">
  <a href="README.md"><img alt="简体中文" src="https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-78b7bd?style=for-the-badge"></a>
  <img alt="English" src="https://img.shields.io/badge/README-English-d6a84c?style=for-the-badge">
</p>

A small web app for tracking Warframe Riven auction listings by weapon family, selected positive stats, optional negative stat, seller status, price, and listing time.

The app keeps the workflow simple: create one or more Riven watches under a weapon, refresh Warframe.Market auction data conservatively, and surface matching reachable listings with a copy-ready in-game whisper.

### Features

- Tracks multiple Rivens per weapon family.
- Uses a generated catalog of Riven-capable weapon families.
- Supports English and Chinese weapon/stat display names.
- Filters market results by positive and negative Riven stats.
- Treats Warframe.Market `online` and `ingame` sellers as reachable.
- Refreshes market data with per-weapon grouping, cache reuse, and rate-limit backoff.
- Keeps local Riven watches in `data/rivens.json`, ignored by git.

### Quick Start

```bash
npm install
npm start
```

Open `http://localhost:4173`.

### Commands

| Command | Description |
| --- | --- |
| `npm start` | Start the local web server |
| `npm test` | Run the Node test suite |
| `node scripts/build-riven-weapon-catalog.mjs` | Rebuild the generated Riven weapon catalog |

### Architecture

| Path | Purpose |
| --- | --- |
| `public/index.html` | Single-page UI |
| `server/app.js` | Static file serving and JSON API routes |
| `server/market.js` | Warframe.Market auction normalization, caching, grouping, and rate-limit behavior |
| `server/riven-weapons.generated.js` | Generated weapon catalog from Warframe Wiki disposition data plus localized Warframe Status item data |
| `server/store.js` | Local Riven watch persistence in `data/rivens.json` |
| `test/server.test.js` | Catalog, API, market, refresh, and persistence tests |

### Refresh Behavior

The backend defaults to a 2-minute cache window. During refresh, it groups watches by weapon and searches each weapon once, then filters the returned auctions locally for every matching Riven watch.

Market requests are sequential and spaced by 1 second. If Warframe.Market returns `429`, the backend retries the same weapon with progressive backoff: `10s`, `20s`, then `40s`. Large force-refreshes reuse valid per-weapon cache entries instead of refreshing every tracked weapon at once.

### TODO

0. Riven evaluation: score a Riven from weapon, positive/negative stats, price range, and current market listings.
1. Online demo: deploy a read-only demo so users can try the interface without running it locally.
2. System notices: show clear notices for new online hits, price thresholds, and rate-limit waiting states.
3. Faster Warframe.Market seller contact: generate quicker seller actions and in-game whisper messages from each listing.
4. Price history: keep comparable Riven price movement for better buy decisions.
5. Cloud sync: prepare accounts, database storage, and cross-device watch synchronization for the backend server.
6. Import/export: support backup, migration, and sharing of Riven watch configs.

### Notes

- This project is not affiliated with Digital Extremes or Warframe.Market.
- Warframe and related names are trademarks of their respective owners.
- Stored Riven watches are local machine data in `data/rivens.json`, which is ignored by git.

### License

MIT. See `LICENSE`.
