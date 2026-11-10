import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { GameReward } from '@/apis/progress-api';
import { Text } from '@/components/Themed';
import { Coin } from './Coin';

function inviteText({ role, names }: NonNullable<GameReward['invite']>): string {
    const list = names.map(n => `@${n}`);
    if (role === 'joined') return `your first game with ${list[0]}`;
    return `for bringing ${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]}`;
}

/** What a game paid, on the result screen: coins, XP, a level-up and missions it completed. */
export function GameRewardLine({ reward }: { reward: GameReward }) {
    return (
        <Animated.View entering={FadeIn.duration(300)} style={styles.wrap}>
            <View style={styles.row}>
                {reward.coins > 0 && (
                    <View style={styles.chip}>
                        <Coin size={16} />
                        <Text weight="bold" style={styles.chipText}>+{reward.coins}</Text>
                    </View>
                )}
                <View style={styles.chip}>
                    <Text weight="bold" style={styles.xp}>XP</Text>
                    <Text weight="bold" style={styles.chipText}>+{reward.xp}</Text>
                </View>
            </View>
            {reward.levelsGained > 0 && (
                <View style={styles.line}>
                    <MaterialCommunityIcons name="arrow-up-bold-circle" size={16} color="#FFCB3D" />
                    <Text weight="bold" style={styles.levelUp}>Level {reward.level} reached!</Text>
                </View>
            )}
            {reward.invite && (
                <View style={styles.line}>
                    <MaterialCommunityIcons name="account-multiple-plus" size={16} color="#FFCB3D" />
                    <Text weight="bold" style={styles.levelUp} numberOfLines={2}>
                        +{reward.invite.coins} invite bonus · {inviteText(reward.invite)}
                    </Text>
                </View>
            )}
            {reward.missionsDone.map(title => (
                <View key={title} style={styles.line}>
                    <MaterialCommunityIcons name="check-circle" size={15} color="#37BD6A" />
                    <Text weight="medium" style={styles.mission} numberOfLines={1}>{title} · collect on Home</Text>
                </View>
            ))}
            {reward.capped && (
                <Text weight="medium" style={styles.note}>You've reached today's coin limit for games. XP still counts.</Text>
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', gap: 8, alignSelf: 'stretch' },
    row: { flexDirection: 'row', gap: 8 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    chipText: { fontSize: 14, color: '#FFFFFF' },
    xp: { fontSize: 11, color: '#8FB4FF', letterSpacing: 0.5 },
    line: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
    levelUp: { flexShrink: 1, fontSize: 13, color: '#FFCB3D', textAlign: 'center' },
    mission: { flexShrink: 1, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
    note: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
});
