import FontAwesome from '@expo/vector-icons/FontAwesome';
import { applyColorChanges, COLORS, pickColor, seatColors, type BotLevel, type Color } from '@ludo/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { ColorPicker, type ColorOption } from '@/components/ludo/ColorPicker';
import { COLOR_HEX } from '@/components/ludo/geometry';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { Fonts } from '@/constants/fonts';
import type { LocalGameConfig, SeatKind } from '@/hooks/useLocalGame';

const palette = Colors.dark;

type Mode = 'bots' | 'pass';
type SeatDraft = { kind: SeatKind; name: string | null; level: BotLevel };

const LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];
const LEVEL_LABEL: Record<BotLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const titleCase = (c: string) => c[0] + c.slice(1).toLowerCase();

function defaultSeat(mode: Mode, index: number): SeatDraft {
    if (mode === 'bots') return { kind: index === 0 ? 'human' : 'bot', name: null, level: 'medium' };
    return { kind: 'human', name: null, level: 'medium' };
}

function defaultName(mode: Mode, seat: SeatDraft, color: Color, index: number): string {
    if (seat.kind === 'bot') return `${titleCase(color)} Bot`;
    if (mode === 'bots' && index === 0) return 'You';
    return `Player ${index + 1}`;
}

export default function LocalSetupScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { mode: rawMode } = useLocalSearchParams<{ mode?: string }>();
    const mode: Mode = rawMode === 'pass' ? 'pass' : 'bots';

    const [count, setCount] = useState(mode === 'bots' ? 4 : 2);
    const [seats, setSeats] = useState<SeatDraft[]>(() => [0, 1, 2, 3].map(i => defaultSeat(mode, i)));

    /** Seat i plays colors[i]. A new player count starts from the standard seating again. */
    const [colors, setColors] = useState<Color[]>(() => seatColors(count));
    const active = seats.slice(0, count);

    const changeCount = (n: number) => {
        setCount(n);
        setColors(seatColors(n));
    };

    /**
     * Same rules as online lobbies (2-player games stay in opposite corners), except
     * that every seat is on this device, so a color held by another seat is swapped.
     */
    const pickSeatColor = (index: number, color: Color) =>
        setColors(prev => {
            const seated = prev.map((c, i) => ({ id: String(i), color: c }));
            const changes = pickColor(count, seated, String(index), color);
            if (changes) return applyColorChanges(seated, changes).map(s => s.color);
            const other = prev.indexOf(color);
            return prev.map((c, i) => (i === index ? color : i === other ? prev[index]! : c));
        });

    const seatColorOptions = (index: number): ColorOption[] =>
        COLORS.map(color => {
            const holder = colors.indexOf(color);
            if (holder === index) return { color, status: 'mine' };
            return { color, status: holder === -1 ? 'free' : 'swap' };
        });
    const humans = active.filter(s => s.kind === 'human').length;

    const updateSeat = (index: number, patch: Partial<SeatDraft>) =>
        setSeats(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

    const start = () => {
        const config: LocalGameConfig = {
            seats: active.map((s, i) => ({
                color: colors[i]!,
                kind: s.kind,
                level: s.level,
                name: (s.name?.trim() || defaultName(mode, s, colors[i]!, i)).slice(0, 14),
            })),
        };
        router.push({ pathname: '/(game)/local-board', params: { config: JSON.stringify(config) } });
    };

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top + 8 }]}>
            <RNView style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
                    <FontAwesome name="chevron-left" size={14} color={palette.mutedText} />
                </TouchableOpacity>
                <Text weight="bold" style={styles.title}>{mode === 'bots' ? 'Vs Computer' : 'Pass & Play'}</Text>
                <RNView style={{ width: 36 }} />
            </RNView>

            <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                <GlassPanel intensity="heavy" style={styles.panel}>
                    <Text weight="medium" style={styles.label}>Players</Text>
                    <RNView style={styles.chipRow}>
                        {[2, 3, 4].map(n => (
                            <TouchableOpacity
                                key={n}
                                onPress={() => changeCount(n)}
                                activeOpacity={0.85}
                                style={[styles.chip, count === n && styles.chipActive]}
                            >
                                <Text weight="bold" style={[styles.chipText, count === n && styles.chipTextActive]}>{n}</Text>
                            </TouchableOpacity>
                        ))}
                    </RNView>
                </GlassPanel>

                <GlassPanel intensity="heavy" style={styles.panel}>
                    <Text weight="medium" style={styles.label}>Seats</Text>
                    {active.map((seat, i) => {
                        const color = colors[i]!;
                        const hex = COLOR_HEX[color];
                        return (
                            <RNView key={`seat-${i}`} style={styles.seatBlock}>
                                <RNView style={styles.seatRow}>
                                    <RNView style={[styles.seatAvatar, { backgroundColor: hex }]}>
                                        <FontAwesome name={seat.kind === 'bot' ? 'laptop' : 'user'} size={13} color="#fff" />
                                    </RNView>
                                    <TextInput
                                        value={seat.name ?? ''}
                                        onChangeText={t => updateSeat(i, { name: t })}
                                        placeholder={defaultName(mode, seat, color, i)}
                                        placeholderTextColor={palette.mutedText}
                                        maxLength={14}
                                        style={styles.seatName}
                                    />
                                    {seat.kind === 'bot' && (
                                        <TouchableOpacity
                                            onPress={() => updateSeat(i, { level: LEVELS[(LEVELS.indexOf(seat.level) + 1) % LEVELS.length]! })}
                                            style={styles.levelChip}
                                            activeOpacity={0.8}
                                        >
                                            <Text weight="semiBold" style={styles.levelText}>{LEVEL_LABEL[seat.level]}</Text>
                                        </TouchableOpacity>
                                    )}
                                    <RNView style={styles.toggle}>
                                        {(['human', 'bot'] as const).map(kind => (
                                            <TouchableOpacity
                                                key={kind}
                                                onPress={() => updateSeat(i, { kind, name: null })}
                                                style={[styles.toggleOpt, seat.kind === kind && { backgroundColor: hex }]}
                                                activeOpacity={0.85}
                                            >
                                                <FontAwesome
                                                    name={kind === 'bot' ? 'laptop' : 'user'}
                                                    size={12}
                                                    color={seat.kind === kind ? '#fff' : palette.mutedText}
                                                />
                                            </TouchableOpacity>
                                        ))}
                                    </RNView>
                                </RNView>
                                <ColorPicker
                                    options={seatColorOptions(i)}
                                    onPick={c => pickSeatColor(i, c)}
                                    size={24}
                                    showLabels={false}
                                />
                            </RNView>
                        );
                    })}
                    {humans === 0 && (
                        <Text weight="medium" style={styles.hint}>All bots — sit back and watch them play.</Text>
                    )}
                </GlassPanel>

                <Text weight="medium" style={styles.diceNote}>Dice adapt during the game to keep it close.</Text>
            </ScrollView>

            <TouchableOpacity
                style={[styles.startBtn, { marginBottom: insets.bottom + 12 }]}
                onPress={start}
                activeOpacity={0.85}
            >
                <FontAwesome name="play" size={13} color="#1A1048" />
                <Text weight="bold" style={styles.startText}>Start game</Text>
            </TouchableOpacity>
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingHorizontal: 20,
        gap: 14,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { fontSize: 17, color: palette.text },
    panel: { padding: 18, gap: 12 },
    label: {
        fontSize: 12,
        color: palette.mutedText,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    chipRow: { flexDirection: 'row', gap: 10 },
    chip: {
        flex: 1,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: palette.glassBorder,
    },
    chipActive: { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' },
    chipText: { fontSize: 17, color: palette.mutedText },
    chipTextActive: { color: '#1A1048' },
    seatBlock: { gap: 10 },
    seatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    seatAvatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    seatName: {
        flex: 1,
        height: 42,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: palette.glassBorder,
        color: palette.text,
        fontSize: 14,
        fontFamily: Fonts.semiBold,
    },
    levelChip: {
        paddingHorizontal: 10,
        height: 30,
        borderRadius: 10,
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.glassBorder,
    },
    levelText: { fontSize: 11, color: palette.text },
    toggle: {
        flexDirection: 'row',
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.glassBorder,
    },
    toggleOpt: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
    hint: { fontSize: 12, color: palette.mutedText, lineHeight: 17 },
    diceNote: { fontSize: 12, color: palette.mutedText, textAlign: 'center' },
    startBtn: {
        flexDirection: 'row',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    startText: { fontSize: 15, color: '#1A1048' },
});
