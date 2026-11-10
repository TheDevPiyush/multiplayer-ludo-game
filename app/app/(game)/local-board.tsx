import FontAwesome from '@expo/vector-icons/FontAwesome';
import { getPlayer, HOME_POS, type GameEvent } from '@ludo/engine';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { reportOfflineGame, type GameReward } from '@/apis/progress-api';
import AppDialog from '@/components/Dialog';
import { RollingDice } from '@/components/ludo/Dice';
import { BOARD_SIZE, COLOR_HEX, layoutTokens, stripRows, turnsFor } from '@/components/ludo/geometry';
import { LudoBoard } from '@/components/ludo/LudoBoard';
import { PlayerStrip, type PlayerStripProps } from '@/components/ludo/PlayerStrip';
import { Token } from '@/components/ludo/Token';
import { GameRewardLine } from '@/components/progress/GameRewardLine';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useLocalGame, type LocalGameConfig } from '@/hooks/useLocalGame';
import { showProgress } from '@/hooks/useProgress';
import { track, type GameMode } from '@/util/analytics';
import { playEffect } from '@/util/audio';
import { feedbackForEvents, haptic } from '@/util/feedback';
import { diceLabel } from '@/util/remote-config';
import { supabase } from '@/util/supabase-client';

const palette = Colors.dark;

const FALLBACK: LocalGameConfig = {
    seats: [
        { color: 'RED', kind: 'human', name: 'You', level: 'medium' },
        { color: 'GREEN', kind: 'bot', name: 'Green Bot', level: 'medium' },
    ],
};

function parseConfig(raw: unknown): LocalGameConfig {
    try {
        const parsed = JSON.parse(String(raw)) as LocalGameConfig;
        return parsed?.seats?.length >= 2 ? parsed : FALLBACK;
    } catch {
        return FALLBACK;
    }
}

const RANK_LABEL = ['1st', '2nd', '3rd', '4th'];

/** Names one game for the server, so reporting it twice pays once. */
const newGameId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Sends a finished Vs Computer game to the server; resolves to what it paid, if anything. */
async function report(game: Parameters<typeof reportOfflineGame>[1]): Promise<GameReward | null> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await reportOfflineGame(token, game);
    if (!r.ok) return null;
    void showProgress(r.data.progress);
    return r.data.reward;
}

export default function LocalBoardScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const navigation = useNavigation();
    const { config: rawConfig } = useLocalSearchParams<{ config?: string }>();
    const config = useMemo(() => parseConfig(rawConfig), [rawConfig]);

    const [capturedKey, setCapturedKey] = useState<string | null>(null);
    const [exitDialog, setExitDialog] = useState(false);
    const leavingRef = useRef(false);

    // Everyone at this phone hears the game; haptics and "your turn" are for the human seats.
    const isHuman = (color: string) => config.seats.some(s => s.color === color && s.kind === 'human');
    /** Vs Computer: the one human's color, whose game counts toward rewards and missions. */
    const humans = config.seats.filter(s => s.kind === 'human');
    const soloColor = humans.length === 1 ? humans[0]!.color : null;
    const soloStats = useRef({ moves: 0, captures: 0, sixes: 0 });
    const gameId = useRef(newGameId());
    const [reward, setReward] = useState<GameReward | null>(null);

    const onEvents = (events: GameEvent[]) => {
        for (const e of events) {
            if (e.type === 'CAPTURED') setCapturedKey(`${e.color}:${e.token}:${Date.now()}`);
            if (!soloColor) continue;
            if (e.type === 'MOVED' && e.color === soloColor) soloStats.current.moves++;
            else if (e.type === 'CAPTURED' && e.by === soloColor) soloStats.current.captures++;
            else if (e.type === 'ROLLED' && e.color === soloColor && e.value === 6) soloStats.current.sixes++;
        }
        feedbackForEvents(events, isHuman);
    };

    const game = useLocalGame(config, onEvents);
    const { state, rolling, currentSeat, canRoll, movable } = game;

    useEffect(() => playEffect('intro'), []);

    // Dice: the rattle as the tumble starts, a tap when a human's result lands.
    const wasRolling = useRef(false);
    useEffect(() => {
        if (rolling) playEffect('roll');
        else if (wasRolling.current && currentSeat?.kind === 'human') haptic.medium();
        wasRolling.current = rolling;
    }, [rolling]);
    const isOver = state.phase === 'OVER';
    // The turn as shown: the previous player keeps it until their token has stopped (see useLocalGame).
    const { shownTurn, shownSeat } = game;
    const turnHex = COLOR_HEX[shownTurn] ?? '#fff';
    const humanCount = config.seats.filter(s => s.kind === 'human').length;

    // ── Measuring ──
    const mode: GameMode = humanCount === 0 ? 'watch_bots' : humanCount === 1 ? 'vs_computer' : 'pass_and_play';
    const players = config.seats.length;
    const startedAt = useRef(Date.now());
    useEffect(() => track('game_start', { mode, players }), []);
    useEffect(() => {
        if (!isOver) return;
        const seconds = Math.round((Date.now() - startedAt.current) / 1000);
        const you = mode === 'vs_computer' ? config.seats.find(s => s.kind === 'human')?.color : undefined;
        track('game_finish', { mode, players, seconds, dice: diceLabel(), ...(you ? { won: state.ranking[0] === you ? 1 : 0 } : {}) });
        if (soloColor) {
            const id = gameId.current;
            void report({
                gameId: id,
                won: state.ranking[0] === soloColor,
                seconds,
                ...soloStats.current,
                home: getPlayer(state, soloColor)?.tokens.filter(t => t === HOME_POS).length ?? 0,
            }).then(r => {
                // Only if this game is still the one on screen.
                if (r && gameId.current === id) setReward(r);
            });
        }
    }, [isOver]);
    const restart = () => {
        if (isOver) track('rematch', { mode });
        soloStats.current = { moves: 0, captures: 0, sixes: 0 };
        gameId.current = newGameId();
        setReward(null);
        startedAt.current = Date.now();
        track('game_start', { mode, players });
        game.restart();
    };

    const [lastDice, setLastDice] = useState<number | null>(null);

    useEffect(() => {
        if (state.dice !== null) setLastDice(state.dice);
    }, [state.dice]);

    // ── Leaving ──
    useEffect(() => {
        const unsub = navigation.addListener('beforeRemove', (e) => {
            if (leavingRef.current || isOver) return;
            e.preventDefault();
            setExitDialog(true);
        });
        return unsub;
    }, [navigation, isOver]);

    const goHome = () => {
        leavingRef.current = true;
        setExitDialog(false);
        router.replace('/(tabs)');
    };

    // ── Board data ──
    // Vs Computer turns the board so your home is bottom-right; Pass & Play keeps it fixed for everyone at the phone.
    const turns = humanCount === 1 ? turnsFor(config.seats.find(s => s.kind === 'human')?.color) : 0;
    const tokenItems = useMemo(() => {
        const layout = layoutTokens(state.players.map(p => ({ color: p.color, tokens: p.tokens, owner: p.color })), turns);
        return layout.map(t => ({
            ...t,
            canMove: t.color === state.turn && movable.includes(t.tokenIndex),
            captured: !!capturedKey && capturedKey.startsWith(`${t.color}:${t.tokenIndex}:`) && t.pos === 0,
        }));
    }, [state, movable, capturedKey, turns]);

    const strips = useMemo(
        () =>
            state.players.map(p => {
                const seat = game.seatOf(p.color);
                const isBot = seat?.kind === 'bot';
                const home = p.tokens.filter(t => t === 57).length;
                const strip: PlayerStripProps & { key: string } = {
                    key: p.color,
                    color: p.color,
                    name: seat?.name ?? p.color,
                    initials: (seat?.name ?? p.color).slice(0, 2).toUpperCase(),
                    avatarIcon: isBot ? 'laptop' : undefined,
                    isActive: !isOver && p.color === shownTurn,
                    subtitle: p.rank ? `${RANK_LABEL[p.rank - 1]} place` : `${home}/4 home${isBot ? ` · ${seat?.level}` : ''}`,
                    subtitleColor: p.rank ? '#37BD6A' : undefined,
                };
                return strip;
            }),
        [state, isOver, shownTurn, game.seatOf],
    );
    // Each strip sits at its own home's corner (an empty cell keeps the other side in place).
    const [topStrips, bottomStrips] = stripRows(strips, turns);
    const stripCell = (strip: (typeof strips)[number] | null, i: number) => {
        if (!strip) return <RNView key={`empty-${i}`} style={{ flex: 1 }} />;
        const { key, ...rest } = strip;
        return <PlayerStrip key={key} {...rest} />;
    };

    const turnName = shownSeat?.name ?? shownTurn;
    const turnLabel = humanCount === 1 && shownSeat?.kind === 'human' ? 'Your turn' : `${turnName}'s turn`;
    const hint = rolling
        ? 'Rolling…'
        : !game.turnLive && shownTurn !== state.turn
            ? 'Next turn…'
            : shownSeat?.kind === 'bot'
                ? `${turnName} is thinking…`
                : !game.turnLive
                    ? 'Get ready…'
                    : state.phase === 'ROLL'
                        ? 'Tap to roll'
                        : movable.length > 0
                            ? 'Tap a token to move'
                            : 'No moves…';


    const ranking = isOver
        ? state.ranking.map(color => ({ color, seat: game.seatOf(color), rank: getPlayer(state, color)?.rank ?? 0 }))
        : [];
    const winner = ranking[0];

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top }]}>
            <RNView style={styles.topBar}>
                <TouchableOpacity onPress={() => setExitDialog(true)} style={styles.iconBtn}>
                    <FontAwesome name="chevron-left" size={13} color={palette.mutedText} />
                </TouchableOpacity>
                <RNView style={styles.chip}>
                    <FontAwesome name={humanCount > 1 ? 'users' : 'laptop'} size={11} color={palette.mutedText} />
                    <Text weight="medium" style={styles.chipText}>
                        {humanCount > 1 ? 'Pass & Play' : humanCount === 1 ? 'Vs Computer' : 'Bots only'}
                    </Text>
                </RNView>
                <TouchableOpacity onPress={restart} style={styles.iconBtn}>
                    <FontAwesome name="refresh" size={13} color={palette.mutedText} />
                </TouchableOpacity>
            </RNView>

            {/* Strips + board, centred in the space between the top and bottom bars */}
            <RNView style={styles.arena}>
            <RNView style={styles.stripRow}>
                {topStrips.map(stripCell)}
            </RNView>

            <RNView style={styles.boardWrap}>
                <RNView style={styles.boardShadow} />
                <LudoBoard turns={turns} />
                {tokenItems.map(t => (
                    <Token
                        turns={turns}
                        key={t.key}
                        color={t.color}
                        coord={t.coord}
                        pos={t.pos}
                        tokenIndex={t.tokenIndex}
                        canMove={t.canMove}
                        captured={t.captured}
                        onPress={t.canMove ? game.move : undefined}
                    />
                ))}
            </RNView>

            <RNView style={styles.stripRow}>
                {bottomStrips.map(stripCell)}
            </RNView>
            </RNView>

            <RNView style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
                <RNView style={styles.turnPill}>
                    <RNView style={[styles.turnDot, { backgroundColor: turnHex }]} />
                    <Text weight="semiBold" style={styles.turnText} numberOfLines={1}>{isOver ? 'Game over' : turnLabel}</Text>
                </RNView>

                <RNView style={styles.diceWrap}>
                    <RollingDice
                        value={state.dice ?? lastDice ?? 6}
                        rolling={rolling}
                        result={game.rollResult}
                        onSettled={game.diceSettled}
                        color={turnHex}
                        waiting={canRoll}
                        disabled={!canRoll}
                        onPress={game.roll}
                    />
                    <Text weight="medium" style={styles.diceHint}>{isOver ? ' ' : hint}</Text>
                </RNView>

                <RNView style={{ width: 80 }} />
            </RNView>

            {isOver && winner && (
                <RNView style={styles.winOverlay}>
                    <RNView style={styles.winCard}>
                        <RNView style={[styles.winCrown, { backgroundColor: COLOR_HEX[winner.color] + '22' }]}>
                            <FontAwesome name="trophy" size={36} color={COLOR_HEX[winner.color]} />
                        </RNView>
                        <Text weight="bold" style={styles.winTitle}>
                            {humanCount === 1 && winner.seat?.kind === 'human' ? '🎉 You Won!' : `${winner.seat?.name ?? winner.color} wins!`}
                        </Text>
                        <RNView style={styles.rankList}>
                            {ranking.map(r => (
                                <RNView key={r.color} style={styles.rankRow}>
                                    <Text weight="bold" style={styles.rankPos}>{RANK_LABEL[r.rank - 1]}</Text>
                                    <RNView style={[styles.turnDot, { backgroundColor: COLOR_HEX[r.color] }]} />
                                    <Text weight="semiBold" style={styles.rankName} numberOfLines={1}>{r.seat?.name ?? r.color}</Text>
                                    {r.seat?.kind === 'bot' && <FontAwesome name="laptop" size={11} color={palette.mutedText} />}
                                </RNView>
                            ))}
                        </RNView>
                        {reward && <GameRewardLine reward={reward} />}
                        <RNView style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                            <TouchableOpacity style={[styles.winBtn, styles.winBtnGhost]} onPress={goHome} activeOpacity={0.85}>
                                <Text weight="bold" style={styles.winBtnText}>Home</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.winBtn} onPress={restart} activeOpacity={0.85}>
                                <Text weight="bold" style={styles.winBtnText}>Play again</Text>
                            </TouchableOpacity>
                        </RNView>
                    </RNView>
                </RNView>
            )}

            <AppDialog
                visible={exitDialog}
                title="Quit game?"
                message="This offline game will be lost."
                onDismiss={() => setExitDialog(false)}
                actions={[
                    { label: 'Keep playing', onPress: () => setExitDialog(false) },
                    { label: 'Quit', onPress: goHome },
                ]}
            />
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 8,
    },
    iconBtn: {
        width: 36, height: 36,
        borderRadius: 10,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
    },
    chipText: { fontSize: 11, color: palette.mutedText },
    stripRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
    boardWrap: { width: BOARD_SIZE, height: BOARD_SIZE, alignSelf: 'center', marginVertical: 4 },
    boardShadow: {
        position: 'absolute',
        width: BOARD_SIZE,
        height: BOARD_SIZE,
        borderRadius: 20,
        backgroundColor: 'rgba(10, 6, 60, 0.45)',
        top: 7,
        left: 0,
        zIndex: -1,
    },
    arena: { flex: 1, justifyContent: 'center' },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    turnPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: 999,
        maxWidth: 130,
        backgroundColor: palette.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
    },
    turnDot: { width: 8, height: 8, borderRadius: 4 },
    turnText: { fontSize: 12, color: palette.text, flexShrink: 1 },
    diceWrap: { alignItems: 'center', gap: 6 },
    diceHint: { fontSize: 11, color: palette.mutedText },
    winOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
    },
    winCard: {
        width: '84%',
        backgroundColor: palette.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: palette.border,
        paddingVertical: 28,
        paddingHorizontal: 24,
        alignItems: 'center',
        gap: 14,
    },
    winCrown: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
    winTitle: { fontSize: 22, color: palette.text, textAlign: 'center' },
    rankList: { alignSelf: 'stretch', gap: 8 },
    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    rankPos: { width: 34, fontSize: 13, color: palette.mutedText },
    rankName: { flex: 1, fontSize: 14, color: palette.text },
    winBtn: {
        paddingVertical: 14, paddingHorizontal: 22,
        borderRadius: 14,
        backgroundColor: '#37BD6A',
    },
    winBtnGhost: { backgroundColor: 'rgba(255,255,255,0.1)' },
    winBtnText: { color: '#fff', fontSize: 14, letterSpacing: 0.3 },
});
