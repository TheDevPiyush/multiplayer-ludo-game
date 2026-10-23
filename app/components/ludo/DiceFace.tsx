import Svg, { Circle, Defs, G, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

const DICE_DOTS: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

export function DiceFace({ value, size, color, glow }: { value: number; size: number; color: string; glow?: boolean }) {
    const dots = DICE_DOTS[value] ?? [];
    const r = size * 0.085;
    return (
        <Svg width={size} height={size}>
            <Defs>
                <LinearGradient id="dgrad" x1="0" y1="0" x2="0.6" y2="1">
                    <Stop offset="0" stopColor="#FFFFFF" />
                    <Stop offset="0.55" stopColor="#F2F2F8" />
                    <Stop offset="1" stopColor="#D8D8E4" />
                </LinearGradient>
                <RadialGradient id="dotG" cx="35%" cy="30%" r="80%">
                    <Stop offset="0" stopColor={color} stopOpacity="1" />
                    <Stop offset="1" stopColor="#000000" stopOpacity="0.85" />
                </RadialGradient>
            </Defs>
            {/* body */}
            <Rect
                x={1.5}
                y={1.5}
                width={size - 3}
                height={size - 3}
                rx={size * 0.22}
                fill="url(#dgrad)"
                stroke={glow ? color : '#B9B9CB'}
                strokeWidth={glow ? 3 : 1.5}
            />
            {/* top gloss */}
            <Rect
                x={size * 0.1}
                y={size * 0.06}
                width={size * 0.8}
                height={size * 0.34}
                rx={size * 0.15}
                fill="rgba(255,255,255,0.65)"
            />
            {dots.map(([cx, cy], i) => (
                <G key={i}>
                    <Circle cx={cx * size} cy={cy * size + 0.8} r={r} fill="rgba(0,0,0,0.25)" />
                    <Circle cx={cx * size} cy={cy * size} r={r} fill={color} />
                    <Circle cx={cx * size - r * 0.3} cy={cy * size - r * 0.35} r={r * 0.32} fill="rgba(255,255,255,0.7)" />
                </G>
            ))}
        </Svg>
    );
}
