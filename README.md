# 3Myle Rate Desk

Mobile-friendly pallet freight rate calculator for the Mississauga and Montreal
warehouses.

## Features

- Customer-specific rate agreements and spot pricing
- LTL and FTL pallet pricing
- APPS fuel surcharge lookup with saved fallback values
- LTL fuel treatment for the configured Ontario FTL destinations
- Helper, accessorial, and market-adjustment controls
- Historical exact-lane evidence kept collapsed by default
- Static GitHub Pages deployment

## Run

```bash
npm install
npm run dev
```

Build and verify with:

```bash
npm test
```

## GitHub Pages

The live site uses the root `index.html` on the `main` branch:

```bash
npm run build
npm run build:standalone
copy outputs\github-pages\index.html index.html
```

Push `main` to update the existing public URL:
`https://anmolsahnii.github.io/rate-calculator/`.
