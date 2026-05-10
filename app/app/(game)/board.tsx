import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Dimensions,
    StyleSheet,
    TouchableOpacity,
    View as RNView,
} from 'react-native';

import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import Svg, {
    Circle,
    G,
    Polygon,
    Rect,
    Text as SvgText,
} from 'react-native-svg';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRoom, moveToken, rollDice, skipTurn } from '@/apis/game-api';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { supabase } from '@/util/supabase-client';

const { width: W } = Dimensions.get('window');

const BOARD_SIZE = W - 16;
const CELL = BOARD_SIZE / 15;

const palette = Colors['dark'];

const COLOR_HEX: Record<string, string> = {
    RED: palette.danger,
    BLUE: palette.info,
    GREEN: palette.success,
    YELLOW: palette.warning,
};

const SAFE_POSITIONS = [1, 9, 14, 22, 27, 35, 40, 48];

// ─────────────────────────────────────────────────────────────
// BOARD PATH
// ─────────────────────────────────────────────────────────────

const LUDO_PATH: [number, number][] = [
    [1, 6],
    [2, 6],
    [3, 6],
    [4, 6],
    [5, 6],
    [6, 5],
    [6, 4],
    [6, 3],
    [6, 2],
    [6, 1],
    [6, 0],
    [7, 0],
    [8, 0],

    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [9, 6],
    [10, 6],
    [11, 6],
    [12, 6],
    [13, 6],
    [14, 6],

    [14, 7],
    [14, 8],
    [13, 8],
    [12, 8],
    [11, 8],
    [10, 8],
    [9, 8],
    [8, 9],
    [8, 10],
    [8, 11],
    [8, 12],
    [8, 13],
    [8, 14],

    [7, 14],
    [6, 14],
    [6, 13],
    [6, 12],
    [6, 11],
    [6, 10],
    [6, 9],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
    [0, 7],
    [0, 6],
];

// ─────────────────────────────────────────────────────────────
// FIXED START POSITIONS
// ─────────────────────────────────────────────────────────────

const COLOR_ENTRY: Record<string, number> = {
    RED: 0,
    BLUE: 13,
    GREEN: 26,
    YELLOW: 39,
};

const HOME_STRETCH: Record<string, [number, number][]> = {
    RED: [
        [1, 7],
        [2, 7],
        [3, 7],
        [4, 7],
        [5, 7],
    ],
    BLUE: [
        [7, 1],
        [7, 2],
        [7, 3],
        [7, 4],
        [7, 5],
    ],
    GREEN: [
        [13, 7],
        [12, 7],
        [11, 7],
        [10, 7],
        [9, 7],
    ],
    YELLOW: [
        [7, 13],
        [7, 12],
        [7, 11],
        [7, 10],
        [7, 9],
    ],
};

const CENTER: [number, number] = [7, 7];

const HOME_BASE: Record<string, [number, number][]> = {
    RED: [
        [2, 2],
        [3, 2],
        [2, 3],
        [3, 3],
    ],
    BLUE: [
        [11, 2],
        [12, 2],
        [11, 3],
        [12, 3],
    ],
    GREEN: [
        [11, 11],
        [12, 11],
        [11, 12],
        [12, 12],
    ],
    YELLOW: [
        [2, 11],
        [3, 11],
        [2, 12],
        [3, 12],
    ],
};




function posToCoord(pos: number, color: string): [number, number] {
    if (pos === 57) return CENTER;
    if (pos >= 52) return HOME_STRETCH[color]?.[pos - 52] ?? CENTER;

    const entry = COLOR_ENTRY[color] ?? 0;
    const index = (entry + pos - 1) % LUDO_PATH.length;
    return LUDO_PATH[index] ?? CENTER;
}

function cellCenter(col: number, row: number) {
    return {
        x: col * CELL + CELL / 2,
        y: row * CELL + CELL / 2,
    };
}

type PlayerState = {
    id: string;
    userId: string;
    username: string;
    color: string;
    tokenPositions: number[];
};

// ─────────────────────────────────────────────────────────────
// DICE
// ─────────────────────────────────────────────────────────────

const DICE_DOTS: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [
        [0.25, 0.25],
        [0.75, 0.75],
    ],
    3: [
        [0.25, 0.25],
        [0.5, 0.5],
        [0.75, 0.75],
    ],
    4: [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
    ],
    5: [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.5, 0.5],
        [0.25, 0.75],
        [0.75, 0.75],
    ],
    6: [
        [0.25, 0.2],
        [0.75, 0.2],
        [0.25, 0.5],
        [0.75, 0.5],
        [0.25, 0.8],
        [0.75, 0.8],
    ],
};

function DiceFace({
    value,
    size,
    color,
}: {
    value: number;
    size: number;
    color: string;
}) {
    const dots = DICE_DOTS[value] ?? [];

    return (
        <Svg width={size} height={size}>
            <Rect
                x={2}
                y={2}
                width={size - 4}
                height={size - 4}
                rx={size * 0.18}
                fill={palette.elevated}
                stroke={color}
                strokeWidth={2}
            />

            {dots.map(([cx, cy], i) => (
                <Circle
                    key={i}
                    cx={cx * size}
                    cy={cy * size}
                    r={size * 0.08}
                    fill={color}
                />
            ))}
        </Svg>
    );
}

// ─────────────────────────────────────────────────────────────
// TOKEN
// ─────────────────────────────────────────────────────────────

function Token({
    color,
    position,
    tokenIndex,
    onPress,
    canMove,
}: any) {
    const coord = position === 0
        ? cellCenter(...(HOME_BASE[color]?.[tokenIndex] ?? [0, 0]))
        : cellCenter(...posToCoord(position, color));

    const x = useSharedValue(coord.x);
    const y = useSharedValue(coord.y);
    const scale = useSharedValue(1);

    useEffect(() => {
        x.value = withSpring(coord.x, {
            damping: 12,
            stiffness: 120,
        });

        y.value = withSpring(coord.y, {
            damping: 12,
            stiffness: 120,
        });
    }, [position]);

    const animatedStyle = useAnimatedStyle(() => ({
        position: 'absolute',
        width: CELL * 0.68,
        height: CELL * 0.68,
        left: x.value - (CELL * 0.68) / 2,
        top: y.value - (CELL * 0.68) / 2,
        transform: [{ scale: scale.value }],
        zIndex: canMove ? 100 : 10,
    }));

    return (
        <Animated.View style={animatedStyle}>
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                    if (!canMove) return;

                    scale.value = withSequence(
                        withSpring(1.25),
                        withSpring(1)
                    );

                    onPress(tokenIndex);
                }}
                style={[
                    styles.token,
                    {
                        backgroundColor: COLOR_HEX[color],
                        borderColor: canMove
                            ? '#fff'
                            : 'rgba(255,255,255,0.2)',
                    },
                ]}
            >
                <RNView style={styles.tokenInner} />
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// BOARD
// ─────────────────────────────────────────────────────────────

function LudoBoard() {
    const S = BOARD_SIZE;
    const C = CELL;

    return (
        <Svg width={S} height={S}>
            <Rect width={S} height={S} fill="#ede0c0" rx={8} />

            {Array.from({ length: 15 }).map((_, r) =>
                Array.from({ length: 15 }).map((_, c) => {
                    if (r < 6 && c < 6) return null;
                    if (r < 6 && c >= 9) return null;
                    if (r >= 9 && c < 6) return null;
                    if (r >= 9 && c >= 9) return null;

                    if (
                        r >= 6 &&
                        r <= 8 &&
                        c >= 6 &&
                        c <= 8
                    )
                        return null;

                    return (
                        <Rect
                            key={`${r}-${c}`}
                            x={c * C}
                            y={r * C}
                            width={C}
                            height={C}
                            fill="#fff"
                            stroke="#d4c4a0"
                            strokeWidth={0.5}
                        />
                    );
                })
            )}

            {/* HOMES */}

            <Rect
                x={0}
                y={0}
                width={6 * C}
                height={6 * C}
                fill="#D94444"
            />

            <Rect
                x={9 * C}
                y={0}
                width={6 * C}
                height={6 * C}
                fill="#3B7DD8"
            />

            <Rect
                x={9 * C}
                y={9 * C}
                width={6 * C}
                height={6 * C}
                fill="#2DAA5C"
            />

            <Rect
                x={0}
                y={9 * C}
                width={6 * C}
                height={6 * C}
                fill="#E8A520"
            />

            {/* CENTER */}

            <Polygon
                points={`${6 * C},${6 * C} ${7.5 * C},${7.5 * C} ${6 * C
                    },${9 * C}`}
                fill="#D94444"
            />

            <Polygon
                points={`${6 * C},${6 * C} ${7.5 * C},${7.5 * C} ${9 * C
                    },${6 * C}`}
                fill="#3B7DD8"
            />

            <Polygon
                points={`${9 * C},${6 * C} ${7.5 * C},${7.5 * C} ${9 * C
                    },${9 * C}`}
                fill="#2DAA5C"
            />

            <Polygon
                points={`${6 * C},${9 * C} ${7.5 * C},${7.5 * C} ${9 * C
                    },${9 * C}`}
                fill="#E8A520"
            />

            {/* SAFE STARS */}

            {SAFE_POSITIONS.map((pos, i) => {
                const [c, r] = LUDO_PATH[pos - 1];

                return (
                    <SvgText
                        key={i}
                        x={c * C + C / 2}
                        y={r * C + C / 2 + C * 0.18}
                        fontSize={C * 0.48}
                        textAnchor="middle"
                        fill="#bbb"
                    >
                        ★
                    </SvgText>
                );
            })}
        </Svg>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────

export default function GameBoardScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const { gameCode: rawCode, roomId: rawRoomId } =
        useLocalSearchParams<any>();

    const gameCode =
        typeof rawCode === 'string'
            ? rawCode
            : String(rawCode?.[0] ?? '');

    const roomId =
        typeof rawRoomId === 'string'
            ? rawRoomId
            : String(rawRoomId?.[0] ?? '');

    const [players, setPlayers] = useState<PlayerState[]>([]);
    const [currentUserId, setCurrentUserId] =
        useState<string | null>(null);

    const [diceValue, setDiceValue] = useState<number | null>(
        null
    );

    const [rolling, setRolling] = useState(false);

    const [currentColor, setCurrentColor] =
        useState('RED');

    const selfPlayer = useMemo(
        () => players.find(p => p.userId === currentUserId),
        [players, currentUserId]
    );

    const isMyTurn =
        selfPlayer?.color === currentColor;

    const diceRotate = useSharedValue(0);
    const diceScale = useSharedValue(1);

    const diceStyle = useAnimatedStyle(() => ({
        transform: [
            {
                rotate: `${diceRotate.value}deg`,
            },
            {
                scale: diceScale.value,
            },
        ],
    }));

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data.user?.id ?? null);
        });
    }, []);

    const fetchState = useCallback(async () => {
        const { data } =
            await supabase.auth.getSession();

        const token = data.session?.access_token;

        if (!token) return;

        const result = await getRoom(token, gameCode);

        if (!result.ok) return;

        const room = result.data.data;

        setPlayers(
            room.players.map((p: any) => ({
                id: p.id,
                userId: p.userId,
                username: p.user.username,
                color: p.color,
                tokenPositions: p.tokenPositions ?? p.token_positions ?? [0, 0, 0, 0],
            }))
        );

        setCurrentColor(room.currentTurnColor as string);
        setDiceValue(room.currentDice);
    }, [gameCode]);

    useEffect(() => {
        fetchState();
    }, [fetchState]);

    // REALTIME

    useEffect(() => {
        if (!roomId) return;

        const channel = supabase
            .channel(`game:${roomId}`)

            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'GamePlayer', filter: `gameRoomId=eq.${roomId}` },
                (payload) => {
                    const row = payload.new as any;
                    setPlayers(prev => prev.map(p =>
                        p.id === row.id
                            ? { ...p, tokenPositions: row.tokenPositions ?? [0, 0, 0, 0] }
                            : p
                    ));
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'GameRoom', filter: `id=eq.${roomId}` },
                (payload) => {
                    const row = payload.new as any;
                    setCurrentColor(row.currentTurnColor ?? 'RED');
                    setDiceValue(row.currentDice ?? null);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId]);

    // ─────────────────────────────────────────────────────────
    // ROLL DICE
    // ─────────────────────────────────────────────────────────

    const handleRollDice = async () => {

        if (!isMyTurn) return;

        if (rolling) return;

        if (diceValue !== null) return;

        setRolling(true);

        try {

            // Animation

            diceRotate.value = withTiming(
                1080,
                {
                    duration: 900,
                    easing: Easing.out(Easing.exp),
                }
            );

            diceScale.value = withSequence(
                withTiming(1.25, {
                    duration: 180,
                }),
                withSpring(1)
            );

            // Fake rolling numbers

            let fakeValue = 1;

            const rollingInterval = setInterval(() => {

                fakeValue =
                    Math.floor(Math.random() * 6) + 1;

                setDiceValue(fakeValue);

            }, 80);

            const { data } =
                await supabase.auth.getSession();

            const token =
                data.session?.access_token;

            if (!token) {

                clearInterval(rollingInterval);

                return;
            }

            const result =
                await rollDice(
                    token,
                    gameCode
                );

            clearInterval(rollingInterval);

            if (!result.ok) {

                fetchState();

                setDiceValue(null);

                return;
            }

            const rolled =
                result.data.data.diceValue;

            setDiceValue(rolled);

            const me = players.find(
                p => p.userId === currentUserId
            );

            if (!me) return;


            const hasValidMove = (me.tokenPositions ?? []).some(pos => {
                if (pos === 0) return rolled === 6;
                if (pos === 57) return false;
                return pos + rolled <= 57;
            });

            if (!hasValidMove) {
                setTimeout(async () => {
                    const { data } = await supabase.auth.getSession();
                    const token = data.session?.access_token;
                    if (!token) return;
                    await skipTurn(token, gameCode);
                    setDiceValue(null);
                }, 1200);
            }

        } catch (error) {

            console.log(error);

            fetchState();

        } finally {

            setRolling(false);

        }
    };

    // ─────────────────────────────────────────────────────────
    // MOVE TOKEN
    // ─────────────────────────────────────────────────────────
    const handleTokenPress = async (tokenIndex: number) => {
        if (!isMyTurn || diceValue === null) return;
        const me = players.find(p => p.userId === currentUserId);
        if (!me) return;

        const fromPos = me.tokenPositions?.[tokenIndex];
        if (fromPos === undefined) return;

        if (fromPos === 0 && diceValue !== 6) return;
        if (fromPos === 57) return;

        const next = fromPos === 0 ? 1 : fromPos + diceValue;
        if (next > 57) return;

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;

        const result = await moveToken(token, { gameCode, tokenIndex, toPosition: next });

        if (!result.ok) {
            fetchState();
        }
    };

    return (
        <RNView
            style={[
                styles.screen,
                {
                    backgroundColor:
                        palette.background,
                },
            ]}
        >
            {/* TOP */}

            <RNView
                style={[
                    styles.topBar,
                    {
                        paddingTop:
                            insets.top + 8,
                    },
                ]}
            >
                <RNView
                    style={styles.turnIndicator}
                >
                    <RNView
                        style={[
                            styles.turnDot,
                            {
                                backgroundColor:
                                    COLOR_HEX[
                                    currentColor
                                    ],
                            },
                        ]}
                    />

                    <Text
                        weight="semiBold"
                        style={styles.turnText}
                    >
                        {isMyTurn
                            ? 'Your turn'
                            : `${currentColor}'s turn`}
                    </Text>
                </RNView>
            </RNView>

            {/* BOARD */}

            <RNView style={styles.boardWrap}>
                <LudoBoard />

                {players.map(player =>
                    (player.tokenPositions ?? []).map(
                        (pos, ti) => {
                            const canMove =
                                isMyTurn &&
                                player.userId === currentUserId &&
                                diceValue !== null &&
                                (
                                    pos === 0
                                        ? diceValue === 6
                                        : (
                                            pos !== 57 &&
                                            pos + diceValue <= 57
                                        )
                                );

                            return (
                                <Token
                                    key={`${player.color}-${ti}`}
                                    color={
                                        player.color
                                    }
                                    position={pos}
                                    tokenIndex={ti}
                                    onPress={
                                        handleTokenPress
                                    }
                                    canMove={
                                        canMove
                                    }
                                />
                            );
                        }
                    )
                )}
            </RNView>

            {/* BOTTOM */}

            <RNView
                style={[
                    styles.bottomBar,
                    {
                        paddingBottom:
                            insets.bottom + 10,
                    },
                ]}
            >
                <TouchableOpacity
                    style={styles.iconBtn}
                >
                    <FontAwesome
                        name="microphone"
                        size={16}
                        color={palette.mutedText}
                    />
                </TouchableOpacity>

                <RNView
                    style={styles.diceWrap}
                >
                    {diceValue !== null ? (
                        <RNView
                            style={
                                styles.diceResult
                            }
                        >
                            <Animated.View
                                style={
                                    diceStyle
                                }
                            >
                                <Animated.View style={diceStyle}>
                                    <DiceFace
                                        value={diceValue ?? 6}
                                        size={58}
                                        color={
                                            isMyTurn
                                                ? COLOR_HEX[currentColor]
                                                : palette.dimText
                                        }
                                    />
                                </Animated.View>
                            </Animated.View>

                            {isMyTurn && (
                                <Text
                                    weight="medium"
                                    style={
                                        styles.diceHint
                                    }
                                >
                                    Tap token
                                    to move
                                </Text>
                            )}
                        </RNView>
                    ) : (
                        <TouchableOpacity
                            activeOpacity={0.85}
                            style={[
                                styles.rollBtn,
                                (!isMyTurn ||
                                    rolling) &&
                                styles.rollBtnDisabled,
                            ]}
                            disabled={
                                !isMyTurn ||
                                rolling
                            }
                            onPress={
                                handleRollDice
                            }
                        >
                            <Animated.View
                                style={
                                    diceStyle
                                }
                            >
                                <DiceFace
                                    value={6}
                                    size={58}
                                    color={
                                        isMyTurn
                                            ? COLOR_HEX[
                                            currentColor
                                            ]
                                            : palette.dimText
                                    }
                                />
                            </Animated.View>

                            <Text
                                weight="semiBold"
                                style={[
                                    styles.rollLabel,
                                    {
                                        color:
                                            isMyTurn
                                                ? COLOR_HEX[
                                                currentColor
                                                ]
                                                : palette.dimText,
                                    },
                                ]}
                            >
                                {rolling
                                    ? 'Rolling...'
                                    : isMyTurn
                                        ? 'Roll'
                                        : 'Wait'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </RNView>

                <TouchableOpacity
                    style={styles.iconBtn}
                >
                    <FontAwesome
                        name="ellipsis-v"
                        size={16}
                        color={palette.mutedText}
                    />
                </TouchableOpacity>
            </RNView>
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 10,
    },

    turnIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    turnDot: {
        width: 10,
        height: 10,
        borderRadius: 100,
    },

    turnText: {
        fontSize: 14,
        color: palette.text,
    },

    boardWrap: {
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        alignSelf: 'center',
        marginVertical: 10,
    },

    token: {
        width: '100%',
        height: '100%',
        borderRadius: 100,
        borderWidth: 2.5,
        justifyContent: 'center',
        alignItems: 'center',
    },

    tokenInner: {
        width: '38%',
        height: '38%',
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },

    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 12,
    },

    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: palette.elevated,
    },

    diceWrap: {
        alignItems: 'center',
        gap: 8,
    },

    diceResult: {
        alignItems: 'center',
        gap: 8,
    },

    diceHint: {
        fontSize: 11,
        color: palette.mutedText,
    },

    rollBtn: {
        padding: 10,
        borderRadius: 18,
        alignItems: 'center',
        gap: 6,
        backgroundColor: palette.card,
    },

    rollBtnDisabled: {
        opacity: 0.45,
    },

    rollLabel: {
        fontSize: 12,
    },
});