import { memo } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { COLOR_BRIGHT, COLOR_DARK, COLOR_HEX } from '@/components/ludo/geometry';
import { pawnStyleOf, type PawnStyle } from './items';
import { starPath } from './motifs';

// Every style is drawn in a 100×130 box with its base at y≈108 (Token positions on that), and
// keeps the player's colour as its main colour, so whose pawn it is always reads at a glance.

type Tones = { hex: string; dark: string; bright: string; id: string };

const GOLD = ['#FFF3B0', '#FFD34D', '#C98F00'] as const;

/** Ground shadow and the round base most styles stand on. */
function Base({ t, rx = 37 }: { t: Tones; rx?: number }) {
    return (
        <>
            <Ellipse cx={50} cy={118} rx={rx - 1} ry={9} fill="rgba(0,0,0,0.32)" />
            <Ellipse cx={50} cy={109} rx={rx} ry={13} fill={t.dark} />
            <Ellipse cx={50} cy={104} rx={rx} ry={13} fill={`url(#base-${t.id})`} />
        </>
    );
}

/** The flared body and collar of the classic pawn. */
function Body({ t }: { t: Tones }) {
    return (
        <>
            <Path d="M21,104 C27,84 38,72 40,54 L60,54 C62,72 73,84 79,104 Z" fill={`url(#body-${t.id})`} />
            <Path d="M21,104 C27,84 38,72 40,54 L60,54 C62,72 73,84 79,104 Z" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={1.5} />
            <Ellipse cx={50} cy={55} rx={17} ry={6} fill={t.dark} />
            <Ellipse cx={50} cy={53} rx={17} ry={6} fill={t.hex} />
            <Path d="M41,62 C40,76 34,88 29,100" stroke="rgba(255,255,255,0.45)" strokeWidth={3.5} strokeLinecap="round" fill="none" />
        </>
    );
}

function Head({ t, cy = 33, r = 23 }: { t: Tones; cy?: number; r?: number }) {
    return (
        <>
            <Circle cx={50} cy={cy} r={r} fill={`url(#head-${t.id})`} />
            <Circle cx={50} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth={1.5} />
            <Ellipse cx={50 - r * 0.35} cy={cy - r * 0.4} rx={r * 0.35} ry={r * 0.24} fill="rgba(255,255,255,0.75)" transform={`rotate(-25 ${50 - r * 0.35} ${cy - r * 0.4})`} />
        </>
    );
}

function Classic({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} />
            <Body t={t} />
            <Head t={t} />
        </>
    );
}

/** A glass marble with a swirl, on a short stand. */
function Marble({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} rx={31} />
            <Path d="M35,104 C40,94 44,88 44,79 L56,79 C56,88 60,94 65,104 Z" fill={`url(#body-${t.id})`} />
            <Ellipse cx={50} cy={80} rx={13} ry={4.5} fill={t.dark} />
            <Ellipse cx={50} cy={78} rx={13} ry={4.5} fill={t.hex} />
            <Circle cx={50} cy={48} r={30} fill={`url(#head-${t.id})`} />
            <Path d="M26,54 C36,36 58,66 74,44" stroke="rgba(255,255,255,0.5)" strokeWidth={5} strokeLinecap="round" fill="none" />
            <Path d="M29,66 C42,52 58,72 70,58" stroke={t.bright} strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round" fill="none" />
            <Circle cx={50} cy={48} r={30} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} />
            <Ellipse cx={38} cy={33} rx={10} ry={6} fill="rgba(255,255,255,0.8)" transform="rotate(-30 38 33)" />
            <Circle cx={63} cy={65} r={3} fill="rgba(255,255,255,0.45)" />
        </>
    );
}


/** The classic body topped with a chunky star. */
function StarCap({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} />
            <Body t={t} />
            <Circle cx={50} cy={46} r={9} fill={`url(#head-${t.id})`} />
            <Path d={starPath(50, 30, 27, 13)} fill={`url(#head-${t.id})`} stroke={t.dark} strokeWidth={3} strokeLinejoin="round" />
            <Path d={starPath(50, 30, 27, 13)} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeLinejoin="round" />
            <Ellipse cx={43} cy={22} rx={5} ry={3} fill="rgba(255,255,255,0.8)" transform="rotate(-30 43 22)" />
        </>
    );
}

/** The classic pawn wearing a gold crown with a jewel in the player's colour. */
function Crown({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} />
            <Body t={t} />
            <Head t={t} cy={37} r={20} />
            <Path d="M31,27 L30,9 L40,17 L50,4 L60,17 L70,9 L69,27 Z" fill="url(#gold)" stroke={GOLD[2]} strokeWidth={1.5} strokeLinejoin="round" />
            <Rect x={30} y={23} width={40} height={7} rx={2} fill={GOLD[2]} />
            <Rect x={30} y={22} width={40} height={6} rx={2} fill="url(#gold)" />
            <Circle cx={30} cy={9} r={2.6} fill={GOLD[0]} />
            <Circle cx={50} cy={4} r={3} fill={GOLD[0]} />
            <Circle cx={70} cy={9} r={2.6} fill={GOLD[0]} />
            <Circle cx={50} cy={25} r={3.4} fill={t.hex} stroke="#FFFFFF" strokeWidth={1} />
        </>
    );
}

/** A faceted body and a cut gemstone for a head. */
function Gem({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} />
            <Path d="M21,104 L35,76 L42,56 L47,56 L44,104 Z" fill={t.dark} />
            <Path d="M44,104 L47,56 L53,56 L58,104 Z" fill={t.bright} />
            <Path d="M58,104 L53,56 L58,56 L65,76 L79,104 Z" fill={t.hex} />
            <Path d="M21,104 L35,76 L42,56 L58,56 L65,76 L79,104 Z" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth={1.5} strokeLinejoin="round" />
            <Ellipse cx={50} cy={56} rx={14} ry={4.5} fill={t.dark} />
            {/* Crown of the gem, then the pavilion that points down. */}
            <Path d="M28,28 L39,11 L61,11 L72,28 Z" fill={t.bright} />
            <Path d="M39,11 L44,28 L56,28 L61,11 Z" fill="rgba(255,255,255,0.55)" />
            <Path d="M28,28 L50,55 L50,28 Z" fill={t.hex} />
            <Path d="M50,28 L50,55 L72,28 Z" fill={t.dark} />
            <Path d="M39,28 L50,55 L61,28" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
            <Path d="M28,28 L39,11 L61,11 L72,28 L50,55 Z M28,28 L72,28" fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth={1.5} strokeLinejoin="round" />
            <Path d="M60,13 L62,18 L67,20 L62,22 L60,27 L58,22 L53,20 L58,18 Z" fill="#FFFFFF" opacity={0.9} />
        </>
    );
}


const INK = '#1B1A3A';

/** A friendly robot: antenna, visor eyes, a chest light. */
function Robot({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} rx={32} />
            <Rect x={29} y={64} width={42} height={40} rx={8} fill={`url(#body-${t.id})`} />
            <Rect x={39} y={73} width={22} height={15} rx={4} fill="rgba(255,255,255,0.85)" />
            <Circle cx={45} cy={80.5} r={2.6} fill={t.hex} />
            <Circle cx={55} cy={80.5} r={2.6} fill="#FFD34D" />
            <Rect x={44} y={56} width={12} height={9} fill={t.dark} />
            <Line x1={50} y1={18} x2={50} y2={7} stroke={t.dark} strokeWidth={3} strokeLinecap="round" />
            <Circle cx={50} cy={6} r={4.5} fill={t.bright} stroke={t.dark} strokeWidth={1.5} />
            <Rect x={21} y={28} width={6} height={14} rx={2} fill={t.dark} />
            <Rect x={73} y={28} width={6} height={14} rx={2} fill={t.dark} />
            <Rect x={26} y={17} width={48} height={40} rx={11} fill={`url(#head-${t.id})`} stroke="rgba(0,0,0,0.18)" strokeWidth={1.5} />
            <Rect x={32} y={26} width={36} height={17} rx={8} fill={INK} />
            <Ellipse cx={42} cy={34.5} rx={4.5} ry={4} fill="#7FF6FF" />
            <Ellipse cx={58} cy={34.5} rx={4.5} ry={4} fill="#7FF6FF" />
            <Rect x={43} y={48} width={14} height={3} rx={1.5} fill={t.dark} />
        </>
    );
}

/** A little ghost with a wavy hem. */
function Ghost({ t }: { t: Tones }) {
    return (
        <>
            <Ellipse cx={50} cy={118} rx={28} ry={7} fill="rgba(0,0,0,0.28)" />
            <Path d="M22,106 L22,48 C22,24 35,10 50,10 C65,10 78,24 78,48 L78,106 L69,98 L59.5,106 L50,98 L40.5,106 L31,98 Z" fill={`url(#head-${t.id})`} />
            <Path d="M22,106 L22,48 C22,24 35,10 50,10 C65,10 78,24 78,48 L78,106 L69,98 L59.5,106 L50,98 L40.5,106 L31,98 Z" fill="none" stroke={t.dark} strokeWidth={2} strokeLinejoin="round" />
            <Ellipse cx={40} cy={46} rx={5.5} ry={8} fill={INK} />
            <Ellipse cx={60} cy={46} rx={5.5} ry={8} fill={INK} />
            <Circle cx={41.5} cy={43} r={2} fill="#FFFFFF" />
            <Circle cx={61.5} cy={43} r={2} fill="#FFFFFF" />
            <Ellipse cx={50} cy={64} rx={5} ry={6} fill={INK} />
            <Ellipse cx={33} cy={57} rx={4} ry={2.5} fill="rgba(255,255,255,0.35)" />
            <Ellipse cx={38} cy={22} rx={7} ry={4.5} fill="rgba(255,255,255,0.7)" transform="rotate(-30 38 22)" />
        </>
    );
}

/** A rocket mid-launch. */
function Rocket({ t }: { t: Tones }) {
    return (
        <>
            <Ellipse cx={50} cy={118} rx={22} ry={6} fill="rgba(0,0,0,0.25)" />
            <Path d="M41,95 L50,118 L59,95 Z" fill="#FF9F1C" />
            <Path d="M45,95 L50,110 L55,95 Z" fill="#FFE27A" />
            <Path d="M33,66 L17,92 L17,101 L34,94 Z" fill={t.dark} />
            <Path d="M67,66 L83,92 L83,101 L66,94 Z" fill={t.dark} />
            <Path d="M50,5 C67,19 71,44 68,96 L32,96 C29,44 33,19 50,5 Z" fill={`url(#body-${t.id})`} />
            <Path d="M50,5 C58,12 63,21 65,30 L35,30 C37,21 42,12 50,5 Z" fill="#F4F6FF" />
            <Circle cx={50} cy={53} r={10} fill="#DDEBFF" stroke={t.dark} strokeWidth={3.5} />
            <Ellipse cx={46.5} cy={49.5} rx={3.5} ry={2.5} fill="#FFFFFF" />
            <Rect x={46} y={80} width={8} height={16} rx={2} fill={t.dark} />
            <Path d="M50,5 C67,19 71,44 68,96 L32,96 C29,44 33,19 50,5 Z" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={1.5} />
        </>
    );
}

/** A cat with pointy ears and whiskers. */
function Cat({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} />
            <Body t={t} />
            <Path d="M29,30 L28,6 L47,18 Z" fill={t.hex} stroke={t.dark} strokeWidth={1.5} strokeLinejoin="round" />
            <Path d="M71,30 L72,6 L53,18 Z" fill={t.hex} stroke={t.dark} strokeWidth={1.5} strokeLinejoin="round" />
            <Path d="M32,24 L31.5,12 L42,18.5 Z M68,24 L68.5,12 L58,18.5 Z" fill="#FFB3C7" />
            <Head t={t} cy={35} r={23} />
            <Ellipse cx={41} cy={34} rx={3.6} ry={5} fill={INK} />
            <Ellipse cx={59} cy={34} rx={3.6} ry={5} fill={INK} />
            <Path d="M47,42 L53,42 L50,46 Z" fill="#FF7FA6" />
            <Path d="M50,46 C48,49 45,49 44,47 M50,46 C52,49 55,49 56,47" stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" />
            <Path d="M24,40 L38,43 M24,47 L38,46 M76,40 L62,43 M76,47 L62,46" stroke="rgba(255,255,255,0.9)" strokeWidth={1.3} strokeLinecap="round" />
        </>
    );
}

/** A chess knight's horse head. */
function Knight({ t }: { t: Tones }) {
    const head = 'M28,104 C30,92 35,84 41,76 C35,75 27,71 26,64 C25,58 30,52 37,49 C41,44 41,36 44,28 C46,20 52,14 56,12 L58,4 L63,13 C72,18 78,30 77,46 C76,62 68,76 68,90 L72,104 Z';
    return (
        <>
            <Base t={t} />
            <Path d={head} fill={`url(#body-${t.id})`} />
            <Path d={head} fill="none" stroke={t.dark} strokeWidth={2} strokeLinejoin="round" />
            <Path d="M58,16 C66,24 70,38 68,54 C67,64 63,72 62,80" stroke={t.dark} strokeWidth={4} fill="none" strokeLinecap="round" />
            <Path d="M61,20 L66,17 M64,28 L70,25 M66,37 L72,35 M66,46 L72,45 M65,55 L71,55" stroke={t.dark} strokeWidth={2.5} strokeLinecap="round" />
            <Circle cx={47} cy={36} r={3.2} fill={INK} />
            <Circle cx={46} cy={35} r={1} fill="#FFFFFF" />
            <Circle cx={31} cy={61} r={1.8} fill={INK} />
            <Path d="M30,68 C34,70 38,70 41,68" stroke={t.dark} strokeWidth={1.6} fill="none" strokeLinecap="round" />
            <Path d="M44,30 C42,40 40,46 36,51" stroke="rgba(255,255,255,0.5)" strokeWidth={3} fill="none" strokeLinecap="round" />
        </>
    );
}

/** A ninja: hood in the player's colour, eyes showing, headband tails. */
function Ninja({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} />
            <Body t={t} />
            <Path d="M68,30 C80,26 86,32 90,24 C86,36 78,36 70,36 Z" fill={t.dark} />
            <Path d="M69,35 C80,38 84,46 92,44 C84,52 76,46 69,40 Z" fill={t.dark} />
            <Head t={t} cy={33} r={23} />
            <Rect x={27} y={23} width={46} height={7} fill={t.dark} />
            <Ellipse cx={50} cy={37} rx={17} ry={7} fill="#F2C9A0" />
            <Path d="M38,36 C40,33 44,33 46,36 Z M54,36 C56,33 60,33 62,36 Z" fill={INK} />
            <Path d="M36,32 L46,34 M64,32 L54,34" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </>
    );
}

/** A cupcake: swirl of frosting in the player's colour, sprinkles, a striped case. */
function Cupcake({ t }: { t: Tones }) {
    return (
        <>
            <Ellipse cx={50} cy={116} rx={30} ry={7} fill="rgba(0,0,0,0.3)" />
            <Path d="M24,66 L76,66 L70,108 L30,108 Z" fill="#F7E3C6" />
            <Path d="M33,66 L36,108 M42,66 L44,108 M50,66 L50,108 M58,66 L56,108 M67,66 L64,108" stroke="#E2B98A" strokeWidth={2.4} />
            <Path d="M24,66 L76,66 L70,108 L30,108 Z" fill="none" stroke="#C99A62" strokeWidth={1.5} strokeLinejoin="round" />
            <Ellipse cx={50} cy={64} rx={32} ry={11} fill={t.dark} />
            <Ellipse cx={50} cy={60} rx={32} ry={11} fill={`url(#head-${t.id})`} />
            <Ellipse cx={50} cy={47} rx={25} ry={10} fill={`url(#head-${t.id})`} />
            <Ellipse cx={50} cy={35} rx={18} ry={8.5} fill={`url(#head-${t.id})`} />
            <Path d="M40,30 C42,18 50,10 56,8 C54,16 58,22 60,30 Z" fill={`url(#head-${t.id})`} />
            <Rect x={33} y={52} width={6} height={2.4} rx={1.2} fill="#FFD34D" transform="rotate(-30 36 53)" />
            <Rect x={58} y={45} width={6} height={2.4} rx={1.2} fill="#FFFFFF" transform="rotate(25 61 46)" />
            <Rect x={46} y={58} width={6} height={2.4} rx={1.2} fill="#7FF6FF" transform="rotate(10 49 59)" />
            <Rect x={62} y={58} width={6} height={2.4} rx={1.2} fill="#FFD34D" transform="rotate(-15 65 59)" />
            <Rect x={42} y={38} width={6} height={2.4} rx={1.2} fill="#FFFFFF" transform="rotate(40 45 39)" />
            <Ellipse cx={42} cy={44} rx={6} ry={2.5} fill="rgba(255,255,255,0.45)" />
        </>
    );
}

/** A penguin in the player's colour with a white tummy. */
function Penguin({ t }: { t: Tones }) {
    return (
        <>
            <Ellipse cx={50} cy={117} rx={30} ry={7} fill="rgba(0,0,0,0.3)" />
            <Ellipse cx={38} cy={108} rx={9} ry={4.5} fill="#FF9F1C" />
            <Ellipse cx={62} cy={108} rx={9} ry={4.5} fill="#FF9F1C" />
            <Path d="M24,70 C16,78 16,90 22,94 C24,84 26,78 28,74 Z M76,70 C84,78 84,90 78,94 C76,84 74,78 72,74 Z" fill={t.dark} />
            <Ellipse cx={50} cy={66} rx={28} ry={42} fill={`url(#body-${t.id})`} />
            <Ellipse cx={50} cy={76} rx={18} ry={29} fill="#FFFFFF" />
            <Ellipse cx={50} cy={46} rx={17} ry={12} fill="#FFFFFF" />
            <Circle cx={43} cy={42} r={4} fill={INK} />
            <Circle cx={57} cy={42} r={4} fill={INK} />
            <Circle cx={44} cy={41} r={1.3} fill="#FFFFFF" />
            <Circle cx={58} cy={41} r={1.3} fill="#FFFFFF" />
            <Path d="M44,50 L56,50 L50,58 Z" fill="#FF9F1C" />
            <Ellipse cx={38} cy={34} rx={6} ry={3.5} fill="rgba(255,255,255,0.45)" transform="rotate(-25 38 34)" />
        </>
    );
}

/** A clay lamp for Diwali: a bowl in the player's colour and a bright flame. */
function Diya({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} rx={26} />
            <Path d="M40,104 C42,96 44,92 44,86 L56,86 C56,92 58,96 60,104 Z" fill={`url(#body-${t.id})`} />
            <Circle cx={50} cy={44} r={20} fill="#FFC23A" opacity={0.25} />
            <Path d="M50,18 C61,34 63,48 50,60 C37,48 39,34 50,18 Z" fill="#FF9F1C" />
            <Path d="M50,32 C56,42 57,50 50,58 C43,50 44,42 50,32 Z" fill="#FFE27A" />
            <Path d="M50,44 C53,49 53,53 50,57 C47,53 47,49 50,44 Z" fill="#FFFFFF" />
            <Path d="M16,66 C20,92 80,92 84,66 Z" fill={`url(#body-${t.id})`} />
            <Path d="M84,66 C88,64 92,60 94,56 C92,64 88,70 82,72 Z" fill={t.dark} />
            <Ellipse cx={50} cy={66} rx={34} ry={7} fill={t.dark} />
            <Ellipse cx={50} cy={64.5} rx={30} ry={5} fill={t.bright} />
            <Path d="M24,76 C36,82 64,82 76,76" stroke={GOLD[1]} strokeWidth={2.5} fill="none" />
            <Circle cx={32} cy={80} r={2} fill={GOLD[1]} />
            <Circle cx={50} cy={84} r={2} fill={GOLD[1]} />
            <Circle cx={68} cy={80} r={2} fill={GOLD[1]} />
        </>
    );
}

/** An alien: big head, big eyes, antennae. */
function Alien({ t }: { t: Tones }) {
    const head = 'M50,14 C72,14 81,30 76,46 C71,60 60,66 50,66 C40,66 29,60 24,46 C19,30 28,14 50,14 Z';
    return (
        <>
            <Base t={t} rx={30} />
            <Path d="M30,104 C34,90 42,80 43,66 L57,66 C58,80 66,90 70,104 Z" fill={`url(#body-${t.id})`} />
            <Line x1={38} y1={20} x2={30} y2={6} stroke={t.dark} strokeWidth={2.5} strokeLinecap="round" />
            <Line x1={62} y1={20} x2={70} y2={6} stroke={t.dark} strokeWidth={2.5} strokeLinecap="round" />
            <Circle cx={30} cy={6} r={4} fill={t.bright} stroke={t.dark} strokeWidth={1.5} />
            <Circle cx={70} cy={6} r={4} fill={t.bright} stroke={t.dark} strokeWidth={1.5} />
            <Path d={head} fill={`url(#head-${t.id})`} />
            <Path d={head} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={1.5} />
            <Path d="M30,38 C30,30 38,28 45,34 C48,38 46,46 40,47 C34,48 30,44 30,38 Z" fill={INK} />
            <Path d="M70,38 C70,30 62,28 55,34 C52,38 54,46 60,47 C66,48 70,44 70,38 Z" fill={INK} />
            <Ellipse cx={37} cy={36} rx={3} ry={2} fill="#FFFFFF" />
            <Ellipse cx={63} cy={36} rx={3} ry={2} fill="#FFFFFF" />
            <Path d="M45,56 C48,58 52,58 55,56" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </>
    );
}

/** A trophy cup in the player's colour with gold trim. */
function Trophy({ t }: { t: Tones }) {
    return (
        <>
            <Ellipse cx={50} cy={118} rx={32} ry={7} fill="rgba(0,0,0,0.3)" />
            <Rect x={26} y={98} width={48} height={12} rx={3} fill="#3A2A12" />
            <Rect x={30} y={91} width={40} height={9} rx={2} fill="url(#gold)" />
            <Path d="M44,91 L46,72 L54,72 L56,91 Z" fill="url(#gold)" />
            <Ellipse cx={50} cy={72} rx={10} ry={3.5} fill={GOLD[2]} />
            <Path d="M28,26 C14,26 12,38 16,46 C20,54 30,56 36,56" stroke={t.dark} strokeWidth={5} fill="none" strokeLinecap="round" />
            <Path d="M72,26 C86,26 88,38 84,46 C80,54 70,56 64,56" stroke={t.dark} strokeWidth={5} fill="none" strokeLinecap="round" />
            <Path d="M26,18 L74,18 C74,48 64,68 50,70 C36,68 26,48 26,18 Z" fill={`url(#body-${t.id})`} />
            <Path d="M26,18 L74,18 C74,48 64,68 50,70 C36,68 26,48 26,18 Z" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={1.5} />
            <Ellipse cx={50} cy={18} rx={24} ry={5} fill={t.dark} />
            <Ellipse cx={50} cy={17} rx={24} ry={4} fill={GOLD[1]} />
            <Path d={starPath(50, 40, 10, 4.5)} fill="url(#gold)" />
            <Path d="M33,24 C33,40 37,52 43,60" stroke="rgba(255,255,255,0.5)" strokeWidth={3} fill="none" strokeLinecap="round" />
        </>
    );
}

/** A spotted mushroom: the cap in the player's colour. */
function Mushroom({ t }: { t: Tones }) {
    return (
        <>
            <Ellipse cx={50} cy={117} rx={26} ry={6.5} fill="rgba(0,0,0,0.3)" />
            <Path d="M36,108 C39,92 39,72 41,58 L59,58 C61,72 61,92 64,108 Z" fill="#F4E6CC" />
            <Path d="M36,108 C39,92 39,72 41,58 L59,58 C61,72 61,92 64,108 Z" fill="none" stroke="#C9B48A" strokeWidth={1.5} />
            <Ellipse cx={50} cy={108} rx={14} ry={3.5} fill="#E4D2B0" />
            <Path d="M10,60 C10,28 30,10 50,10 C70,10 90,28 90,60 C74,68 26,68 10,60 Z" fill={`url(#head-${t.id})`} />
            <Path d="M10,60 C10,28 30,10 50,10 C70,10 90,28 90,60 C74,68 26,68 10,60 Z" fill="none" stroke={t.dark} strokeWidth={2} />
            <Circle cx={30} cy={40} r={6.5} fill="#FFFFFF" />
            <Circle cx={54} cy={28} r={8} fill="#FFFFFF" />
            <Circle cx={73} cy={44} r={6} fill="#FFFFFF" />
            <Circle cx={46} cy={50} r={4.5} fill="#FFFFFF" />
            <Ellipse cx={48} cy={74} rx={2} ry={3} fill={INK} />
            <Ellipse cx={55} cy={74} rx={2} ry={3} fill={INK} />
        </>
    );
}

/** A rubber duck in the player's colour. */
function Duck({ t }: { t: Tones }) {
    return (
        <>
            <Ellipse cx={52} cy={116} rx={34} ry={7} fill="rgba(0,0,0,0.3)" />
            <Path d="M16,82 C16,64 34,62 46,68 C58,58 86,60 88,82 C90,100 74,110 52,110 C30,110 16,100 16,82 Z" fill={`url(#body-${t.id})`} />
            <Path d="M86,74 C92,68 94,62 92,58 C90,66 84,70 80,72 Z" fill={t.dark} />
            <Path d="M50,80 C58,74 70,76 74,86 C66,92 56,90 50,80 Z" fill={t.dark} opacity={0.55} />
            <Circle cx={40} cy={46} r={22} fill={`url(#head-${t.id})`} />
            <Path d="M22,48 C12,46 6,50 6,54 C10,58 18,58 24,56 Z" fill="#FF9F1C" />
            <Path d="M8,54 C12,55 18,55 23,53" stroke="#C96A00" strokeWidth={1.4} fill="none" />
            <Circle cx={38} cy={40} r={4} fill={INK} />
            <Circle cx={39.4} cy={38.6} r={1.4} fill="#FFFFFF" />
            <Ellipse cx={32} cy={30} rx={6} ry={3.5} fill="rgba(255,255,255,0.6)" transform="rotate(-30 32 30)" />
        </>
    );
}

/** A carved pumpkin in the player's colour. */
function Pumpkin({ t }: { t: Tones }) {
    return (
        <>
            <Ellipse cx={50} cy={116} rx={34} ry={7} fill="rgba(0,0,0,0.3)" />
            <Path d="M48,32 C46,24 48,16 54,12 L58,16 C54,20 53,26 54,32 Z" fill="#3E7B2A" />
            <Path d="M54,20 C62,14 70,16 72,22 C66,22 60,22 55,25 Z" fill="#5BA33E" />
            <Ellipse cx={30} cy={72} rx={19} ry={34} fill={t.dark} />
            <Ellipse cx={70} cy={72} rx={19} ry={34} fill={t.dark} />
            <Ellipse cx={38} cy={72} rx={18} ry={36} fill={`url(#body-${t.id})`} />
            <Ellipse cx={62} cy={72} rx={18} ry={36} fill={`url(#body-${t.id})`} />
            <Ellipse cx={50} cy={72} rx={16} ry={38} fill={`url(#head-${t.id})`} />
            <Path d="M33,62 L41,52 L47,64 Z M67,62 L59,52 L53,64 Z" fill="#FFE27A" />
            <Path d="M28,80 L35,90 L42,82 L50,92 L58,82 L65,90 L72,80 L66,96 L58,90 L50,100 L42,90 L34,96 Z" fill="#FFE27A" />
            <Path d="M33,62 L41,52 L47,64 Z M67,62 L59,52 L53,64 Z" fill="none" stroke={t.dark} strokeWidth={1.2} />
        </>
    );
}

/** A ringed planet on a stand. */
function Planet({ t }: { t: Tones }) {
    return (
        <>
            <Base t={t} rx={30} />
            <Path d="M46,104 L47,70 L53,70 L54,104 Z" fill={t.dark} />
            <G transform="rotate(-18 50 46)">
                <Path d="M8,46 A42,11 0 0 1 92,46" stroke={GOLD[1]} strokeWidth={6} fill="none" />
            </G>
            <Circle cx={50} cy={46} r={27} fill={`url(#head-${t.id})`} />
            <Path d="M25,40 C38,34 60,46 75,38" stroke={t.dark} strokeWidth={4} fill="none" opacity={0.45} />
            <Path d="M26,54 C40,48 58,60 74,52" stroke={t.dark} strokeWidth={3} fill="none" opacity={0.35} />
            <Circle cx={50} cy={46} r={27} fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth={1.5} />
            <G transform="rotate(-18 50 46)">
                <Path d="M8,46 A42,11 0 0 0 92,46" stroke={GOLD[0]} strokeWidth={6} fill="none" />
                <Path d="M8,46 A42,11 0 0 0 92,46" stroke={GOLD[2]} strokeWidth={1.2} fill="none" />
            </G>
            <Ellipse cx={39} cy={31} rx={8} ry={5} fill="rgba(255,255,255,0.7)" transform="rotate(-30 39 31)" />
        </>
    );
}

const STYLES: Record<PawnStyle, (p: { t: Tones }) => React.JSX.Element> = {
    classic: Classic,
    marble: Marble,
    star: StarCap,
    crown: Crown,
    gem: Gem,
    robot: Robot,
    ghost: Ghost,
    rocket: Rocket,
    cat: Cat,
    knight: Knight,
    ninja: Ninja,
    cupcake: Cupcake,
    penguin: Penguin,
    diya: Diya,
    alien: Alien,
    trophy: Trophy,
    mushroom: Mushroom,
    duck: Duck,
    pumpkin: Pumpkin,
    planet: Planet,
};

/** A pawn in a player's colour, drawn in the style of an equipped pawn item (`skin`). */
export const Pawn = memo(function Pawn({ color, width, skin }: { color: string; width: number; skin?: string | null }) {
    const style = pawnStyleOf(skin);
    // Gradient ids are global on web: one set per style and colour.
    const t: Tones = {
        hex: COLOR_HEX[color] ?? '#888',
        dark: COLOR_DARK[color] ?? '#444',
        bright: COLOR_BRIGHT[color] ?? '#ccc',
        id: `${style}-${color.toLowerCase()}`,
    };
    const Art = STYLES[style];
    return (
        <Svg width={width} height={width * 1.3} viewBox="0 0 100 130">
            <Defs>
                <LinearGradient id={`body-${t.id}`} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={t.dark} />
                    <Stop offset="0.38" stopColor={t.bright} />
                    <Stop offset="0.62" stopColor={t.hex} />
                    <Stop offset="1" stopColor={t.dark} />
                </LinearGradient>
                <RadialGradient id={`head-${t.id}`} cx="36%" cy="30%" r="72%">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
                    <Stop offset="0.22" stopColor={t.bright} />
                    <Stop offset="0.65" stopColor={t.hex} />
                    <Stop offset="1" stopColor={t.dark} />
                </RadialGradient>
                <LinearGradient id={`base-${t.id}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={t.hex} />
                    <Stop offset="1" stopColor={t.dark} />
                </LinearGradient>
                {(style === 'crown' || style === 'trophy') && (
                    <LinearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={GOLD[0]} />
                        <Stop offset="0.5" stopColor={GOLD[1]} />
                        <Stop offset="1" stopColor={GOLD[2]} />
                    </LinearGradient>
                )}
            </Defs>
            <G>
                <Art t={t} />
            </G>
        </Svg>
    );
});
