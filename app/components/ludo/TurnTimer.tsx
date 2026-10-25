import { useEffect } from 'react';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedProps,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The ring turns red for the last few seconds before the server plays the turn. */
const WARN_MS = 5_000;
const WARN_COLOR = '#FF4D4D';

export type TurnDeadline = {
    /** Local epoch ms when the turn runs out. */
    endsAt: number;
    /** Length of the turn, for the ring's full circle. */
    totalMs: number;
};

/** A ring that empties as the turn runs out. Animates on the UI thread, no re-renders. */
export function TurnTimer({ deadline, size, strokeWidth = 3, color }: {
    deadline: TurnDeadline;
    size: number;
    strokeWidth?: number;
    color: string;
}) {
    const left = useSharedValue(1);
    const { endsAt, totalMs } = deadline;

    useEffect(() => {
        const remaining = Math.max(0, endsAt - Date.now());
        left.value = Math.min(1, remaining / totalMs);
        left.value = withTiming(0, { duration: remaining, easing: Easing.linear });
        return () => cancelAnimation(left);
    }, [endsAt, totalMs, left]);

    const r = (size - strokeWidth) / 2;
    const c = size / 2;
    const circumference = 2 * Math.PI * r;

    const ringProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - left.value) }));
    const warnProps = useAnimatedProps(() => ({
        strokeDashoffset: circumference * (1 - left.value),
        strokeOpacity: left.value * totalMs <= WARN_MS ? 1 : 0,
    }));

    return (
        <Svg width={size} height={size} pointerEvents="none">
            <Circle cx={c} cy={c} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={strokeWidth} fill="none" />
            <G rotation={-90} origin={`${c}, ${c}`}>
                <AnimatedCircle
                    cx={c} cy={c} r={r} fill="none"
                    stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
                    strokeDasharray={circumference} animatedProps={ringProps}
                />
                <AnimatedCircle
                    cx={c} cy={c} r={r} fill="none"
                    stroke={WARN_COLOR} strokeWidth={strokeWidth} strokeLinecap="round"
                    strokeDasharray={circumference} animatedProps={warnProps}
                />
            </G>
        </Svg>
    );
}
