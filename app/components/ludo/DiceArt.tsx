import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { diceSkinOf } from '@/components/cosmetics/items';

// The die's drawing, kept apart from the rolling animation (Dice.tsx) so it can be drawn
// anywhere, including to the shop's preview images outside the app.

// ─── Tiny 3D renderer ────────────────────────────────────────────────────────
// A die is a cube with fixed pips on each face. We rotate it, hide the faces
// that point away, and draw each visible face as an affine-mapped unit square
// (an orthographic projection of a square is exactly a parallelogram). A cube is
// convex, so visible faces never overlap — no depth sorting needed.
//
// Every pose is drawn once, as a static SVG. The rolling die never redraws an
// SVG while it moves (see RollingDice): that is what made it drop frames on
// low-end Android, where each animated SVG prop re-rasterises the whole die.

export type Vec = [number, number, number];
export type Mat = [Vec, Vec, Vec]; // rows

/** Pip positions in face units (0..1). */
const PIPS: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.24], [0.73, 0.24], [0.27, 0.5], [0.73, 0.5], [0.27, 0.76], [0.73, 0.76]],
};

export type Face = { value: number; n: Vec; a: Vec; b: Vec };

/**
 * Faces of a standard die (opposites sum to 7). `a` / `b` are the face's
 * right / down directions when that face is turned towards the viewer.
 */
const FACES: Face[] = [
    { value: 1, n: [0, 0, 1], a: [1, 0, 0], b: [0, -1, 0] },
    { value: 6, n: [0, 0, -1], a: [-1, 0, 0], b: [0, -1, 0] },
    { value: 3, n: [1, 0, 0], a: [0, 0, -1], b: [0, -1, 0] },
    { value: 4, n: [-1, 0, 0], a: [0, 0, 1], b: [0, -1, 0] },
    { value: 2, n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, 1] },
    { value: 5, n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, -1] },
];

/** Euler angles (degrees, applied X → Y → Z) that turn each value towards the viewer. */
export const FACE_UP: Record<number, Vec> = {
    1: [0, 0, 0],
    6: [0, 180, 0],
    3: [0, -90, 0],
    4: [0, 90, 0],
    2: [90, 0, 0],
    5: [-90, 0, 0],
};

/** Resting tilt so a face-up die still shows a sliver of its top and side. */
export const REST_TILT: Vec = [-9, 11, 0];

const LIGHT: Vec = [-0.4877, 0.6503, 0.5826]; // normalised (-0.45, 0.6, 0.66)

const CORNERS: Vec[] = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z] as Vec)));

export function orientation(ax: number, ay: number, az: number, tilt: Vec): Mat {
    const r = (d: number) => (d * Math.PI) / 180;
    const mul = (p: Mat, q: Mat): Mat => {
        const o: Mat = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                o[i]![j] = p[i]![0] * q[0]![j]! + p[i]![1] * q[1]![j]! + p[i]![2] * q[2]![j]!;
            }
        }
        return o;
    };
    const rx = (d: number): Mat => {
        const c = Math.cos(r(d)), s = Math.sin(r(d));
        return [[1, 0, 0], [0, c, -s], [0, s, c]];
    };
    const ry = (d: number): Mat => {
        const c = Math.cos(r(d)), s = Math.sin(r(d));
        return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    };
    const rz = (d: number): Mat => {
        const c = Math.cos(r(d)), s = Math.sin(r(d));
        return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
    };
    const own = mul(rz(az), mul(ry(ay), rx(ax)));
    return mul(mul(ry(tilt[1]), rx(tilt[0])), own);
}

export function apply(m: Mat, v: Vec): Vec {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

/** Screen-space matrix, visibility and shading for one face. */
function faceProps(m: Mat, face: Face, half: number, c: number) {
    const n = apply(m, face.n);
    const a = apply(m, face.a);
    const b = apply(m, face.b);
    // Unit square (u, w) → screen: centre + (2u−1)·a + (2w−1)·b, with y flipped.
    const ax = a[0] * half, ay = -a[1] * half;
    const bx = b[0] * half, by = -b[1] * half;
    const cx = c + n[0] * half, cy = c - n[1] * half;
    const light = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    return {
        matrix: [2 * ax, 2 * ay, 2 * bx, 2 * by, cx - ax - bx, cy - ay - by],
        visible: n[2] > 0.02,
        shade: 0.32 * (1 - light), // 0 = fully lit
    };
}

/** Outline of the rotated cube (convex hull, monotone chain) as an SVG path. */
function silhouette(m: Mat, half: number, c: number): string {
    const pts: [number, number][] = [];
    for (let i = 0; i < CORNERS.length; i++) {
        const p = apply(m, CORNERS[i]!);
        pts.push([c + p[0] * half, c - p[1] * half]);
    }
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o: [number, number], p: [number, number], q: [number, number]) =>
        (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const lower: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, pts[i]!) <= 0) lower.pop();
        lower.push(pts[i]!);
    }
    const upper: [number, number][] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, pts[i]!) <= 0) upper.pop();
        upper.push(pts[i]!);
    }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    let d = '';
    for (let i = 0; i < hull.length; i++) d += `${i === 0 ? 'M' : 'L'}${hull[i]![0].toFixed(2)} ${hull[i]![1].toFixed(2)}`;
    return `${d}Z`;
}

/** Gradient ids are per colour and skin, so different dice never share one (web: ids are global). */
const pipId = (color: string, skin?: string | null) => `pip-${color.replace(/[^a-zA-Z0-9]/g, '')}-${(skin ?? '').replace(/[^a-zA-Z0-9]/g, '')}`;
const faceId = (skin?: string | null) => `face-${(skin ?? 'classic').replace(/[^a-zA-Z0-9]/g, '')}`;

function FaceArt({ value, pip, skin }: { value: number; pip: string; skin?: string | null }) {
    const look = diceSkinOf(skin);
    return (
        <>
            <Rect x={0.015} y={0.015} width={0.97} height={0.97} rx={0.17} fill={look.face[0] === look.face[1] ? look.face[0] : `url(#${faceId(skin)})`} />
            {look.grain && (
                <Path d="M0.08,0.3 C0.35,0.22 0.6,0.38 0.92,0.28 M0.08,0.72 C0.4,0.64 0.62,0.8 0.92,0.7" stroke={look.grain} strokeWidth={0.025} fill="none" />
            )}
            {(PIPS[value] ?? []).map(([x, y], i) => (
                <G key={i}>
                    <Circle cx={x} cy={y + 0.012} r={0.092} fill="rgba(0,0,0,0.2)" />
                    <Circle cx={x} cy={y} r={0.088} fill={`url(#${pip})`} />
                </G>
            ))}
        </>
    );
}

export function DiceDefs({ color, skin }: { color: string; skin?: string | null }) {
    const look = diceSkinOf(skin);
    return (
        <Defs>
            <RadialGradient id={pipId(color, skin)} cx="35%" cy="30%" r="75%">
                <Stop offset="0" stopColor={look.pip ?? color} />
                <Stop offset="1" stopColor="#0F172A" stopOpacity={look.pip ? 0.45 : 0.9} />
            </RadialGradient>
            <LinearGradient id={faceId(skin)} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={look.face[0]} />
                <Stop offset="1" stopColor={look.face[1]} />
            </LinearGradient>
        </Defs>
    );
}

/** Outline + visible faces of a die in pose `m`, centred on (c, c). */
export function DieShape({ m, size, c, color, skin }: { m: Mat; size: number; c: number; color: string; skin?: string | null }) {
    const half = size * 0.3;
    const pip = pipId(color, skin);
    const look = diceSkinOf(skin);
    return (
        <>
            <Path d={silhouette(m, half, c)} fill={look.body} stroke={look.body} strokeWidth={size * 0.06} strokeLinejoin="round" />
            {FACES.map(face => {
                const f = faceProps(m, face, half, c);
                if (!f.visible) return null;
                return (
                    <G key={face.value} transform={`matrix(${f.matrix.join(' ')})`}>
                        <FaceArt value={face.value} pip={pip} skin={skin} />
                        <Rect x={0.015} y={0.015} width={0.97} height={0.97} rx={0.17} fill={look.shade} opacity={f.shade} />
                    </G>
                );
            })}
        </>
    );
}

/** A static die rendered in true 3D (used for decoration, e.g. the home hero). */
export function Dice3D({
    value,
    size,
    color,
    tilt = REST_TILT,
    skin,
}: {
    value: number;
    size: number;
    color: string;
    tilt?: Vec;
    /** Equipped dice item. */
    skin?: string | null;
}) {
    const v = Math.min(6, Math.max(1, Math.round(value)));
    const [ax, ay, az] = FACE_UP[v]!;
    const m = orientation(ax, ay, az, tilt);
    const half = size * 0.3;
    const c = size / 2;
    return (
        <Svg width={size} height={size * 1.08}>
            <DiceDefs color={color} skin={skin} />
            <Ellipse cx={c} cy={c + half * 1.55} rx={half * 1.25} ry={half * 0.2} fill="rgba(0,0,0,0.26)" />
            <DieShape m={m} size={size} c={c} color={color} skin={skin} />
        </Svg>
    );
}
