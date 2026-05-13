import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    ScrollView,
    StyleSheet,
    Switch,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createRoom } from '@/apis/game-api';
import { AppButton } from '@/components/AppButton';
import AppDialog from '@/components/Dialog';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { supabase } from '@/util/supabase-client';
import { setActiveRoom } from '@/util/active-room';
import { ActivityIndicator } from 'react-native-paper';

const palette = Colors['dark'];

const PLAYER_OPTIONS = [2, 3, 4];

/** P1→red … P4→yellow by join order; 2×2 grid matches board quadrants */
const SEAT_COLORS = [
    { slot: 1 as const, color: '#D94444' },
    { slot: 2 as const, color: '#3B7DD8' },
    { slot: 3 as const, color: '#2DAA5C' },
    { slot: 4 as const, color: '#E8A520' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
    return (
        <Text weight="semiBold" style={styles.sectionLabel}>{label}</Text>
    );
}

function SettingRow({ label, sublabel, children }: {
    label: string; sublabel?: string; children: React.ReactNode;
}) {
    return (
        <RNView style={styles.settingRow}>
            <RNView style={{ flex: 1, gap: 2 }}>
                <Text weight="semiBold" style={styles.settingLabel}>{label}</Text>
                {sublabel && <Text weight="medium" style={styles.settingSubLabel}>{sublabel}</Text>}
            </RNView>
            {children}
        </RNView>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CreateRoomScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [maxPlayers, setMaxPlayers] = useState(4);
    const [isPrivate, setIsPrivate] = useState(true);
    const [voiceEnable, setVoiceEnable] = useState(true);
    const [loading, setLoading] = useState(false);
    const [dialog, setDialog] = useState({
        visible: false,
        title: '',
        message: '',
    });

    function hideDialog() {
        setDialog({ visible: false, title: '', message: '' });
    }

    function showDialog(title: string, message: string) {
        setDialog({ visible: true, title, message });
    }

    // Animations
    const fadeHeader = useRef(new Animated.Value(0)).current;
    const slideHeader = useRef(new Animated.Value(-16)).current;
    const fadeContent = useRef(new Animated.Value(0)).current;
    const slideContent = useRef(new Animated.Value(24)).current;

    useEffect(() => {
        Animated.stagger(100, [
            Animated.parallel([
                Animated.timing(fadeHeader, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(slideHeader, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.timing(fadeContent, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(slideContent, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
        ]).start();
    }, []);

    const handleCreate = async () => {
        try {
            setLoading(true);
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (!accessToken) {
                showDialog('Sign in required', 'Please sign in to create a room.');
                return;
            }

            const result = await createRoom(accessToken, {
                maxPlayers,
                isPrivate,
                voiceEnabled: voiceEnable,
            });

            if (!result.ok) {
                showDialog('Could not create room', result.error);
                return;
            }

            const gameCode = result.data.data.gameCode;
            const maxPlayers_ = result.data.data.maxPlayers;
            const roomId = result.data.data.id;

            await setActiveRoom({
                roomId,
                gameCode,
                maxPlayers: maxPlayers_,
                screen: 'lobby',
            });

            router.push({
                pathname: '/(game)/lobby',
                params: { gameCode, maxPlayers_, roomId },
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Could not create room.';
            showDialog('Error', msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <RNView style={[styles.screen, { backgroundColor: palette.background }]}>

            {/* Ambient blobs */}
            <RNView style={[styles.blob, { top: -50, right: -50, backgroundColor: '#2DAA5C' }]} />
            <RNView style={[styles.blob, { bottom: -50, left: -50, backgroundColor: '#D94444' }]} />

            {/* ── Header ── */}
            <Animated.View style={[
                styles.header,
                { paddingTop: insets.top + 12, opacity: fadeHeader, transform: [{ translateY: slideHeader }] },
            ]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
                    <FontAwesome name="chevron-left" size={14} color={palette.mutedText} />
                </TouchableOpacity>
                <Text weight="bold" style={styles.headerTitle}>Create Room</Text>
                <RNView style={{ width: 36 }} />
            </Animated.View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View style={[styles.content, { opacity: fadeContent, transform: [{ translateY: slideContent }] }]}>

                    {/* ── Player Count ── */}
                    <SectionLabel label="PLAYERS" />
                    <RNView style={styles.card}>
                        <RNView style={styles.playerCountRow}>
                            {PLAYER_OPTIONS.map((n) => {
                                const active = maxPlayers === n;
                                return (
                                    <TouchableOpacity
                                        key={n}
                                        style={[styles.countBtn, active && styles.countBtnActive]}
                                        activeOpacity={0.8}
                                        onPress={() => setMaxPlayers(n)}
                                    >
                                        <Text
                                            weight="bold"
                                            style={[styles.countBtnText, active && styles.countBtnTextActive]}
                                        >
                                            {n}
                                        </Text>
                                        <Text
                                            weight="medium"
                                            style={[styles.countBtnSub, active && { color: '#D94444' }]}
                                        >
                                            {n === 2 ? 'Duel' : n === 3 ? 'Trio' : 'Full'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </RNView>

                        {/* 2×2 seat colors — circles + Player_N - 0; unused quadrants faded */}
                        <RNView style={styles.seatColorsBlock}>
                            <RNView style={styles.colorGrid}>
                                {[0, 1].map((row) => (
                                    <RNView key={row} style={styles.colorGridRow}>
                                        {[0, 1].map((col) => {
                                            const idx = row * 2 + col;
                                            const seat = SEAT_COLORS[idx];
                                            const inGame = idx < maxPlayers;
                                            return (
                                                <RNView
                                                    key={seat.slot}
                                                    style={[styles.gridCellCompact, !inGame && styles.gridCellCompactOff]}
                                                >
                                                    <RNView
                                                        style={[
                                                            styles.colorToken,
                                                            { backgroundColor: seat.color },
                                                            !inGame && styles.colorTokenGhost,
                                                        ]}
                                                    >
                                                        <RNView style={[styles.colorTokenInner, !inGame && styles.colorTokenInnerMuted]} />
                                                    </RNView>
                                                    <Text
                                                        weight="medium"
                                                        style={[styles.seatPidLabel, !inGame && styles.seatPidLabelMuted]}
                                                    >
                                                        Player_{seat.slot}
                                                    </Text>
                                                </RNView>
                                            );
                                        })}
                                    </RNView>
                                ))}
                            </RNView>
                        </RNView>
                    </RNView>

                    {/* ── Settings ── */}
                    <SectionLabel label="SETTINGS" />
                    <RNView style={styles.card}>
                        <SettingRow
                            label="Private Room"
                            sublabel="Only joinable via room code"
                        >
                            <Switch
                                value={isPrivate}
                                onValueChange={setIsPrivate}
                                trackColor={{ false: palette.elevated, true: '#D94444' + '80' }}
                                thumbColor={isPrivate ? '#D94444' : palette.mutedText}
                            />
                        </SettingRow>

                        <RNView style={styles.separator} />

                        <SettingRow
                            label="Voice Chat"
                            sublabel="Talk with players in-game"
                        >
                            <Switch
                                value={voiceEnable}
                                onValueChange={setVoiceEnable}
                                trackColor={{ false: palette.elevated, true: '#2DAA5C' + '80' }}
                                thumbColor={'#2DAA5C'}
                            />
                        </SettingRow>
                    </RNView>

                    {/* ── Info card ── */}
                    <RNView style={styles.infoCard}>
                        <FontAwesome name="info-circle" size={13} color={palette.mutedText} />
                        <Text weight="medium" style={styles.infoText}>
                            A unique room code will be generated after creation. Share it with friends to invite them.
                        </Text>
                    </RNView>

                </Animated.View>
            </ScrollView>

            {/* ── Create button — fixed bottom ── */}
            <Animated.View style={[
                styles.footer,
                { paddingBottom: insets.bottom + 16, opacity: fadeContent },
            ]}>
                <AppButton
                    label={loading ? 'Creating...' : 'Create Room'}
                    onPress={handleCreate}
                    disabled={loading}
                    leftIcon={
                        loading
                            ?
                            <ActivityIndicator />
                            :
                            <FontAwesome
                                name={loading ? 'spinner' : 'plus'}
                                size={15}
                                color="#fff"
                            />
                    }
                    style={[
                        { backgroundColor: palette.danger, borderColor: palette.danger },
                        loading && { opacity: 0.6 },
                    ]}
                    labelStyle={{ color: '#fff' }}
                />
            </Animated.View>

            <AppDialog
                visible={dialog.visible}
                title={dialog.title}
                message={dialog.message}
                onDismiss={hideDialog}
            />
        </RNView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    screen: { flex: 1 },
    blob: {
        position: 'absolute',
        width: 180, height: 180,
        borderRadius: 90,
        opacity: 0.05,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: palette.border,
    },
    backBtn: {
        width: 36, height: 36,
        borderRadius: 10,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        color: palette.text,
        letterSpacing: 0.2,
    },

    // Scroll
    scroll: {
        paddingHorizontal: 16,
        paddingTop: 20,
    },
    content: { gap: 10 },

    sectionLabel: {
        fontSize: 10,
        color: palette.dimText,
        letterSpacing: 1.5,
        marginLeft: 4,
        marginBottom: 2,
        marginTop: 10,
    },

    // Card
    card: {
        backgroundColor: palette.card,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        overflow: 'hidden',
    },

    // Player count
    playerCountRow: {
        flexDirection: 'row',
        padding: 12,
        gap: 10,
    },
    countBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: palette.elevated,
        borderWidth: 1,
        borderColor: palette.border,
        gap: 4,
    },
    countBtnActive: {
        backgroundColor: '#D9444415',
        borderColor: '#D9444450',
    },
    countBtnText: {
        fontSize: 22,
        color: palette.mutedText,
    },
    countBtnTextActive: {
        color: '#D94444',
    },
    countBtnSub: {
        fontSize: 10,
        color: palette.dimText,
        letterSpacing: 0.5,
    },

    // Seat colors 2×2 (circle tokens + Player_N - 0)
    seatColorsBlock: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: palette.border,
    },
    colorGrid: {
        gap: 8,
    },
    colorGridRow: {
        flexDirection: 'row',
        gap: 8,
    },
    gridCellCompact: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: palette.elevated,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
    },
    gridCellCompactOff: {
        opacity: 0.42,
        borderStyle: 'dashed',
    },
    colorToken: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    colorTokenInner: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: 'rgba(255,255,255,0.28)',
    },
    colorTokenInnerMuted: {
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    colorTokenGhost: {
        opacity: 0.45,
        borderStyle: 'dashed',
        borderColor: palette.border,
    },
    seatPidLabel: {
        flex: 1,
        fontSize: 13,
        color: palette.mutedText,
        letterSpacing: 0.15,
        fontVariant: ['tabular-nums'],
    },
    seatPidLabelMuted: {
        color: palette.dimText,
    },

    // Setting row
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
    },
    settingLabel: {
        fontSize: 14,
        color: palette.text,
    },
    settingSubLabel: {
        fontSize: 11,
        color: palette.mutedText,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: palette.border,
        marginLeft: 16,
    },

    // Info card
    infoCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: palette.elevated,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        padding: 14,
        marginTop: 6,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: palette.mutedText,
        lineHeight: 18,
    },

    // Footer
    footer: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: palette.background,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: palette.border,
    },
});