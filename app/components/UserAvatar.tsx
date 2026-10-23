import { Image, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';

const AVATAR_COLORS = ['#FF5A5F', '#4F46F0', '#22C55E', '#FF9F1C', '#2E86FF', '#C026D3', '#14B8A6'];

function colorFor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

/** Round avatar: the profile picture, or initials on a colour picked from the user id. */
export function UserAvatar({
    user,
    size = 44,
    online,
}: {
    user: { id: string; username: string; avatarUrl: string | null };
    size?: number;
    /** Shows a green / grey presence dot when set. */
    online?: boolean;
}) {
    const dot = Math.max(10, Math.round(size * 0.28));
    return (
        <RNView style={{ width: size, height: size }}>
            {user.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
            ) : (
                <RNView style={[styles.fallback, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(user.id) }]}>
                    <Text weight="bold" style={{ color: '#FFFFFF', fontSize: size * 0.36 }}>
                        {user.username.slice(0, 2).toUpperCase()}
                    </Text>
                </RNView>
            )}
            {online !== undefined && (
                <RNView
                    style={[
                        styles.dot,
                        { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: online ? '#22C55E' : '#B8BCD6' },
                    ]}
                />
            )}
        </RNView>
    );
}

const styles = StyleSheet.create({
    fallback: { alignItems: 'center', justifyContent: 'center' },
    dot: { position: 'absolute', right: -1, bottom: -1, borderWidth: 2, borderColor: '#FFFFFF' },
});
