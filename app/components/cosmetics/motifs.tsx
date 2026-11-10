
import { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';

/**
 * Small symbols the board themes are built from: safe-square markers, centre emblems and
 * the motifs scattered over the homes. Each is drawn in a 20×20 box centred on 0,0 and
 * placed with `Motif` (centre and radius in board pixels).
 */
export type MotifKind =
    | 'star' | 'sparkle' | 'pumpkin' | 'bat' | 'diya' | 'rangoli' | 'gear' | 'bolt' | 'planet' | 'rocket'
    | 'shell' | 'bubble' | 'snowflake' | 'heart' | 'lollipop' | 'sprinkle' | 'sun' | 'cactus' | 'blossom'
    | 'leaf' | 'moon' | 'crown' | 'flame' | 'pixelHeart' | 'pixelStar' | 'chalkStar' | 'splash' | 'ball'
    | 'stumps' | 'ring' | 'dot' | 'reactor' | 'burst' | 'compass' | 'flower' | 'ghost';

type P = { color: string; accent: string };

export function starPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
    let d = '';
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / points) * i - Math.PI / 2;
        d += `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    }
    return `${d}Z`;
}

const PIXEL_HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const PIXEL_STAR = ['...X...', '..XXX..', 'XXXXXXX', '.XXXXX.', '.XX.XX.', 'X.....X'];

function Pixels({ rows, color }: { rows: string[]; color: string }) {
    const s = 20 / 7;
    const top = -(rows.length * s) / 2;
    return (
        <>
            {rows.flatMap((row, y) => [...row].map((ch, x) => ch === 'X'
                ? <Rect key={`${x}-${y}`} x={-10 + x * s} y={top + y * s} width={s + 0.05} height={s + 0.05} fill={color} />
                : null))}
        </>
    );
}

const ART: Record<MotifKind, (p: P) => React.JSX.Element> = {
    star: ({ color }) => <Path d={starPath(0, 0, 10, 4.4)} fill={color} />,
    sparkle: ({ color }) => <Path d="M0,-10 L2,-2 L10,0 L2,2 L0,10 L-2,2 L-10,0 L-2,-2 Z" fill={color} />,
    pumpkin: ({ color, accent }) => (
        <>
            <Rect x={-1.3} y={-10} width={2.6} height={4} rx={1} fill="#3E7B2A" />
            <Ellipse cx={-4.2} cy={1} rx={5.6} ry={7.6} fill={color} stroke="rgba(0,0,0,0.25)" strokeWidth={0.6} />
            <Ellipse cx={4.2} cy={1} rx={5.6} ry={7.6} fill={color} stroke="rgba(0,0,0,0.25)" strokeWidth={0.6} />
            <Ellipse cx={0} cy={1} rx={5.4} ry={8.2} fill={color} stroke="rgba(0,0,0,0.2)" strokeWidth={0.6} />
            <Path d="M-5,-1 L-2.6,-3.6 L-0.8,-1 Z M5,-1 L2.6,-3.6 L0.8,-1 Z M-5,3 L-3,5.4 L-1,3.8 L1,5.4 L3,3.8 L5,3 L3,6.6 L0,5.6 L-3,6.6 Z" fill={accent} />
        </>
    ),
    bat: ({ color }) => (
        <Path
            d="M0,-1.5 L-1.4,-4.2 L-2,-1.8 C-3.5,-3 -6,-3.4 -10,-2.2 C-8.2,-0.8 -7.8,1.2 -8,3 C-6.4,1.8 -4.6,2 -3.4,3.4 C-2.4,2.2 -1.2,2.2 0,3.8 C1.2,2.2 2.4,2.2 3.4,3.4 C4.6,2 6.4,1.8 8,3 C7.8,1.2 8.2,-0.8 10,-2.2 C6,-3.4 3.5,-3 2,-1.8 L1.4,-4.2 Z"
            fill={color}
        />
    ),
    diya: ({ color, accent }) => (
        <>
            <Circle cx={0} cy={-4} r={6} fill="#FFC23A" opacity={0.25} />
            <Path d="M0,-10 C3.4,-5.2 3.8,-2 0,0.4 C-3.8,-2 -3.4,-5.2 0,-10 Z" fill="#FFB020" />
            <Path d="M0,-6 C1.5,-3.6 1.7,-1.8 0,-0.6 C-1.7,-1.8 -1.5,-3.6 0,-6 Z" fill="#FFF3B0" />
            <Path d="M-9.5,1 C-8.4,8.6 8.4,8.6 9.5,1 Z" fill={color} />
            <Ellipse cx={0} cy={1} rx={9.5} ry={2} fill={accent} />
            <Circle cx={-4} cy={4.6} r={0.9} fill="#FFE27A" />
            <Circle cx={0} cy={5.6} r={0.9} fill="#FFE27A" />
            <Circle cx={4} cy={4.6} r={0.9} fill="#FFE27A" />
        </>
    ),
    rangoli: ({ color, accent }) => (
        <>
            {Array.from({ length: 8 }, (_, i) => (
                <Ellipse key={`o${i}`} cx={0} cy={-6} rx={2.6} ry={4} fill={color} transform={`rotate(${i * 45})`} />
            ))}
            {Array.from({ length: 8 }, (_, i) => (
                <Ellipse key={`i${i}`} cx={0} cy={-3.2} rx={1.4} ry={2.4} fill={accent} transform={`rotate(${i * 45 + 22.5})`} />
            ))}
            <Circle cx={0} cy={0} r={2} fill="#FFFFFF" />
            <Circle cx={0} cy={0} r={1} fill={color} />
        </>
    ),
    gear: ({ color, accent }) => (
        <>
            {Array.from({ length: 8 }, (_, i) => (
                <Rect key={i} x={-1.8} y={-10} width={3.6} height={4.5} rx={0.6} fill={color} transform={`rotate(${i * 45})`} />
            ))}
            <Circle cx={0} cy={0} r={7} fill={color} />
            <Circle cx={0} cy={0} r={2.8} fill={accent} />
        </>
    ),
    bolt: ({ color }) => <Polygon points="2.5,-10 -6.5,1.5 -0.8,1.5 -3,10 6.5,-2 0.8,-2" fill={color} />,
    planet: ({ color, accent }) => (
        <G transform="rotate(-20)">
            <Path d="M-10,0 A10,3.2 0 0 1 10,0" stroke={accent} strokeWidth={1.6} fill="none" />
            <Circle cx={0} cy={0} r={6.2} fill={color} />
            <Path d="M-5.2,-2 C-2,-3 2,-1 5.6,-2.4" stroke="rgba(255,255,255,0.35)" strokeWidth={1} fill="none" />
            <Path d="M-10,0 A10,3.2 0 0 0 10,0" stroke={accent} strokeWidth={1.6} fill="none" />
        </G>
    ),
    rocket: ({ color, accent }) => (
        <G transform="rotate(35)">
            <Path d="M0,-10 C4,-6 4.4,0 3.6,5 L-3.6,5 C-4.4,0 -4,-6 0,-10 Z" fill={color} />
            <Path d="M-3.6,1 L-6.5,7 L-3.4,6 Z M3.6,1 L6.5,7 L3.4,6 Z" fill={accent} />
            <Circle cx={0} cy={-2} r={1.8} fill="#DDEBFF" />
            <Path d="M-2,5.4 L0,10 L2,5.4 Z" fill="#FFB020" />
        </G>
    ),
    shell: ({ color, accent }) => (
        <>
            <Path d="M0,9 L-9.5,-0.5 C-8.8,-7 -3.6,-9.6 0,-9.6 C3.6,-9.6 8.8,-7 9.5,-0.5 Z" fill={color} />
            <Path d="M0,9 L-6.4,-6.6 M0,9 L-2.2,-9.2 M0,9 L2.2,-9.2 M0,9 L6.4,-6.6" stroke={accent} strokeWidth={0.9} />
            <Path d="M-2.4,9.4 L2.4,9.4 L0,7 Z" fill={accent} />
        </>
    ),
    bubble: ({ color }) => (
        <>
            <Circle cx={0} cy={0} r={8.5} fill="none" stroke={color} strokeWidth={1.4} />
            <Path d="M-4.6,-3.6 A5.6,5.6 0 0 1 -1,-5.8" stroke={color} strokeWidth={1.4} strokeLinecap="round" fill="none" />
        </>
    ),
    snowflake: ({ color }) => (
        <G stroke={color} strokeWidth={1.5} strokeLinecap="round">
            {[0, 60, 120].map(a => <Line key={a} x1={0} y1={-10} x2={0} y2={10} transform={`rotate(${a})`} />)}
            {[0, 60, 120, 180, 240, 300].map(a => (
                <Path key={`b${a}`} d="M-2.8,-8.4 L0,-5.6 L2.8,-8.4" fill="none" transform={`rotate(${a})`} />
            ))}
        </G>
    ),
    heart: ({ color }) => (
        <Path d="M0,9 C-6,4 -10,0.5 -10,-3.8 C-10,-7.8 -6.4,-9.8 -3.4,-9 C-1.6,-8.5 -0.5,-7.4 0,-6 C0.5,-7.4 1.6,-8.5 3.4,-9 C6.4,-9.8 10,-7.8 10,-3.8 C10,0.5 6,4 0,9 Z" fill={color} />
    ),
    lollipop: ({ color, accent }) => (
        <>
            <Line x1={0} y1={1} x2={0} y2={10} stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" />
            <Circle cx={0} cy={-3} r={7} fill={color} />
            <Path d="M0,-3 m-4.6,0 a4.6,4.6 0 1 1 9.2,0 a3.4,3.4 0 1 1 -6.8,0 a2.2,2.2 0 1 1 4.4,0" stroke={accent} strokeWidth={1.3} fill="none" />
        </>
    ),
    sprinkle: ({ color }) => <Rect x={-7} y={-2} width={14} height={4} rx={2} fill={color} />,
    sun: ({ color, accent }) => (
        <>
            {Array.from({ length: 8 }, (_, i) => (
                <Polygon key={i} points="-1.8,-6.4 1.8,-6.4 0,-10" fill={color} transform={`rotate(${i * 45})`} />
            ))}
            <Circle cx={0} cy={0} r={5.4} fill={color} />
            <Circle cx={0} cy={0} r={3.4} fill={accent} opacity={0.6} />
        </>
    ),
    cactus: ({ color }) => (
        <G fill={color}>
            <Rect x={-2.2} y={-9.5} width={4.4} height={19} rx={2.2} />
            <Path d="M-2.2,2 L-5.4,2 C-6.6,2 -7.2,1.2 -7.2,0 L-7.2,-4.6 C-7.2,-5.6 -6.4,-6.2 -5.6,-6.2 C-4.8,-6.2 -4,-5.6 -4,-4.6 L-4,-1.2 L-2.2,-1.2 Z" />
            <Path d="M2.2,4.4 L5.4,4.4 C6.6,4.4 7.2,3.6 7.2,2.4 L7.2,-2 C7.2,-3 6.4,-3.6 5.6,-3.6 C4.8,-3.6 4,-3 4,-2 L4,1.2 L2.2,1.2 Z" />
        </G>
    ),
    blossom: ({ color, accent }) => (
        <>
            {Array.from({ length: 5 }, (_, i) => (
                <Path key={i} d="M0,0 C-3.6,-2.6 -3.8,-7.6 -1.2,-9.6 L0,-8 L1.2,-9.6 C3.8,-7.6 3.6,-2.6 0,0 Z" fill={color} transform={`rotate(${i * 72})`} />
            ))}
            <Circle cx={0} cy={0} r={2.2} fill={accent} />
        </>
    ),
    flower: ({ color, accent }) => (
        <>
            {Array.from({ length: 6 }, (_, i) => (
                <Circle key={i} cx={0} cy={-5.4} r={4} fill={color} transform={`rotate(${i * 60})`} />
            ))}
            <Circle cx={0} cy={0} r={3.4} fill={accent} />
        </>
    ),
    leaf: ({ color, accent }) => (
        <G transform="rotate(30)">
            <Path d="M0,-10 C7,-5 7,5 0,10 C-7,5 -7,-5 0,-10 Z" fill={color} />
            <Line x1={0} y1={-8} x2={0} y2={9} stroke={accent} strokeWidth={0.9} />
        </G>
    ),
    moon: ({ color }) => <Path d="M2.6,-9.6 A10,10 0 1 0 2.6,9.6 A7.6,7.6 0 1 1 2.6,-9.6 Z" fill={color} />,
    crown: ({ color, accent }) => (
        <>
            <Path d="M-9.5,6 L-9.5,-5.5 L-4.6,0 L0,-8.6 L4.6,0 L9.5,-5.5 L9.5,6 Z" fill={color} />
            <Rect x={-9.5} y={3.6} width={19} height={3.4} fill={accent} />
            <Circle cx={0} cy={-8.6} r={1.4} fill={accent} />
        </>
    ),
    flame: ({ color, accent }) => (
        <>
            <Path d="M0,-10 C5,-4 7.2,0 6.2,4 C5.2,8 2.4,10 0,10 C-2.4,10 -5.2,8 -6.2,4 C-7.2,0 -5,-4 0,-10 Z" fill={color} />
            <Path d="M0,-2 C2.6,1 3.4,3.4 2.6,5.6 C2,7.4 1,8 0,8 C-1,8 -2,7.4 -2.6,5.6 C-3.4,3.4 -2.6,1 0,-2 Z" fill={accent} />
        </>
    ),
    pixelHeart: ({ color }) => <Pixels rows={PIXEL_HEART} color={color} />,
    pixelStar: ({ color }) => <Pixels rows={PIXEL_STAR} color={color} />,
    chalkStar: ({ color }) => (
        <>
            <Path d={starPath(0, 0, 9.5, 4.2)} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
            <Path d={starPath(0.5, 0.4, 9, 4)} fill="none" stroke={color} strokeWidth={0.6} opacity={0.6} strokeLinejoin="round" />
        </>
    ),
    splash: ({ color }) => (
        <>
            <Path d="M0,-7.6 C2.6,-8.4 3.6,-5.6 6,-6 C8.6,-6.4 8.4,-2.4 6.8,-0.6 C8.8,1.6 7.2,5.4 4.2,4.8 C3.6,7.8 -0.6,8.6 -2,6 C-4.6,7.6 -7.8,5 -6.4,2.2 C-9,0.6 -8.2,-3.6 -5.2,-3.4 C-5.6,-6.6 -2.4,-8.6 0,-7.6 Z" fill={color} />
            <Circle cx={8.4} cy={-8} r={1.4} fill={color} />
            <Circle cx={-8.6} cy={7.4} r={1.1} fill={color} />
            <Circle cx={7.8} cy={8.2} r={0.9} fill={color} />
        </>
    ),
    ball: ({ color, accent }) => (
        <>
            <Circle cx={0} cy={0} r={9} fill={color} />
            <Path d="M-3.2,-8.4 C-0.4,-3 -0.4,3 -3.2,8.4 M3.2,-8.4 C0.4,-3 0.4,3 3.2,8.4" stroke={accent} strokeWidth={0.9} fill="none" strokeDasharray="1.2 1" />
            <Ellipse cx={-3.6} cy={-4} rx={2.4} ry={1.4} fill="rgba(255,255,255,0.4)" transform="rotate(-30 -3.6 -4)" />
        </>
    ),
    stumps: ({ color, accent }) => (
        <>
            {[-5, 0, 5].map(x => <Rect key={x} x={x - 1.1} y={-7} width={2.2} height={17} rx={1} fill={color} />)}
            <Rect x={-6.6} y={-9.4} width={6} height={1.6} rx={0.8} fill={accent} />
            <Rect x={0.6} y={-9.4} width={6} height={1.6} rx={0.8} fill={accent} />
        </>
    ),
    ring: ({ color }) => (
        <>
            <Circle cx={0} cy={0} r={8} fill="none" stroke={color} strokeWidth={3.6} opacity={0.3} />
            <Circle cx={0} cy={0} r={8} fill="none" stroke={color} strokeWidth={1.6} />
            <Circle cx={0} cy={0} r={3} fill={color} />
        </>
    ),
    dot: ({ color }) => (
        <>
            <Circle cx={0} cy={0} r={10} fill={color} opacity={0.22} />
            <Circle cx={0} cy={0} r={5.5} fill={color} />
            <Circle cx={-1.8} cy={-1.8} r={1.6} fill="#FFFFFF" opacity={0.8} />
        </>
    ),
    reactor: ({ color, accent }) => (
        <>
            <Circle cx={0} cy={0} r={9.6} fill={accent} />
            <Circle cx={0} cy={0} r={9.6} fill="none" stroke={color} strokeWidth={1.2} />
            {Array.from({ length: 6 }, (_, i) => (
                <Path key={i} d="M-2.4,-8 L2.4,-8 L1.2,-3.4 L-1.2,-3.4 Z" fill={color} transform={`rotate(${i * 60})`} />
            ))}
            <Circle cx={0} cy={0} r={2.8} fill={color} />
            <Circle cx={0} cy={0} r={5.6} fill={color} opacity={0.2} />
        </>
    ),
    burst: ({ color, accent }) => (
        <>
            <Path d={starPath(0, 0, 10, 5.6, 12)} fill={color} />
            <Path d={starPath(0, 0, 6.6, 3.6, 8)} fill={accent} />
            <Circle cx={0} cy={0} r={2.2} fill="#FFFFFF" />
        </>
    ),
    compass: ({ color, accent }) => (
        <>
            <Circle cx={0} cy={0} r={9.4} fill="none" stroke={color} strokeWidth={1.1} />
            <Path d="M0,-10 L2,0 L0,10 L-2,0 Z" fill={color} />
            <Path d="M-10,0 L0,-2 L10,0 L0,2 Z" fill={accent} />
            <Circle cx={0} cy={0} r={1.6} fill="#FFFFFF" />
        </>
    ),
    ghost: ({ color, accent }) => (
        <>
            <Path d="M-7,9 L-7,-2 C-7,-7 -3.6,-10 0,-10 C3.6,-10 7,-7 7,-2 L7,9 L4.6,6.6 L2.4,9 L0,6.6 L-2.4,9 L-4.6,6.6 Z" fill={color} />
            <Ellipse cx={-2.6} cy={-2.4} rx={1.4} ry={2} fill={accent} />
            <Ellipse cx={2.6} cy={-2.4} rx={1.4} ry={2} fill={accent} />
        </>
    ),
};

/** One motif centred on (x, y), `r` board pixels from centre to edge. */
export function Motif({
    kind, x, y, r, color, accent = '#1B1A4A', rotate = 0, opacity = 1,
}: {
    kind: MotifKind;
    x: number;
    y: number;
    r: number;
    color: string;
    accent?: string;
    rotate?: number;
    opacity?: number;
}) {
    const Art = ART[kind];
    return (
        <G transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotate}) scale(${(r / 10).toFixed(4)})`} opacity={opacity}>
            <Art color={color} accent={accent} />
        </G>
    );
}

