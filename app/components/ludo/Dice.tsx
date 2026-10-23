import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// ─── Tiny 3D renderer ────────────────────────────────────────────────────────
// A die is a cube with fixed pips on each face. We rotate it, hide the faces
// that point away, and draw each visible face as an affine-mapped unit square
// (an orthographic projection of a square is exactly a parallelogram). A cube is
// convex, so visible faces never overlap — no depth sorting needed.
//
// All maths is plain worklet code, so the rolling die animates entirely on the
// UI thread (Reanimated animated props) without any React re-renders.

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

type Face = { value: number; n: Vec; a: Vec; b: Vec };

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

const LIGHT: Vec = [-0.4877, 0.6503, 0.5826]; // normalised (-0.45, 0.6, 0.66)

const CORNERS: Vec[] = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z] as Vec)));

function orientation(ax: number, ay: number, az: number, tilt: Vec): Mat {
    'worklet';
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

function apply(m: Mat, v: Vec): Vec {
    'worklet';
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}

/** Screen-space matrix, visibility and shading for one face. */
function faceProps(m: Mat, face: Face, half: number, c: number) {
    'worklet';
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
    'worklet';
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

const BODY = '#A9AFC4';
const SHADE = '#1E2340';

function FaceArt({ value }: { value: number }) {
    return (
        <>
            <Rect x={0.015} y={0.015} width={0.97} height={0.97} rx={0.17} fill="#FFFFFF" />
            {(PIPS[value] ?? []).map(([x, y], i) => (
                <G key={i}>
                    <Circle cx={x} cy={y + 0.012} r={0.092} fill="rgba(0,0,0,0.2)" />
                    <Circle cx={x} cy={y} r={0.088} fill="url(#pip)" />
                </G>
            ))}
        </>
    );
}

function DiceDefs({ color }: { color: string }) {
    return (
        <Defs>
            <RadialGradient id="pip" cx="35%" cy="30%" r="75%">
                <Stop offset="0" stopColor={color} />
                <Stop offset="1" stopColor="#0F172A" stopOpacity={0.9} />
            </RadialGradient>
        </Defs>
    );
}

/** A static die rendered in true 3D (used for decoration, e.g. the home hero). */
export function Dice3D({
    value,
    size,
    color,
    tilt = REST_TILT,
}: {
    value: number;
    size: number;
    color: string;
    tilt?: Vec;
}) {
    const v = Math.min(6, Math.max(1, Math.round(value)));
    const [ax, ay, az] = FACE_UP[v]!;
    const m = orientation(ax, ay, az, tilt);
    const half = size * 0.3;
    const c = size / 2;
    return (
        <Svg width={size} height={size * 1.08}>
            <DiceDefs color={color} />
            <Ellipse cx={c} cy={c + half * 1.55} rx={half * 1.25} ry={half * 0.2} fill="rgba(0,0,0,0.26)" />
            <Path d={silhouette(m, half, c)} fill={BODY} stroke={BODY} strokeWidth={size * 0.06} strokeLinejoin="round" />
            {FACES.map(face => {
                const f = faceProps(m, face, half, c);
                if (!f.visible) return null;
                return (
                    <G key={face.value} transform={`matrix(${f.matrix.join(' ')})`}>
                        <FaceArt value={face.value} />
                        <Rect x={0.015} y={0.015} width={0.97} height={0.97} rx={0.17} fill={SHADE} opacity={f.shade} />
                    </G>
                );
            })}
        </Svg>
    );
}

// ─── Rolling die (UI-thread animation) ───────────────────────────────────────

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Angles = { x: SharedValue<number>; y: SharedValue<number>; z: SharedValue<number> };

function AnimatedFace({ face, angles, half, c }: { face: Face; angles: Angles; half: number; c: number }) {
    const groupProps = useAnimatedProps(() => {
        const m = orientation(angles.x.value, angles.y.value, angles.z.value, REST_TILT);
        const f = faceProps(m, face, half, c);
        return { matrix: f.matrix, opacity: f.visible ? 1 : 0 };
    });
    const shadeProps = useAnimatedProps(() => {
        const m = orientation(angles.x.value, angles.y.value, angles.z.value, REST_TILT);
        return { opacity: faceProps(m, face, half, c).shade };
    });
    return (
        <AnimatedG animatedProps={groupProps}>
            <FaceArt value={face.value} />
            <AnimatedRect x={0.015} y={0.015} width={0.97} height={0.97} rx={0.17} fill={SHADE} animatedProps={shadeProps} />
        </AnimatedG>
    );
}

/** Degrees per second while tumbling, per axis. */
const SPIN: Vec = [760, 560, 220];
const SETTLE_MS = 560;

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
    const start = FACE_UP[value] ?? [0, 0, 0];
    const x = useSharedValue(start[0]);
    const y = useSharedValue(start[1]);
    const z = useSharedValue(start[2]);
    const tumbled = useSharedValue(false);
    const lift = useSharedValue(0);
    const squash = useSharedValue(1);
    const halo = useSharedValue(0);

    const half = size * 0.3;
    const c = size / 2;

    // Tumble while rolling, then roll on to land on the result.
    useEffect(() => {
        const axes = [x, y, z] as const;
        const goal = FACE_UP[value] ?? [0, 0, 0];
        axes.forEach(a => cancelAnimation(a));

        if (rolling) {
            tumbled.value = true;
            axes.forEach((a, i) => {
                const from = a.value;
                // A full turn returns to the same pose, so restarting each lap is seamless.
                a.value = withRepeat(
                    withTiming(from + 360, { duration: (360 / SPIN[i]!) * 1000, easing: Easing.linear }),
                    -1,
                    false,
                );
            });
            return;
        }

        if (!tumbled.value) {
            // Value changed without a roll (e.g. a resync): just show it.
            axes.forEach((a, i) => { a.value = goal[i]!; });
            return;
        }
        tumbled.value = false;

        axes.forEach((a, i) => {
            // Keep turning forward (at least a quarter turn on X/Y) so it lands instead of snapping back.
            const to = forwardTo(a.value, goal[i]!, i < 2 ? 90 : 0);
            const g = goal[i]!;
            a.value = withTiming(to, { duration: SETTLE_MS, easing: Easing.out(Easing.back(1.1)) }, finished => {
                if (finished) a.value = g; // normalise so angles never grow without bound
            });
        });
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

    const outlineProps = useAnimatedProps(() => ({
        d: silhouette(orientation(x.value, y.value, z.value, REST_TILT), half, c),
    }));
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

    const angles = { x, y, z };

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
                <Svg width={size} height={size * 1.08}>
                    <DiceDefs color={color} />
                    <Ellipse cx={c} cy={c + half * 1.55} rx={half * 1.25} ry={half * 0.2} fill="rgba(0,0,0,0.26)" />
                    <AnimatedPath animatedProps={outlineProps} fill={BODY} stroke={BODY} strokeWidth={size * 0.06} strokeLinejoin="round" />
                    {FACES.map(face => (
                        <AnimatedFace key={face.value} face={face} angles={angles} half={half} c={c} />
                    ))}
                </Svg>
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    halo: { position: 'absolute' },
});
