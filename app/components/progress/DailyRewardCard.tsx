import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { DailyDay, Progress } from '@/apis/progress-api';
import { RewardedButton } from '@/components/ads/RewardedButton';
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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BROWN = '#5A2E00';

/** This week from the server, or (older server) one worked out from today's place in it. */
function weekOf(progress: Progress): DailyDay[] {
    if (progress.daily.week) return progress.daily.week;
    const today = progress.daily.cycleDay - 1;
    return progress.daily.rewards.map((coins, i) => ({
        date: '',
        coins,
        state: i === today ? (progress.daily.claimedToday ? 'collected' : 'today') : i > today ? 'upcoming' : 'before',
    }));
}

function DayTile({ day, index, isToday }: { day: DailyDay; index: number; isToday: boolean }) {
    const sunday = index === 6;
    return (
        <View
            style={[
                styles.day,
                sunday && styles.dayBig,
                day.state === 'collected' && styles.dayCollected,
                day.state === 'missed' && styles.dayMissed,
                isToday && styles.dayToday,
            ]}
            accessibilityLabel={`${WEEKDAYS[index]}: ${day.coins} coins, ${day.state === 'today' ? 'ready to collect' : day.state}`}
        >
            <Text weight="bold" style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{isToday ? 'Today' : WEEKDAYS[index]}</Text>
            {day.state === 'collected' ? (
                <View style={styles.tick}>
                    <MaterialCommunityIcons name="check-bold" size={12} color="#FFFFFF" />
                </View>
            ) : day.state === 'missed' ? (
                <MaterialCommunityIcons name="close-circle-outline" size={18} color="rgba(90,46,0,0.45)" />
            ) : (
                <Text weight="bold" style={[styles.dayCoins, isToday && styles.dayLabelToday, day.state === 'before' && styles.dim]}>{day.coins}</Text>
            )}
        </View>
    );
}

/**
 * Home's daily reward, always there: this week Monday to Sunday, with a tick on each day
 * collected and a mark on each day missed. Rewards grow towards Sunday; a missed day only
 * loses its own coins.
 */
export function DailyRewardCard({ progress, onClaim, onError }: Props) {
    const [busy, setBusy] = useState(false);
    const week = weekOf(progress);
    const todayIndex = progress.daily.cycleDay - 1;
    const today = week[todayIndex];
    const ready = today?.state === 'today';
    const tomorrow = week[todayIndex + 1];
    const missedIndex = progress.daily.recoverable ? week.findIndex(d => d.date === progress.daily.recoverable) : -1;
    const missed = missedIndex >= 0 ? week[missedIndex] : undefined;

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

    const sub = ready
        ? progress.streak > 0 ? `${progress.streak}-day streak · keep it going` : 'Bigger rewards towards Sunday'
        : tomorrow ? `Come back tomorrow for ${tomorrow.coins} coins` : 'A new week starts tomorrow';

    return (
        <GameTile colors={['#FFD54A', '#FFAA1D']} edge="#C27400" radius={22} depth={5} contentStyle={styles.card}>
            <View style={styles.top}>
                <View style={styles.gift}>
                    <MaterialCommunityIcons name={ready ? 'gift' : 'gift-open'} size={26} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text weight="bold" style={styles.title}>Daily reward</Text>
                    <Text weight="medium" style={styles.sub} numberOfLines={1}>{sub}</Text>
                </View>
                {ready ? (
                    <Pressable
                        onPress={collect}
                        disabled={busy}
                        style={({ pressed }) => [styles.collect, pressed && { transform: [{ scale: 0.95 }] }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Collect ${today.coins} coins`}
                    >
                        {busy ? <ActivityIndicator size="small" color="#C27400" /> : (
                            <>
                                <Coin size={16} />
                                <Text weight="bold" style={styles.collectText}>{today.coins}</Text>
                            </>
                        )}
                    </Pressable>
                ) : (
                    <View style={styles.done} accessibilityLabel="Collected today">
                        <MaterialCommunityIcons name="check-bold" size={15} color="#1F8A4C" />
                        <Text weight="bold" style={styles.doneText}>Done</Text>
                    </View>
                )}
            </View>
            <View style={styles.days}>
                {week.map((day, i) => <DayTile key={i} day={day} index={i} isToday={i === todayIndex} />)}
            </View>
            {/* Rewarded ads, always optional: today's coins once more, or one missed day back a week. */}
            {(progress.daily.bonusReady && today) || missed ? (
                <View style={styles.offers}>
                    {progress.daily.bonusReady && today && (
                        <RewardedButton placement="daily_bonus" customData={`daily_bonus:${today.date}`} coins={today.coins} label="Double today" tone="gold" />
                    )}
                    {missed && (
                        <RewardedButton
                            placement="daily_missed"
                            customData={`daily_missed:${missed.date}`}
                            coins={missed.coins}
                            label={`Get ${WEEKDAYS[missedIndex]} back`}
                            tone="gold"
                        />
                    )}
                </View>
            ) : null}
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
    title: { fontSize: 17, color: BROWN },
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
    collectText: { fontSize: 15, color: BROWN },
    done: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.55)',
    },
    doneText: { fontSize: 13, color: '#1F8A4C' },
    days: { flexDirection: 'row', gap: 5 },
    offers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    day: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 50,
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
    dayBig: { flex: 1.3 },
    dayCollected: { backgroundColor: 'rgba(255,255,255,0.6)' },
    dayMissed: { backgroundColor: 'rgba(255,255,255,0.18)' },
    dayToday: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#C24A00' },
    dayLabel: { fontSize: 9, color: 'rgba(90,46,0,0.7)' },
    dayCoins: { fontSize: 12, color: BROWN },
    dayLabelToday: { color: '#C24A00' },
    dim: { opacity: 0.45 },
    tick: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#1F9D55', alignItems: 'center', justifyContent: 'center' },
});
