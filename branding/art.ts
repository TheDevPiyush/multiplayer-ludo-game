/**
 * The in-app dice and pawn drawn as plain SVG: a port of app/components/ludo/Dice.tsx
 * (Dice3D) and Token.tsx (Pawn). Used by the logo and the store graphics; keep it in
 * step when the in-app art changes.
 */

// ─── Colours (app/components/ludo/geometry.ts, LudoBackground.tsx) ─────────────

export const HEX = { RED: '#FF3B4E', BLUE: '#2E86FF', GREEN: '#14C46B', YELLOW: '#FFC21A' };
export const BRIGHT = { RED: '#FF8A94', BLUE: '#8CC2FF', GREEN: '#6FF0A8', YELLOW: '#FFE27A' };
export const DARK = { RED: '#B0122A', BLUE: '#1450C8', GREEN: '#07824A', YELLOW: '#D08A00' };
export const BG_TOP = '#2F5BFF';
export const BG_MID = '#4B3BF2';
export const BG_BOTTOM = '#6A2BD8';

// ─── Dice (Dice3D) ────────────────────────────────────────────────────────────

export type Vec = [number, number, number];
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
export const f2 = (n: number) => +n.toFixed(3);

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
export function dice(value: number, size: number, color: string, tilt: Vec): string {
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
            `<circle cx="${x}" cy="${y + 0.012}" r="0.092" fill="rgba(0,0,0,0.2)"/><circle cx="${x}" cy="${y}" r="0.088" fill="url(#pip-${color.slice(1)})"/>`).join('');
        return `<g transform="matrix(${matrix})"><rect x="0.015" y="0.015" width="0.97" height="0.97" rx="0.17" fill="#FFFFFF"/>${pips}`
            + `<rect x="0.015" y="0.015" width="0.97" height="0.97" rx="0.17" fill="${SHADE}" opacity="${f2(0.32 * (1 - light))}"/></g>`;
    }).join('');
    return `<defs><radialGradient id="pip-${color.slice(1)}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0F172A" stop-opacity="0.9"/></radialGradient></defs>`
        + `<ellipse cx="${c}" cy="${f2(c + half * 1.55)}" rx="${f2(half * 1.25)}" ry="${f2(half * 0.2)}" fill="rgba(0,0,0,0.26)"/>`
        + `<path d="${silhouette(m, half, c)}" fill="${BODY}" stroke="${BODY}" stroke-width="${f2(size * 0.06)}" stroke-linejoin="round"/>`
        + faces;
}

// ─── Pawn (Token.tsx), drawn in its 100 × 130 artwork box ─────────────────────

export function pawn(color: keyof typeof HEX): string {
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
