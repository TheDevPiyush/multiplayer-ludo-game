import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

// ─── Tiny 3D renderer ────────────────────────────────────────────────────────
// A die is a cube with fixed pips on each face. We rotate it, keep the faces
// that point at the viewer, and draw each one as an affine-mapped unit square
// (an orthographic projection of a square is exactly a parallelogram).

type Vec = [number, number, number];
type Mat = [Vec, Vec, Vec]; // rows

/** Pip positions in face units (0..1). */
const PIPS: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.24], [0.73, 0.24], [0.27, 0.5], [0.73, 0.5], [0.27, 0.76], [0.73, 0.76]],
};

/**
 * Faces of a standard die (opposites sum to 7). `a` / `b` are the face's
 * right / down directions when that face is turned towards the viewer.
 */
const FACES: { value: number; n: Vec; a: Vec; b: Vec }[] = [
    { value: 1, n: [0, 0, 1], a: [1, 0, 0], b: [0, -1, 0] },
    { value: 6, n: [0, 0, -1], a: [-1, 0, 0], b: [0, -1, 0] },
    { value: 3, n: [1, 0, 0], a: [0, 0, -1], b: [0, -1, 0] },
    { value: 4, n: [-1, 0, 0], a: [0, 0, 1], b: [0, -1, 0] },
    { value: 2, n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, 1] },
    { value: 5, n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, -1] },
];

/** Euler angles (degrees, applied X → Y → Z) that turn each value towards the viewer. */
const FACE_UP: Record<number, Vec> = {
    1: [0, 0, 0],
    6: [0, 180, 0],
    3: [0, -90, 0],
    4: [0, 90, 0],
    2: [90, 0, 0],
    5: [-90, 0, 0],
};

/** Resting tilt so a face-up die still shows a sliver of its top and side. */
const REST_TILT: Vec = [-9, 11, 0];

const LIGHT: Vec = (() => {
    const l: Vec = [-0.45, 0.6, 0.66];
    const m = Math.hypot(...l);
    return [l[0] / m, l[1] / m, l[2] / m];
})();

const rad = (d: number) => (d * Math.PI) / 180;

function mul(a: Mat, b: Mat): Mat {
    const r: Mat = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            r[i]![j] = a[i]![0] * b[0]![j]! + a[i]![1] * b[1]![j]! + a[i]![2] * b[2]![j]!;
        }
    }
    return r;
}

function rotX(d: number): Mat {
    const c = Math.cos(rad(d)), s = Math.sin(rad(d));
    return [[1, 0, 0], [0, c, -s], [0, s, c]];
}
function rotY(d: number): Mat {
    const c = Math.cos(rad(d)), s = Math.sin(rad(d));
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}
function rotZ(d: number): Mat {
    const c = Math.cos(rad(d)), s = Math.sin(rad(d));
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

function apply(m: Mat, v: Vec): Vec {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

/** Full orientation: rest tilt applied on top of the die's own rotation. */
function orientation(angles: Vec, tilt: Vec): Mat {
    const own = mul(rotZ(angles[2]), mul(rotY(angles[1]), rotX(angles[0])));
    return mul(mul(rotY(tilt[1]), rotX(tilt[0])), own);
}

/** Convex hull (monotone chain) — the die's silhouette, drawn as its bevel. */
function hull(points: [number, number][]): [number, number][] {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const build = (pts: [number, number][]) => {
        const out: [number, number][] = [];
        for (const pt of pts) {
            while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, pt) <= 0) out.pop();
            out.push(pt);
        }
        return out;
    };
    const lower = build(p);
    const upper = build([...p].reverse());
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const CORNERS: Vec[] = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z] as Vec)));

/**
 * A die rendered in true 3D for the given rotation. Without `angles` it rests
 * with `value` facing up (towards the viewer).
 */
export function Dice3D({
    value,
    size,
    color,
    angles,
    tilt = REST_TILT,
}: {
    value: number;
    size: number;
    color: string;
    angles?: Vec;
    tilt?: Vec;
}) {
    const v = Math.min(6, Math.max(1, Math.round(value)));
    const m = orientation(angles ?? FACE_UP[v]!, tilt);
    const half = size * 0.3; // cube half-edge in px; any rotation still fits the box
    const c = size / 2;
    const toScreen = (p: Vec): [number, number] => [c + p[0] * half, c - p[1] * half];

    const silhouette = hull(CORNERS.map(p => toScreen(apply(m, p))));

    const faces = FACES.map(f => {
        const n = apply(m, f.n);
        if (n[2] <= 0.02) return null; // facing away from the viewer
        const a = apply(m, f.a);
        const b = apply(m, f.b);
        // Unit square (u, w) → screen: centre + (2u−1)·a + (2w−1)·b, with y flipped.
        const ax = a[0] * half, ay = -a[1] * half;
        const bx = b[0] * half, by = -b[1] * half;
        const [cx, cy] = toScreen(n);
        const matrix = `matrix(${2 * ax} ${2 * ay} ${2 * bx} ${2 * by} ${cx - ax - bx} ${cy - ay - by})`;
        const light = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        const g = Math.round(255 * (0.7 + 0.3 * light));
        return { value: f.value, matrix, fill: `rgb(${g},${g},${Math.min(255, g + 6)})`, depth: n[2] };
    })
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .sort((x, y) => x.depth - y.depth);

    return (
        <Svg width={size} height={size * 1.08}>
            <Defs>
                <RadialGradient id="pip" cx="35%" cy="30%" r="75%">
                    <Stop offset="0" stopColor={color} />
                    <Stop offset="1" stopColor="#0F172A" stopOpacity={0.9} />
                </RadialGradient>
            </Defs>
            <Ellipse cx={c} cy={c + half * 1.55} rx={half * 1.25} ry={half * 0.2} fill="rgba(0,0,0,0.26)" />
            <Polygon
                points={silhouette.map(p => p.join(',')).join(' ')}
                fill="#A9AFC4"
                stroke="#A9AFC4"
                strokeWidth={size * 0.06}
                strokeLinejoin="round"
            />
            {faces.map(f => (
                <G key={f.value} transform={f.matrix}>
                    <Rect x={0.015} y={0.015} width={0.97} height={0.97} rx={0.17} fill={f.fill} />
                    {(PIPS[f.value] ?? []).map(([x, y], i) => (
                        <G key={i}>
                            <Circle cx={x} cy={y + 0.012} r={0.092} fill="rgba(0,0,0,0.2)" />
                            <Circle cx={x} cy={y} r={0.088} fill="url(#pip)" />
                        </G>
                    ))}
                </G>
            ))}
        </Svg>
    );
}

// ─── Rolling die ─────────────────────────────────────────────────────────────

/** Degrees per second while tumbling, per axis. */
const SPIN: Vec = [760, 560, 220];
const SETTLE_MS = 520;

const easeOutBack = (t: number) => {
    const c1 = 1.2;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Smallest angle ≥ `from + minTravel` that is congruent to `target` (mod 360). */
function forwardTo(from: number, target: number, minTravel: number): number {
    return target + 360 * Math.ceil((from + minTravel - target) / 360);
}

/**
 * Tappable die that really rotates: it tumbles while `rolling`, then rolls on
 * to land with `value` facing up. Pulses a halo when waiting for a tap.
 */
export function RollingDice({
    value,
    rolling,
    color,
    size = 68,
    waiting,
    disabled,
    onPress,
}: {
    value: number;
    rolling: boolean;
    color: string;
    size?: number;
    /** Pulse the halo (the local player should roll). */
    waiting?: boolean;
    disabled?: boolean;
    onPress?: () => void;
}) {
    const [angles, setAngles] = useState<Vec>(() => FACE_UP[value] ?? [0, 0, 0]);
    const anglesRef = useRef<Vec>(angles);
    const tumbled = useRef(false);
    const frame = useRef<number | null>(null);
    const lift = useSharedValue(0);
    const squash = useSharedValue(1);
    const halo = useSharedValue(0);

    const set = (a: Vec) => {
        anglesRef.current = a;
        setAngles(a);
    };

    // Tumble while rolling, then roll on to land on the result.
    useEffect(() => {
        const cancel = () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
        };
        cancel();
        const goal = FACE_UP[value] ?? [0, 0, 0];

        if (rolling) {
            tumbled.current = true;
            let last = performance.now();
            const tick = (now: number) => {
                const dt = Math.min(48, now - last) / 1000;
                last = now;
                const a = anglesRef.current;
                set([a[0] + SPIN[0] * dt, a[1] + SPIN[1] * dt, a[2] + SPIN[2] * dt]);
                frame.current = requestAnimationFrame(tick);
            };
            frame.current = requestAnimationFrame(tick);
            return cancel;
        }

        if (!tumbled.current) {
            // Value changed without a roll (e.g. resync): just show it.
            set(goal);
            return cancel;
        }
        tumbled.current = false;

        const from = anglesRef.current;
        // Keep turning forward (at least a quarter turn) so it lands instead of snapping back.
        const to: Vec = [forwardTo(from[0], goal[0], 90), forwardTo(from[1], goal[1], 90), forwardTo(from[2], goal[2], 0)];
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / SETTLE_MS);
            const k = easeOutBack(t);
            if (t < 1) {
                set([from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k]);
                frame.current = requestAnimationFrame(tick);
            } else {
                set(goal); // normalised, so angles never grow without bound
            }
        };
        frame.current = requestAnimationFrame(tick);
        return cancel;
    }, [rolling, value]);

    // Hop while tumbling, squash on landing.
    useEffect(() => {
        if (rolling) {
            lift.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 190, easing: Easing.out(Easing.quad) }),
                    withTiming(0.15, { duration: 190, easing: Easing.in(Easing.quad) }),
                ),
                -1,
            );
        } else {
            cancelAnimation(lift);
            lift.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
            squash.value = withSequence(
                withTiming(1, { duration: 140 }),
                withTiming(0.86, { duration: 70 }),
                withSpring(1, { damping: 6, stiffness: 260 }),
            );
        }
    }, [rolling]);

    useEffect(() => {
        if (waiting && !rolling) {
            halo.value = withRepeat(
                withSequence(withTiming(1, { duration: 700 }), withTiming(0.25, { duration: 700 })),
                -1,
            );
        } else {
            cancelAnimation(halo);
            halo.value = withTiming(0, { duration: 150 });
        }
    }, [waiting, rolling]);

    const diceStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: -lift.value * size * 0.3 },
            { scaleX: 2 - squash.value },
            { scaleY: squash.value },
        ],
    }));
    const haloStyle = useAnimatedStyle(() => ({
        opacity: halo.value * 0.55,
        transform: [{ scale: 1 + halo.value * 0.18 }],
    }));

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            hitSlop={10}
            style={{ width: size * 1.35, height: size * 1.35, alignItems: 'center', justifyContent: 'center' }}
        >
            <Animated.View
                pointerEvents="none"
                style={[styles.halo, { width: size * 1.25, height: size * 1.25, borderRadius: size * 0.625, backgroundColor: color }, haloStyle]}
            />
            <Animated.View style={diceStyle}>
                <Dice3D value={value} size={size} color={color} angles={angles} />
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    halo: { position: 'absolute' },
});
