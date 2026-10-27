/**
 * Draws the Simple Ludo logo (the sign-in screen's 3D dice with two pawns) as SVG,
 * then renders every icon PNG the app and the website need.
 *
 *   bun branding/generate-logo.ts          (needs `rsvg-convert`, from librsvg)
 *
 * The dice and pawn drawing is a plain-SVG port of app/components/ludo/Dice.tsx
 * (Dice3D) and Token.tsx (Pawn), with the layout of FloatingDiceArt's "large" size,
 * so the icon matches what players see in the app. Keep them in step when the
 * in-app art changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const OUT = join(import.meta.dir, 'out');

// ─── Colours (app/components/ludo/geometry.ts, LudoBackground.tsx) ─────────────

const HEX = { RED: '#FF3B4E', BLUE: '#2E86FF', YELLOW: '#FFC21A' };
const BRIGHT = { RED: '#FF8A94', BLUE: '#8CC2FF', YELLOW: '#FFE27A' };
const DARK = { RED: '#B0122A', BLUE: '#1450C8', YELLOW: '#D08A00' };
const BG_TOP = '#2F5BFF';
const BG_MID = '#4B3BF2';
const BG_BOTTOM = '#6A2BD8';

// ─── Dice (Dice3D) ────────────────────────────────────────────────────────────

type Vec = [number, number, number];
type Mat = [Vec, Vec, Vec];

const PIPS: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.24], [0.73, 0.24], [0.27, 0.5], [0.73, 0.5], [0.27, 0.76], [0.73, 0.76]],
};

type Face = { value: number; n: Vec; a: Vec; b: Vec };
const FACES: Face[] = [
    { value: 1, n: [0, 0, 1], a: [1, 0, 0], b: [0, -1, 0] },
    { value: 6, n: [0, 0, -1], a: [-1, 0, 0], b: [0, -1, 0] },
    { value: 3, n: [1, 0, 0], a: [0, 0, -1], b: [0, -1, 0] },
    { value: 4, n: [-1, 0, 0], a: [0, 0, 1], b: [0, -1, 0] },
    { value: 2, n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, 1] },
    { value: 5, n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, -1] },
];
const FACE_UP: Record<number, Vec> = { 1: [0, 0, 0], 6: [0, 180, 0], 3: [0, -90, 0], 4: [0, 90, 0], 2: [90, 0, 0], 5: [-90, 0, 0] };
const LIGHT: Vec = [-0.4877, 0.6503, 0.5826];
const CORNERS: Vec[] = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z] as Vec)));
const BODY = '#A9AFC4';
const SHADE = '#1E2340';

const rad = (d: number) => (d * Math.PI) / 180;
function mul(p: Mat, q: Mat): Mat {
    return [0, 1, 2].map(i => [0, 1, 2].map(j => p[i]![0] * q[0]![j]! + p[i]![1] * q[1]![j]! + p[i]![2] * q[2]![j]!)) as Mat;
}
const rx = (d: number): Mat => [[1, 0, 0], [0, Math.cos(rad(d)), -Math.sin(rad(d))], [0, Math.sin(rad(d)), Math.cos(rad(d))]];
const ry = (d: number): Mat => [[Math.cos(rad(d)), 0, Math.sin(rad(d))], [0, 1, 0], [-Math.sin(rad(d)), 0, Math.cos(rad(d))]];
const rz = (d: number): Mat => [[Math.cos(rad(d)), -Math.sin(rad(d)), 0], [Math.sin(rad(d)), Math.cos(rad(d)), 0], [0, 0, 1]];
const apply = (m: Mat, v: Vec): Vec => [0, 1, 2].map(i => m[i]![0] * v[0] + m[i]![1] * v[1] + m[i]![2] * v[2]) as Vec;
const f2 = (n: number) => +n.toFixed(3);

function silhouette(m: Mat, half: number, c: number): string {
    const pts = CORNERS.map(p => apply(m, p)).map(p => [c + p[0] * half, c - p[1] * half] as [number, number]);
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o: number[], p: number[], q: number[]) => (p[0]! - o[0]!) * (q[1]! - o[1]!) - (p[1]! - o[1]!) * (q[0]! - o[0]!);
    const chain = (list: [number, number][]) => {
        const out: [number, number][] = [];
        for (const p of list) {
            while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
            out.push(p);
        }
        return out.slice(0, -1);
    };
    const hull = chain(pts).concat(chain([...pts].reverse()));
    return hull.map((p, i) => `${i ? 'L' : 'M'}${f2(p[0])} ${f2(p[1])}`).join('') + 'Z';
}

/** A die in a size × size·1.08 box, like Dice3D. */
function dice(value: number, size: number, color: string, tilt: Vec): string {
    const [ax, ay, az] = FACE_UP[value]!;
    const m = mul(mul(ry(tilt[1]), rx(tilt[0])), mul(rz(az), mul(ry(ay), rx(ax))));
    const half = size * 0.3;
    const c = size / 2;
    const faces = FACES.map(face => {
        const n = apply(m, face.n);
        if (n[2] <= 0.02) return '';
        const a = apply(m, face.a), b = apply(m, face.b);
        const axx = a[0] * half, ayy = -a[1] * half, bxx = b[0] * half, byy = -b[1] * half;
        const cx = c + n[0] * half, cy = c - n[1] * half;
        const light = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        const matrix = [2 * axx, 2 * ayy, 2 * bxx, 2 * byy, cx - axx - bxx, cy - ayy - byy].map(f2).join(' ');
        const pips = PIPS[face.value]!.map(([x, y]) =>
            `<circle cx="${x}" cy="${y + 0.012}" r="0.092" fill="rgba(0,0,0,0.2)"/><circle cx="${x}" cy="${y}" r="0.088" fill="url(#pip)"/>`).join('');
        return `<g transform="matrix(${matrix})"><rect x="0.015" y="0.015" width="0.97" height="0.97" rx="0.17" fill="#FFFFFF"/>${pips}`
            + `<rect x="0.015" y="0.015" width="0.97" height="0.97" rx="0.17" fill="${SHADE}" opacity="${f2(0.32 * (1 - light))}"/></g>`;
    }).join('');
    return `<defs><radialGradient id="pip" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0F172A" stop-opacity="0.9"/></radialGradient></defs>`
        + `<ellipse cx="${c}" cy="${f2(c + half * 1.55)}" rx="${f2(half * 1.25)}" ry="${f2(half * 0.2)}" fill="rgba(0,0,0,0.26)"/>`
        + `<path d="${silhouette(m, half, c)}" fill="${BODY}" stroke="${BODY}" stroke-width="${f2(size * 0.06)}" stroke-linejoin="round"/>`
        + faces;
}

// ─── Pawn (Token.tsx), drawn in its 100 × 130 artwork box ─────────────────────

function pawn(color: keyof typeof HEX): string {
    const hex = HEX[color], dark = DARK[color], bright = BRIGHT[color], id = color.toLowerCase();
    const body = 'M21,104 C27,84 38,72 40,54 L60,54 C62,72 73,84 79,104 Z';
    return `<defs>
<linearGradient id="body-${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${dark}"/><stop offset="0.38" stop-color="${bright}"/><stop offset="0.62" stop-color="${hex}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
<radialGradient id="head-${id}" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/><stop offset="0.22" stop-color="${bright}"/><stop offset="0.65" stop-color="${hex}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
<linearGradient id="base-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
</defs>
<ellipse cx="50" cy="118" rx="36" ry="9" fill="rgba(0,0,0,0.32)"/>
<ellipse cx="50" cy="109" rx="37" ry="13" fill="${dark}"/>
<ellipse cx="50" cy="104" rx="37" ry="13" fill="url(#base-${id})"/>
<path d="${body}" fill="url(#body-${id})"/>
<path d="${body}" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>
<ellipse cx="50" cy="55" rx="17" ry="6" fill="${dark}"/>
<ellipse cx="50" cy="53" rx="17" ry="6" fill="${hex}"/>
<circle cx="50" cy="33" r="23" fill="url(#head-${id})"/>
<circle cx="50" cy="33" r="23" fill="none" stroke="rgba(0,0,0,0.16)" stroke-width="1.5"/>
<ellipse cx="42" cy="24" rx="8" ry="5.5" fill="rgba(255,255,255,0.75)" transform="rotate(-25 42 24)"/>
<path d="M41,62 C40,76 34,88 29,100" stroke="rgba(255,255,255,0.45)" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;
}

// ─── Composition ─────────────────────────────────────────────────────────────

/**
 * FloatingDiceArt "large" at rest: a 200 × 168 box with the dice tilted, a blue
 * pawn behind on the right and a yellow one in front on the left.
 */
const ART_W = 200;
const ART_H = 168;
function art(): string {
    // Pulled in a little from the app's layout so the icon reads at launcher size.
    const diceSize = 100;
    return `<g transform="translate(126 72) scale(0.52)">${pawn('BLUE')}</g>`
        + `<g transform="translate(46 0) rotate(-9 50 54)">${dice(6, diceSize, HEX.RED, [-28, 34, 0])}</g>`
        + `<g transform="translate(30 78) scale(0.6)">${pawn('YELLOW')}</g>`;
}

/** The art scaled to `width` and centred on (cx, cy). */
function placedArt(width: number, cx: number, cy: number): string {
    const s = width / ART_W;
    return `<g transform="translate(${f2(cx - width / 2)} ${f2(cy - (ART_H * s) / 2)}) scale(${f2(s)})">${art()}</g>`;
}

/** The app's royal-blue → violet backdrop with its two soft glows. */
function background(size: number): string {
    return `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${BG_TOP}"/><stop offset="0.55" stop-color="${BG_MID}"/><stop offset="1" stop-color="${BG_BOTTOM}"/></linearGradient>
<radialGradient id="glowTop" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7FD3FF" stop-opacity="0.5"/><stop offset="1" stop-color="#7FD3FF" stop-opacity="0"/></radialGradient>
<radialGradient id="glowBottom" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FF5FD2" stop-opacity="0.35"/><stop offset="1" stop-color="#FF5FD2" stop-opacity="0"/></radialGradient>
<radialGradient id="spot" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.28"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${size}" height="${size}" fill="url(#bg)"/>
<circle cx="${size * 0.12}" cy="${size * 0.02}" r="${size * 0.7}" fill="url(#glowTop)"/>
<circle cx="${size * 1.02}" cy="${size * 1.0}" r="${size * 0.75}" fill="url(#glowBottom)"/>
<circle cx="${size / 2}" cy="${size * 0.5}" r="${size * 0.42}" fill="url(#spot)"/>`;
}

const svg = (w: number, h: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;

const files: Record<string, string> = {
    /** Transparent art on its own: the website's logo and the splash screen. */
    'logo-art.svg': svg(ART_W, ART_H, art()),
    /** iOS / legacy Android / store icon: full-bleed, no transparency. */
    'icon.svg': svg(1024, 1024, background(1024) + placedArt(860, 512, 520)),
    /** Android adaptive icon: launchers crop to the middle ~66%, so the art stays inside it. */
    'adaptive-icon.svg': svg(1024, 1024, background(1024) + placedArt(600, 512, 520)),
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
    ['icon.svg', 512, 512, ['web/app/icon.png']],
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
