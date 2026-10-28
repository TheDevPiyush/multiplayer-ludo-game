# Google Play graphics

`bun branding/store/generate-store.ts` renders every slide into `out/` with headless Chrome
(`google-chrome-stable`). Pass slide names to render only those (`01-hero feature-graphic`).

| File | Size | Play Console slot |
|---|---|---|
| `out/01-hero.png` … `out/06-free.png` | 1080 × 1920 | Phone screenshots, in this order |
| `out/feature-graphic.png` | 1024 × 500 | Feature graphic |

- `shots/` holds raw 1080 × 2400 emulator captures (status bar in demo mode: 9:41, full battery).
  To replace one, capture with `adb exec-out screencap -p > shots/<name>.png` and render again.
- The dice and pawns come from `../art.ts`, the same art as the app.
- Headline font: Plus Jakarta Sans ExtraBold (`fonts/`, SIL Open Font License); the rest uses the app's fonts.
