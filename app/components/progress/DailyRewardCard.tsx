import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { Progress } from '@/apis/progress-api';
import { GameTile } from '@/components/GameTile';
import { Text } from '@/components/Themed';
import { playEffect } from '@/util/audio';
import { haptic } from '@/util/feedback';
import { Coin } from './Coin';

type Props = {
    progress: Progress;
    onClaim: () => Promise<{ ok: true; coins: number } | { ok: false; error: string }>;
    onError: (message: string) => void;
};

/** Home's daily reward, shown while today's is waiting: the 7-day cycle and a Collect button. */
export function DailyRewardCard({ progress, onClaim, onError }: Props) {
    const [busy, setBusy] = useState(false);
    const { cycleDay, rewards } = progress.daily;
    const coins = rewards[cycleDay - 1] ?? 0;

    const collect = async () => {
        if (busy) return;
        setBusy(true);
        const r = await onClaim();
        setBusy(false);
        if (r.ok) {
            haptic.success();
            playEffect('home');
        } else {
            onError(r.error);
        }
    };

    return (
        <GameTile colors={['#FFD54A', '#FFAA1D']} edge="#C27400" radius={22} depth={5} contentStyle={styles.card}>
            <View style={styles.top}>
                <View style={styles.gift}>
                    <MaterialCommunityIcons name="gift" size={26} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.title}>Daily reward</Text>
                    <Text weight="medium" style={styles.sub} numberOfLines={1}>
                        {progress.streak > 0 ? `${progress.streak}-day streak · don't break it` : 'Come back daily for bigger rewards'}
                    </Text>
                </View>
                <Pressable
                    onPress={collect}
                    disabled={busy}
                    style={({ pressed }) => [styles.collect, pressed && { transform: [{ scale: 0.95 }] }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Collect ${coins} coins`}
                >
                    {busy ? <ActivityIndicator size="small" color="#C27400" /> : (
                        <>
                            <Coin size={16} />
                            <Text weight="bold" style={styles.collectText}>{coins}</Text>
                        </>
                    )}
                </Pressable>
            </View>
            <View style={styles.days}>
                {rewards.map((r, i) => {
                    const day = i + 1;
                    const done = day < cycleDay;
                    const today = day === cycleDay;
                    return (
                        <View key={day} style={[styles.day, done && styles.dayDone, today && styles.dayToday, day === 7 && styles.dayBig]}>
                            <Text weight="bold" style={[styles.dayLabel, today && styles.dayLabelToday]}>Day {day}</Text>
                            {done
                                ? <MaterialCommunityIcons name="check-bold" size={14} color="rgba(120,60,0,0.55)" />
                                : <Text weight="bold" style={[styles.dayCoins, today && styles.dayLabelToday]}>{r}</Text>}
                        </View>
                    );
                })}
            </View>
        </GameTile>
    );
}

const styles = StyleSheet.create({
    card: { padding: 14, gap: 12 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    gift: {
        width: 46,
        height: 46,
        borderRadius: 16,
        backgroundColor: 'rgba(194,116,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { fontSize: 17, color: '#5A2E00' },
    sub: { fontSize: 12, color: 'rgba(90,46,0,0.75)', marginTop: 1 },
    collect: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minWidth: 76,
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
    },
    collectText: { fontSize: 15, color: '#5A2E00' },
    days: { flexDirection: 'row', gap: 5 },
    day: {
        flex: 1,
        alignItems: 'center',
        gap: 2,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
    dayBig: { flex: 1.3 },
    dayDone: { backgroundColor: 'rgba(255,255,255,0.18)' },
    dayToday: { backgroundColor: '#FFFFFF' },
    dayLabel: { fontSize: 9, color: 'rgba(90,46,0,0.7)' },
    dayCoins: { fontSize: 12, color: '#5A2E00' },
    dayLabelToday: { color: '#C24A00' },
});
