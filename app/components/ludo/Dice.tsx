import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// ─── Tiny 3D renderer ────────────────────────────────────────────────────────
// A die is a cube with fixed pips on each face. We rotate it, hide the faces
// that point away, and draw each visible face as an affine-mapped unit square
// (an orthographic projection of a square is exactly a parallelogram). A cube is
// convex, so visible faces never overlap — no depth sorting needed.
//
// Every pose is drawn once, as a static SVG. The rolling die never redraws an
// SVG while it moves (see RollingDice): that is what made it drop frames on
// low-end Android, where each animated SVG prop re-rasterises the whole die.

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

const BODY = '#A9AFC4';
const SHADE = '#1E2340';

/** Gradient ids are per colour, so dice of different colours never share one (web: ids are global). */
const pipId = (color: string) => `pip-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

function FaceArt({ value, pip }: { value: number; pip: string }) {
    return (
        <>
            <Rect x={0.015} y={0.015} width={0.97} height={0.97} rx={0.17} fill="#FFFFFF" />
            {(PIPS[value] ?? []).map(([x, y], i) => (
                <G key={i}>
                    <Circle cx={x} cy={y + 0.012} r={0.092} fill="rgba(0,0,0,0.2)" />
                    <Circle cx={x} cy={y} r={0.088} fill={`url(#${pip})`} />
                </G>
            ))}
        </>
    );
}

function DiceDefs({ color }: { color: string }) {
    return (
        <Defs>
            <RadialGradient id={pipId(color)} cx="35%" cy="30%" r="75%">
                <Stop offset="0" stopColor={color} />
                <Stop offset="1" stopColor="#0F172A" stopOpacity={0.9} />
            </RadialGradient>
        </Defs>
    );
}

/** Outline + visible faces of a die in pose `m`, centred on (c, c). */
function DieShape({ m, size, c, color }: { m: Mat; size: number; c: number; color: string }) {
    const half = size * 0.3;
    const pip = pipId(color);
    return (
        <>
            <Path d={silhouette(m, half, c)} fill={BODY} stroke={BODY} strokeWidth={size * 0.06} strokeLinejoin="round" />
            {FACES.map(face => {
                const f = faceProps(m, face, half, c);
                if (!f.visible) return null;
                return (
                    <G key={face.value} transform={`matrix(${f.matrix.join(' ')})`}>
                        <FaceArt value={face.value} pip={pip} />
                        <Rect x={0.015} y={0.015} width={0.97} height={0.97} rx={0.17} fill={SHADE} opacity={f.shade} />
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
            <DieShape m={m} size={size} c={c} color={color} />
        </Svg>
    );
}

// ─── Rolling die: fake 3D ────────────────────────────────────────────────────
// While it rolls, the die flips through a loop of pre-drawn tumble poses (only
// view opacity changes, on the UI thread) while the whole die spins, hops and
// squashes with plain view transforms. The GPU composites all of that, so it
// holds 60 FPS even where redrawing SVG every frame could not. On landing it
// plays a few pre-drawn poses that keep turning the same way and slow into the
// result's face (no jump from mid-tumble to a still face), and the spin eases out.
//
// The whole roll runs on the UI thread from the moment the result is known: the
// die lands by itself and reports `onSettled`. Nothing on the JS side has to
// re-render mid-flight to make it land, because on Android a React commit holds
// Reanimated's frames back for its duration, which showed as a pause in the air.

/** Pre-drawn tumble poses: one full turn about a tilted axis. */
const TUMBLE_POSES = 16;
/** One loop through the poses (≈27 pose changes a second). */
const TUMBLE_CYCLE_MS = 600;
/** One hop: a parabola off the ground and back, HOP_HEIGHT high (in die-heights × 0.3). */
const HOP_MS = 380;
const HOP_HEIGHT = 0.85;
/** Hops in a roll whose result is known in time; the die touches down at the end of the last. */
const ROLL_HOPS = 2;
/** A result that comes late lands at the end of the hop in progress, if this much of it is left (else the next). */
const LAST_HOP_MIN_MS = 90;
/** From touchdown: the landing poses and the spin ease out over this long. */
const SETTLE_MS = 320;
/**
 * Spin of the whole die over a roll: one full turn, so it rests at 0°, the same
 * angle as on its first render (a re-render can briefly re-apply that one).
 */
const ROLL_SPIN_DEG = 360;
/** Spin speed while tumbling, so that a roll on schedule turns exactly ROLL_SPIN_DEG (ease-out covers half its time). */
const SPIN_DEG_PER_MS = ROLL_SPIN_DEG / (ROLL_HOPS * HOP_MS + SETTLE_MS / 2);
/** A late landing that can't even out the spin keeps its speed and eases to a quarter turn (still square) this far ahead… */
const SPIN_MIN_SETTLE_DEG = 30;
/** …over about as long as that speed needs, within these bounds. */
const SPIN_SETTLE_MIN_MS = 220;
const SPIN_SETTLE_MAX_MS = 650;
/**
 * Landing poses per face: how far (degrees, on both tumble axes) each is from
 * resting, so the die keeps turning forward and decelerates into the result.
 */
const SETTLE_OFFSETS = [72, 48, 28, 13, 4];

/** Tap to rest, for a roll whose result is known before it touches down. */
export const DICE_ROLL_MS = ROLL_HOPS * HOP_MS + SETTLE_MS;

/** What the die is showing (shared value `mode`). */
const MODE_REST = 0;
const MODE_TUMBLE = 1;
const MODE_SETTLE = 2;
/** Room around the die on each side (fraction of size), so corners never clip while it turns. */
const PAD = 0.14;

const TUMBLE: Mat[] = Array.from({ length: TUMBLE_POSES }, (_, k) => {
    const t = (360 * k) / TUMBLE_POSES;
    return orientation(t, t + 40, 0, REST_TILT);
});
const REST: Record<number, Mat> = Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map(v => {
        const [ax, ay, az] = FACE_UP[v]!;
        return [v, orientation(ax, ay, az, REST_TILT)];
    }),
);
/** Tumble direction is +x / +y, so the landing poses come from below the rest angles. */
const SETTLE: Record<number, Mat[]> = Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map(v => {
        const [ax, ay, az] = FACE_UP[v]!;
        return [v, SETTLE_OFFSETS.map(off => orientation(ax - off, ay - off, az, REST_TILT))];
    }),
);

/** One pose as a static SVG, drawn once. */
const PoseArt = memo(function PoseArt({ m, size, color }: { m: Mat; size: number; color: string }) {
    const w = size * (1 + 2 * PAD);
    return (
        <Svg width={w} height={w}>
            <DiceDefs color={color} />
            <DieShape m={m} size={size} c={w / 2} color={color} />
        </Svg>
    );
});

/**
 * A tumble frame or a landing frame of a face, shown by an animated opacity.
 * The style reads the shared values directly, so Reanimated sees them as inputs
 * and re-evaluates the moment they change (a value read through a helper
 * function isn't tracked, and the die then showed a stale face).
 */
const Pose = memo(function Pose({
    m, size, color, kind, face = 0, index = 0, mode, frame, settle, shown,
}: {
    m: Mat;
    size: number;
    color: string;
    kind: typeof MODE_TUMBLE | typeof MODE_SETTLE;
    face?: number;
    index?: number;
    mode: SharedValue<number>;
    frame: SharedValue<number>;
    settle: SharedValue<number>;
    shown: SharedValue<number>;
}) {
    const style = useAnimatedStyle(() => {
        let on = false;
        if (mode.value === kind) {
            if (kind === MODE_TUMBLE) on = Math.floor(frame.value) % TUMBLE_POSES === index;
            else on = shown.value === face && Math.min(Math.floor(settle.value), SETTLE_OFFSETS.length - 1) === index;
        }
        return { opacity: on ? 1 : 0 };
    });
    return (
        <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
            <PoseArt m={m} size={size} color={color} />
        </Animated.View>
    );
});

type FaceSetter = (face: number) => void;

/**
 * The resting faces. Which one shows is plain React state (set through `bind`),
 * not an animated value: when the screen re-renders, Android can briefly put
 * back a view's older animated values, and a resting face picked by animation
 * then blinked to the previous number. Re-rendering only this, never the
 * animated layer around it, keeps that from touching anything that moves.
 */
const RestFaces = memo(function RestFaces({
    initial, size, color, bind,
}: {
    initial: number;
    size: number;
    color: string;
    bind: (set: FaceSetter | null) => void;
}) {
    const [face, setFace] = useState(initial);
    useEffect(() => {
        bind(setFace);
        return () => bind(null);
    }, [bind]);
    return (
        <>
            {[1, 2, 3, 4, 5, 6].map(v => (
                <View key={v} style={[StyleSheet.absoluteFill, { opacity: v === face ? 1 : 0 }]} pointerEvents="none">
                    <PoseArt m={REST[v]!} size={size} color={color} />
                </View>
            ))}
        </>
    );
});

/** All poses of one die, drawn once per size / colour. */
const Poses = memo(function Poses({
    size,
    color,
    withTumble,
    withSettle,
    initialFace,
    bindRest,
    mode,
    frame,
    settle,
    shown,
}: {
    size: number;
    color: string;
    /** Tumble and landing poses mount a moment after the die, so opening the board stays quick. */
    withTumble: boolean;
    withSettle: boolean;
    initialFace: number;
    bindRest: (set: FaceSetter | null) => void;
    mode: SharedValue<number>;
    frame: SharedValue<number>;
    settle: SharedValue<number>;
    shown: SharedValue<number>;
}) {
    const shared = { size, color, mode, frame, settle, shown };
    // Shown at rest (fully opaque then, as on the first render, so a re-render can't change it).
    const restStyle = useAnimatedStyle(() => ({ opacity: mode.value === MODE_REST ? 1 : 0 }));
    return (
        <>
            <Animated.View style={[StyleSheet.absoluteFill, restStyle]} pointerEvents="none">
                <RestFaces initial={initialFace} size={size} color={color} bind={bindRest} />
            </Animated.View>
            {withTumble && TUMBLE.map((m, k) => (
                <Pose key={`tumble-${k}`} m={m} kind={MODE_TUMBLE} index={k} {...shared} />
            ))}
            {withSettle && [1, 2, 3, 4, 5, 6].flatMap(v => SETTLE[v]!.map((m, i) => (
                <Pose key={`settle-${v}-${i}`} m={m} kind={MODE_SETTLE} face={v} index={i} {...shared} />
            )))}
        </>
    );
});

/**
 * Tappable die. It tumbles while `rolling` and lands on `result` as soon as
 * that is known (pass it with `rolling`, or later while it tumbles), then calls
 * `onSettled`. Keep `rolling` on until then: re-rendering the screen while the
 * die is in the air can make it stutter. If `rolling` ends first, it lands on
 * `value`. Pulses a halo when waiting for a tap.
 */
export function RollingDice({
    value,
    rolling,
    result,
    onSettled,
    color,
    size = 68,
    waiting,
    disabled,
    onPress,
}: {
    /** Face shown at rest. */
    value: number;
    rolling: boolean;
    /** The face this roll lands on, once known. */
    result?: number | null;
    /** The die has come to rest on the roll's result. */
    onSettled?: () => void;
    color: string;
    size?: number;
    /** Pulse the halo (the local player should roll). */
    waiting?: boolean;
    disabled?: boolean;
    onPress?: () => void;
}) {
    const v = Math.min(6, Math.max(1, Math.round(value)));
    const mode = useSharedValue(MODE_REST);
    const frame = useSharedValue(0);
    const settle = useSharedValue(0);
    const shown = useSharedValue(v);
    const spin = useSharedValue(0);
    /** Hops so far: the integer part counts them, the fraction is the phase of the current one. */
    const hop = useSharedValue(0);
    /** The face this roll lands on (0 = not known yet). */
    const target = useSharedValue(0);
    /** The touchdown has been planned. */
    const planned = useSharedValue(false);
    const squash = useSharedValue(1);
    const halo = useSharedValue(0);
    const [tumbleMounted, setTumbleMounted] = useState(false);
    const [settleMounted, setSettleMounted] = useState(false);
    const onSettledRef = useRef(onSettled);
    onSettledRef.current = onSettled;
    const notifySettled = useCallback(() => onSettledRef.current?.(), []);
    const started = useRef(false);
    /** Only the first render's value: the poses never re-render for a new one (RestFaces takes it). */
    const initialFace = useRef(v).current;
    const setRestFace = useRef<FaceSetter | null>(null);
    const bindRest = useCallback((set: FaceSetter | null) => {
        setRestFace.current = set;
    }, []);
    /** The resting faces switch to the result while the die is still in the air (they are hidden then). */
    const showRestFace = useCallback((face: number) => setRestFace.current?.(face), []);

    // Staggered, so no single frame mounts every pose at once.
    useEffect(() => {
        const a = setTimeout(() => setTumbleMounted(true), 300);
        const b = setTimeout(() => setSettleMounted(true), 700);
        return () => {
            clearTimeout(a);
            clearTimeout(b);
        };
    }, []);
    // Rolled before they mounted: they must be there for the landing.
    useEffect(() => {
        if (rolling) {
            setTumbleMounted(true);
            setSettleMounted(true);
        }
    }, [rolling]);

    // ── UI-thread choreography ──

    /** On the ground: squash, turn the last bit into the face, then rest. */
    const touchDown = () => {
        'worklet';
        cancelAnimation(frame);
        shown.value = target.value;
        mode.value = MODE_SETTLE;
        settle.value = 0;
        settle.value = withTiming(SETTLE_OFFSETS.length, { duration: SETTLE_MS, easing: Easing.out(Easing.quad) }, done => {
            if (!done) return;
            mode.value = MODE_REST;
            scheduleOnRN(notifySettled);
        });
        // Over within the settle, so nothing is still moving once the screen updates.
        squash.value = withSequence(
            withTiming(0.86, { duration: 70, easing: Easing.out(Easing.quad) }),
            withTiming(1.04, { duration: 120, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 110, easing: Easing.inOut(Easing.quad) }),
        );
    };

    /**
     * The result is known: keep hopping at the same pace to the end of the planned
     * last hop and touch down there; steer the spin so it eases out on a quarter turn.
     * Every speed carries on unchanged, so nothing hangs or jumps.
     */
    const planLanding = () => {
        'worklet';
        if (planned.value) return;
        planned.value = true;
        // Plenty of time for that small re-render before touchdown.
        scheduleOnRN(showRestFace, target.value);
        const h = hop.value;
        const land = Math.max(ROLL_HOPS, Math.ceil(h + LAST_HOP_MIN_MS / HOP_MS));
        const ms = (land - h) * HOP_MS;
        cancelAnimation(hop);
        hop.value = withTiming(land, { duration: ms, easing: Easing.linear }, done => {
            if (done) touchDown();
        });

        cancelAnimation(spin);
        const s = spin.value;
        let to = 360 * Math.round((s + SPIN_DEG_PER_MS * (ms + SETTLE_MS / 2)) / 360);
        let speed = (to - s) / (ms + SETTLE_MS / 2);
        let easeMs = SETTLE_MS;
        if (Math.abs(speed - SPIN_DEG_PER_MS) > SPIN_DEG_PER_MS * 0.2) {
            // Too little time left to even it out unnoticed: keep the speed, ease out a little longer.
            speed = SPIN_DEG_PER_MS;
            const touch = s + speed * ms;
            to = 90 * Math.ceil((touch + SPIN_MIN_SETTLE_DEG) / 90);
            easeMs = Math.min(SPIN_SETTLE_MAX_MS, Math.max(SPIN_SETTLE_MIN_MS, (2 * (to - touch)) / speed));
        }
        const end = to;
        spin.value = withSequence(
            withTiming(s + speed * ms, { duration: ms, easing: Easing.linear }),
            withTiming(end, { duration: easeMs, easing: Easing.out(Easing.quad) }, ok => {
                if (ok) spin.value = end % 360; // keep angles small
            }),
        );
    };

    const startRoll = (known: number) => {
        'worklet';
        cancelAnimation(frame);
        cancelAnimation(spin);
        cancelAnimation(hop);
        cancelAnimation(settle);
        cancelAnimation(squash);
        target.value = known;
        planned.value = false;
        mode.value = MODE_TUMBLE;
        squash.value = 1;
        frame.value = 0;
        frame.value = withRepeat(withTiming(TUMBLE_POSES, { duration: TUMBLE_CYCLE_MS, easing: Easing.linear }), -1, false);
        hop.value = 0;
        if (known) {
            planLanding();
            return;
        }
        // Result not known yet: hop and spin on at a steady pace until it is.
        hop.value = withTiming(1000, { duration: 1000 * HOP_MS, easing: Easing.linear });
        const from = spin.value;
        spin.value = withRepeat(
            withTiming(from + 360, { duration: 360 / SPIN_DEG_PER_MS, easing: Easing.linear }),
            -1,
            false,
        );
    };

    const provideResult = (r: number) => {
        'worklet';
        if (mode.value !== MODE_TUMBLE || target.value) return;
        target.value = r;
        planLanding();
    };

    const known = result ? Math.min(6, Math.max(1, Math.round(result))) : 0;
    useEffect(() => {
        if (rolling) {
            if (!started.current) {
                started.current = true;
                scheduleOnUI(startRoll, known);
            } else if (known) {
                scheduleOnUI(provideResult, known);
            }
            return;
        }
        if (!started.current) return; // first render
        started.current = false;
        // Ended before a result came (e.g. the roll was refused): land on the face shown.
        scheduleOnUI(provideResult, known || v);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rolling, known]);

    // Value changed without a roll (e.g. a resync): just show it.
    useEffect(() => {
        if (rolling) return;
        shown.value = v;
        showRestFace(v);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [v]);

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

    const half = size * 0.3;
    const shadowW = half * 2.5;
    const shadowH = half * 0.4;

    const dieStyle = useAnimatedStyle(() => {
        const f = hop.value - Math.floor(hop.value);
        return {
            transform: [
                { translateY: -HOP_HEIGHT * 4 * f * (1 - f) * size * 0.3 },
                // Squash in screen space, after the spin.
                { scaleX: 2 - squash.value },
                { scaleY: squash.value },
                { rotate: `${spin.value}deg` },
            ],
        };
    });
    // The shadow stays on the ground and shrinks as the die hops up.
    const shadowStyle = useAnimatedStyle(() => {
        const f = hop.value - Math.floor(hop.value);
        const lift = HOP_HEIGHT * 4 * f * (1 - f);
        return {
            opacity: 1 - lift * 0.45,
            transform: [{ scaleX: 1 - lift * 0.3 }, { scaleY: 1 - lift * 0.3 }],
        };
    });
    const haloStyle = useAnimatedStyle(() => ({
        opacity: halo.value * 0.55,
        transform: [{ scale: 1 + halo.value * 0.18 }],
    }));

    const w = size * (1 + 2 * PAD);

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
            <View style={{ width: size, height: size * 1.08 }} pointerEvents="none">
                <Animated.View
                    style={[
                        styles.shadow,
                        {
                            left: size / 2 - shadowW / 2,
                            top: size / 2 + half * 1.55 - shadowH / 2,
                            width: shadowW,
                            height: shadowH,
                            borderRadius: shadowW / 2,
                        },
                        shadowStyle,
                    ]}
                />
                <Animated.View style={[{ position: 'absolute', left: -size * PAD, top: -size * PAD, width: w, height: w }, dieStyle]}>
                    <Poses
                        size={size}
                        color={color}
                        withTumble={tumbleMounted || rolling}
                        withSettle={settleMounted || rolling}
                        initialFace={initialFace}
                        bindRest={bindRest}
                        mode={mode}
                        frame={frame}
                        settle={settle}
                        shown={shown}
                    />
                </Animated.View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    halo: { position: 'absolute' },
    shadow: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.26)' },
});
