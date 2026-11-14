import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { Mission, Progress } from '@/apis/progress-api';
import { Text } from '@/components/Themed';
import { playEffect } from '@/util/audio';
import { haptic } from '@/util/feedback';
import { Coin } from './Coin';

type ClaimResult = { ok: true; coins: number } | { ok: false; error: string };

type Props = {
    progress: Progress;
    onClaim: (missionId: string) => Promise<ClaimResult>;
    onError: (message: string) => void;
};

function MissionRow({ mission, onClaim, onError }: { mission: Mission; onClaim: Props['onClaim']; onError: Props['onError'] }) {
    const [busy, setBusy] = useState(false);
    const done = mission.progress >= mission.target;
    const pct = Math.min(100, Math.round((mission.progress / mission.target) * 100));

    const claim = async () => {
        if (busy) return;
        setBusy(true);
        const r = await onClaim(mission.id);
        setBusy(false);
        if (r.ok) {
            haptic.success();
            playEffect('home');
        } else {
            onError(r.error);
        }
    };

    return (
        <View style={styles.row}>
            <View style={{ flex: 1, gap: 6 }}>
                <Text weight="semiBold" style={[styles.title, mission.claimed && styles.titleDone]} numberOfLines={1}>
                    {mission.title}
                </Text>
                <View style={styles.track}>
                    <View style={[styles.fill, { width: `${pct}%` }, done && styles.fillDone]} />
                </View>
            </View>
            <Text weight="semiBold" style={styles.count}>{mission.progress}/{mission.target}</Text>
            {mission.claimed ? (
                <View style={[styles.reward, styles.claimed]} accessibilityLabel="Collected">
                    <MaterialCommunityIcons name="check-bold" size={16} color="#37BD6A" />
                </View>
            ) : done ? (
                <Pressable
                    onPress={claim}
                    disabled={busy}
                    style={({ pressed }) => [styles.reward, styles.claim, pressed && { transform: [{ scale: 0.95 }] }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Collect ${mission.coins} coins`}
                >
                    {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                        <>
                            <Coin size={14} />
                            <Text weight="bold" style={styles.claimText}>{mission.coins}</Text>
                        </>
                    )}
                </Pressable>
            ) : (
                <View style={styles.reward}>
                    <Coin size={14} />
                    <Text weight="bold" style={styles.rewardText}>{mission.coins}</Text>
                </View>
            )}
        </View>
    );
}

/** Home's "Today" panel: the day's three missions, and the streak once today's reward is in. */
export function MissionsPanel({ progress, onClaim, onError }: Props) {
    const ready = progress.missions.filter(m => m.progress >= m.target && !m.claimed).length;
    return (
        <View style={styles.panel}>
            <View style={styles.head}>
                <Text weight="bold" style={styles.heading}>Today's missions</Text>
                {ready > 0 && (
                    <View style={styles.readyChip}>
                        <Text weight="bold" style={styles.readyText}>{ready} to collect</Text>
                    </View>
                )}
                <View style={{ flex: 1 }} />
                {progress.streak > 0 && (
                    <View style={styles.streak}>
                        <MaterialCommunityIcons name="fire" size={14} color="#FF8A3D" />
                        <Text weight="bold" style={styles.streakText}>{progress.streak}</Text>
                    </View>
                )}
            </View>
            {progress.missions.map(m => <MissionRow key={m.id} mission={m} onClaim={onClaim} onError={onError} />)}
        </View>
    );
}

const styles = StyleSheet.create({
    panel: {
        borderRadius: 22,
        padding: 14,
        gap: 12,
        backgroundColor: 'rgba(10, 8, 60, 0.24)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heading: { fontSize: 15, color: '#FFFFFF' },
    readyChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#37BD6A' },
    readyText: { fontSize: 10, color: '#FFFFFF' },
    streak: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: 'rgba(255,138,61,0.16)',
    },
    streakText: { fontSize: 12, color: '#FFB27A' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 13, color: '#FFFFFF' },
    titleDone: { color: 'rgba(255,255,255,0.55)' },
    track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
    fill: { height: 6, borderRadius: 3, backgroundColor: '#FFCB3D' },
    fillDone: { backgroundColor: '#37BD6A' },
    count: { fontSize: 11, color: 'rgba(255,255,255,0.7)', minWidth: 30, textAlign: 'right' },
    reward: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        width: 64,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    rewardText: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
    claim: { backgroundColor: '#37BD6A' },
    claimText: { fontSize: 12, color: '#FFFFFF' },
    claimed: { backgroundColor: 'rgba(55,189,106,0.14)' },
});
