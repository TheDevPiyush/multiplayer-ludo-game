import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * In place of a feature guests can't use (friends, alerts): what it needs and
 * a way to Profile → "Save your progress". `tone` matches the surface it sits on.
 */
export function AccountRequired({ icon, title, sub, tone = 'dark', onNavigate }: {
    icon: IconName;
    title: string;
    sub: string;
    tone?: 'dark' | 'light';
    /** Runs before going to Profile (e.g. close the modal this sits in). */
    onNavigate?: () => void;
}) {
    const router = useRouter();
    const light = tone === 'light';
    return (
        <RNView style={styles.wrap}>
            <RNView style={[styles.icon, light && styles.iconLight]}>
                <MaterialCommunityIcons name={icon} size={30} color={light ? '#3B3BE8' : '#FFFFFF'} />
            </RNView>
            <Text weight="bold" style={[styles.title, light && styles.titleLight]}>{title}</Text>
            <Text weight="medium" style={[styles.sub, light && styles.subLight]}>{sub}</Text>
            <Pressable
                onPress={() => {
                    onNavigate?.();
                    router.navigate('/(tabs)/profile');
                }}
                style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: 0.97 }] }]}
                accessibilityRole="button"
            >
                <MaterialCommunityIcons name="content-save" size={18} color="#1A1048" />
                <Text weight="bold" style={styles.btnText}>Save your progress</Text>
            </Pressable>
        </RNView>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 40, gap: 8 },
    icon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.14)',
        marginBottom: 6,
    },
    iconLight: { backgroundColor: '#ECEBFF' },
    title: { fontSize: 18, color: '#FFFFFF', textAlign: 'center' },
    titleLight: { color: '#1B1A4A' },
    sub: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.72)', textAlign: 'center' },
    subLight: { color: '#5B5F86' },
    btn: {
        marginTop: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 22,
        height: 48,
        borderRadius: 16,
        backgroundColor: '#FFC83D',
        borderBottomWidth: 4,
        borderBottomColor: '#C7901A',
    },
    btnText: { fontSize: 15, color: '#1A1048' },
});
