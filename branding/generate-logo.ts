/**
 * Draws the Simple Ludo logo (the sign-in screen's 3D dice with two pawns) as SVG,
 * then renders every icon PNG the app and the website need.
 *
 *   bun branding/generate-logo.ts          (needs `rsvg-convert`, from librsvg)
 *
 * The dice and pawns come from ./art (the in-app art as SVG), laid out like
 * FloatingDiceArt's "large" size, so the icon matches what players see in the app.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { BG_BOTTOM, BG_MID, BG_TOP, dice, f2, HEX, pawn } from './art';

const ROOT = join(import.meta.dir, '..');
const OUT = join(import.meta.dir, 'out');

// ─── Composition ─────────────────────────────────────────────────────────────

/**
 * FloatingDiceArt "large" at rest: a 200 × 168 box with the dice tilted, a blue
 * pawn behind on the right and a red one in front on the left.
 */
const ART_W = 200;
const ART_H = 168;
function art(): string {
    // Pulled in a little from the app's layout so the icon reads at launcher size.
    const diceSize = 100;
    return `<g transform="translate(126 72) scale(0.52)">${pawn('BLUE')}</g>`
        + `<g transform="translate(46 0) rotate(-9 50 54)">${dice(6, diceSize, HEX.RED, [-28, 34, 0])}</g>`
        + `<g transform="translate(30 78) scale(0.6)">${pawn('RED')}</g>`;
}

/** The art scaled to `width` and centred on (cx, cy). */
function placedArt(width: number, cx: number, cy: number): string {
    const s = width / ART_W;
    return `<g transform="translate(${f2(cx - width / 2)} ${f2(cy - (ART_H * s) / 2)}) scale(${f2(s)})">${art()}</g>`;
}

/** The app's royal-blue → violet backdrop, a shade deeper, so the white dice stands out. */
function background(size: number): string {
    return `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${darken(BG_TOP, ICON_DIM)}"/><stop offset="0.55" stop-color="${darken(BG_MID, ICON_DIM)}"/><stop offset="1" stop-color="${darken(BG_BOTTOM, ICON_DIM)}"/></linearGradient>
<radialGradient id="glowTop" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7FD3FF" stop-opacity="0.3"/><stop offset="1" stop-color="#7FD3FF" stop-opacity="0"/></radialGradient>
<radialGradient id="glowBottom" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FF5FD2" stop-opacity="0.22"/><stop offset="1" stop-color="#FF5FD2" stop-opacity="0"/></radialGradient>
<radialGradient id="spot" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.2"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${size}" height="${size}" fill="url(#bg)"/>
<circle cx="${size * 0.12}" cy="${size * 0.02}" r="${size * 0.7}" fill="url(#glowTop)"/>
<circle cx="${size * 1.02}" cy="${size * 1.0}" r="${size * 0.75}" fill="url(#glowBottom)"/>
<circle cx="${size / 2}" cy="${size * 0.5}" r="${size * 0.42}" fill="url(#spot)"/>`;
}

/** How much darker the icon background is than the app's (0 = same, 1 = black). */
const ICON_DIM = 0.22;
function darken(hex: string, amount: number): string {
    const n = parseInt(hex.slice(1), 16);
    const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount)).toString(16).padStart(2, '0');
    return `#${ch(16)}${ch(8)}${ch(0)}`;
}

const svg = (w: number, h: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;

/** Art width on the adaptive icon's 1024 canvas: as big as fits inside the launcher's mask. */
const ADAPTIVE_ART = 740;

const files: Record<string, string> = {
    /** Transparent art on its own: the website's logo and the splash screen. */
    'logo-art.svg': svg(ART_W, ART_H, art()),
    /** iOS / legacy Android / store icon: full-bleed, no transparency. */
    'icon.svg': svg(1024, 1024, background(1024) + placedArt(940, 512, 520)),
    /** Android adaptive icon: launchers mask to about the middle 66%; the art fills most of that. */
    'adaptive-icon.svg': svg(1024, 1024, background(1024) + placedArt(ADAPTIVE_ART, 512, 520)),
    /** Splash: transparent art on the splash background colour. */
    'splash-icon.svg': svg(1024, 1024, placedArt(900, 512, 512)),
    /** Social preview card for the website. */
    'og.svg': svg(1200, 630, background(1200).replace(`height="1200"`, `height="630"`) + placedArt(520, 600, 300)),
};

mkdirSync(OUT, { recursive: true });
for (const [name, body] of Object.entries(files)) writeFileSync(join(OUT, name), body);

/** [source svg, width, height, destinations] */
const renders: [string, number, number, string[]][] = [
    ['icon.svg', 1024, 1024, ['app/assets/images/icon.png']],
    ['adaptive-icon.svg', 1024, 1024, ['app/assets/images/adaptive-icon.png']],
    ['splash-icon.svg', 1024, 1024, ['app/assets/images/splash-icon.png']],
    ['icon.svg', 48, 48, ['app/assets/images/favicon.png']],
    ['icon.svg', 512, 512, ['web/app/icon.png', 'branding/store/out/play-icon.png']],
    ['icon.svg', 180, 180, ['web/app/apple-icon.png']],
    ['og.svg', 1200, 630, ['web/app/opengraph-image.png']],
];

for (const [src, w, h, dests] of renders) {
    for (const dest of dests) {
        const out = join(ROOT, dest);
        mkdirSync(dirname(out), { recursive: true });
        const r = Bun.spawnSync(['rsvg-convert', '-w', String(w), '-h', String(h), '-o', out, join(OUT, src)]);
        if (r.exitCode !== 0) throw new Error(`rsvg-convert failed for ${dest}: ${r.stderr.toString()}`);
        console.log(`${dest}  ${w}×${h}`);
    }
}
// The website uses the vector art directly, and the pawns on their own for the invite page.
writeFileSync(join(ROOT, 'web/public/logo-art.svg'), files['logo-art.svg']!);
for (const color of ['BLUE', 'YELLOW'] as const) {
    writeFileSync(join(ROOT, `web/public/pawn-${color.toLowerCase()}.svg`), svg(100, 130, pawn(color)));
}
