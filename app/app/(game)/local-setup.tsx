import FontAwesome from '@expo/vector-icons/FontAwesome';
import { seatColors, type BotLevel, type Color } from '@ludo/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import { Menu } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { COLOR_HEX } from '@/components/ludo/geometry';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import type { LocalGameConfig, SeatKind } from '@/hooks/useLocalGame';

const palette = Colors.dark;

type Mode = 'bots' | 'pass';
type SeatDraft = { kind: SeatKind; name: string | null; level: BotLevel };

const LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];
const LEVEL_LABEL: Record<BotLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const titleCase = (c: string) => c[0] + c.slice(1).toLowerCase();

/** "Dice Luck" is the player-facing name for dynamic dice: Easy = on, Hard = off. */
type DiceLuck = 'easy' | 'hard';
const DICE_LUCK: Record<DiceLuck, { label: string; hint: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }> = {
    easy: { label: 'Easy', hint: 'Lucky breaks when you fall behind. Great for casual games.', icon: 'smile-o' },
    hard: { label: 'Hard', hint: 'Pure chance. Every roll is completely fair.', icon: 'bolt' },
};

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
    const [diceLuck, setDiceLuck] = useState<DiceLuck>('easy');
    const [luckMenuOpen, setLuckMenuOpen] = useState(false);

    const colors = useMemo(() => seatColors(count), [count]);
    const active = seats.slice(0, count);
    const humans = active.filter(s => s.kind === 'human').length;

    const updateSeat = (index: number, patch: Partial<SeatDraft>) =>
        setSeats(prev => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

    const start = () => {
        const config: LocalGameConfig = {
            dynamicDice: diceLuck === 'easy',
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
                                onPress={() => setCount(n)}
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
                            <RNView key={color} style={styles.seatRow}>
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
                        );
                    })}
                    {humans === 0 && (
                        <Text weight="medium" style={styles.hint}>All bots — sit back and watch them play.</Text>
                    )}
                </GlassPanel>

                <GlassPanel intensity="heavy" style={[styles.panel, styles.switchRow]}>
                    <RNView style={{ flex: 1, gap: 4 }}>
                        <Text weight="bold" style={styles.switchTitle}>Dice Luck</Text>
                        <Text weight="regular" style={styles.hint}>{DICE_LUCK[diceLuck].hint}</Text>
                    </RNView>
                    <Menu
                        visible={luckMenuOpen}
                        onDismiss={() => setLuckMenuOpen(false)}
                        anchorPosition="bottom"
                        contentStyle={styles.menu}
                        anchor={
                            <Pressable onPress={() => setLuckMenuOpen(true)} style={styles.select}>
                                <FontAwesome name={DICE_LUCK[diceLuck].icon} size={13} color="#1A1048" />
                                <Text weight="bold" style={styles.selectText}>{DICE_LUCK[diceLuck].label}</Text>
                                <FontAwesome name="chevron-down" size={10} color="#1A1048" />
                            </Pressable>
                        }
                    >
                        {(Object.keys(DICE_LUCK) as DiceLuck[]).map(key => (
                            <Pressable
                                key={key}
                                onPress={() => { setDiceLuck(key); setLuckMenuOpen(false); }}
                                style={[styles.menuItem, diceLuck === key && styles.menuItemActive]}
                            >
                                <RNView style={styles.menuIcon}>
                                    <FontAwesome name={DICE_LUCK[key].icon} size={15} color={diceLuck === key ? '#3B3BE8' : '#6B6F8E'} />
                                </RNView>
                                <RNView style={{ flex: 1 }}>
                                    <Text weight="bold" style={styles.menuTitle}>{DICE_LUCK[key].label}</Text>
                                    <Text weight="medium" style={styles.menuHint}>{DICE_LUCK[key].hint}</Text>
                                </RNView>
                                {diceLuck === key && <FontAwesome name="check" size={13} color="#3B3BE8" />}
                            </Pressable>
                        ))}
                    </Menu>
                </GlassPanel>
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
        fontFamily: 'Hellix-SemiBold',
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
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    switchTitle: { fontSize: 14, color: palette.text },
    select: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
    },
    selectText: { fontSize: 14, color: '#1A1048' },
    menu: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 6, width: 260 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
    menuItemActive: { backgroundColor: '#EEF0FF' },
    menuIcon: { width: 18, alignItems: 'center' },
    menuTitle: { fontSize: 14, color: '#1A1048' },
    menuHint: { fontSize: 11, color: '#6B6F8E', lineHeight: 15, marginTop: 1 },
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
