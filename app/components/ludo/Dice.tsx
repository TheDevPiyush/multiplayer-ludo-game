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
import Svg from 'react-native-svg';

import { DiceDefs, DieShape, FACE_UP, REST_TILT, apply, orientation, type Mat } from './DiceArt';

export { Dice3D } from './DiceArt';

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
const PoseArt = memo(function PoseArt({ m, size, color, skin }: { m: Mat; size: number; color: string; skin?: string | null }) {
    const w = size * (1 + 2 * PAD);
    return (
        <Svg width={w} height={w}>
            <DiceDefs color={color} skin={skin} />
            <DieShape m={m} size={size} c={w / 2} color={color} skin={skin} />
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
    m, size, color, skin, kind, face = 0, index = 0, mode, frame, settle, shown,
}: {
    m: Mat;
    size: number;
    color: string;
    skin?: string | null;
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
            <PoseArt m={m} size={size} color={color} skin={skin} />
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
    initial, size, color, skin, bind,
}: {
    initial: number;
    size: number;
    color: string;
    skin?: string | null;
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
                    <PoseArt m={REST[v]!} size={size} color={color} skin={skin} />
                </View>
            ))}
        </>
    );
});

/** All poses of one die, drawn once per size / colour. */
const Poses = memo(function Poses({
    size,
    color,
    skin,
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
    skin?: string | null;
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
    const shared = { size, color, skin, mode, frame, settle, shown };
    // Shown at rest (fully opaque then, as on the first render, so a re-render can't change it).
    const restStyle = useAnimatedStyle(() => ({ opacity: mode.value === MODE_REST ? 1 : 0 }));
    return (
        <>
            <Animated.View style={[StyleSheet.absoluteFill, restStyle]} pointerEvents="none">
                <RestFaces initial={initialFace} size={size} color={color} skin={skin} bind={bindRest} />
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
    skin,
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
    /** The roller's equipped dice item. */
    skin?: string | null;
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
                        skin={skin}
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
