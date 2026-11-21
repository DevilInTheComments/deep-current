# Deep Current — Pisces

A daily Pisces cosmic companion. One theme a day, moon phase, Pisces deep dive,
compatibility, and frozen saved-day snapshots. Built to blueprint v3.

- **$0, offline, no APIs, no accounts, no tracking.** Everything runs on-device.
- Static site: `index.html` + `styles.css` + `app.js` + `content/` JSON + `icons/`.
- Add to Home Screen: the PWA manifest and `apple-touch-icon` are set so iOS
  shows **Deep Current** with the two-fish mark — no wrapper branding.

## Structure

- `index.html` — all five tabs (Today, Moon, Pisces, Matches, You). Includes an
  embedded copy of the content JSON as a fallback if the files cannot be
  fetched (offline / file://); the fetch of `content/*.json` is tried first so
  content updates flow without rebuilding the page.
- `content/themes.json` — 30 theme bundles (`contentVersion: 1`).
- `content/signs/pisces.json` — sign data, compatibility, moon meanings, profile.
- `app.js` — date-seeded theme selection, salted lucky numbers, timestamp-based
  moon math, geometric moon canvas, frozen snapshots in localStorage, midnight
  refresh (startup / foreground / 30s timer — no background promise).
- `manifest.webmanifest`, `icons/icon-180.png` (apple-touch-icon), `icon-192.png`,
  `icon-512.png`.

## Fonts

System stacks only (Georgia serif for display, system sans for body) — no
webfont downloads, so the app works fully offline. The blueprint suggested
Fraunces/Cormorant; the offline requirement wins.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

## Tests

```sh
node tests/test.js
```

Covers moon math against known full/new moons, seeded theme stability,
lucky-number rules, and snapshot immutability (save, then edit the content
bank, confirm the snapshot is unchanged).

## Deploy

GitHub Pages from `main` (static site, no build step). Repo:
DevilInTheComments/deep-current.
