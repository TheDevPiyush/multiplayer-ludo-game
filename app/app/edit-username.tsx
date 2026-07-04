import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppDialog from '@/components/Dialog';
import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { updateUsername } from '@/apis/user-api';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/util/supabase-client';

const palette = Colors.dark;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function EditUsernameScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user, refresh } = useCurrentUser();
    const [value, setValue] = useState('');

    useEffect(() => {
        if (user?.username) setValue(user.username);
    }, [user?.username]);
    const [saving, setSaving] = useState(false);
    const [dialog, setDialog] = useState({ visible: false, title: '', message: '' });

    const normalized = value.trim().toLowerCase();
    const valid = USERNAME_RE.test(normalized);
    const unchanged = normalized === user?.username;

    const save = useCallback(async () => {
        if (!valid || unchanged) return;
        setSaving(true);
        try {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) {
                setDialog({ visible: true, title: 'Not signed in', message: 'Please log in again.' });
                return;
            }
            const result = await updateUsername(token, normalized);
            if (!result.ok) {
                setDialog({ visible: true, title: 'Could not update', message: result.error });
                return;
            }
            await refresh();
            router.back();
        } finally {
            setSaving(false);
        }
    }, [valid, unchanged, normalized, refresh, router]);

    return (
        <KeyboardAvoidingView
            style={[styles.screen, { paddingTop: insets.top + 8 }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <RNView style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
                    <FontAwesome name="chevron-left" size={14} color={palette.mutedText} />
                </TouchableOpacity>
                <Text weight="bold" style={styles.title}>Edit username</Text>
                <RNView style={{ width: 36 }} />
            </RNView>

            <GlassPanel intensity="heavy" style={styles.panel}>
                <Text weight="medium" style={styles.label}>Username</Text>
                <RNView style={styles.inputWrap}>
                    <Text weight="semiBold" style={styles.at}>@</Text>
                    <TextInput
                        value={value}
                        onChangeText={t => setValue(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={20}
                        placeholder="your_name"
                        placeholderTextColor={palette.dimText}
                        style={styles.input}
                    />
                </RNView>
                <Text weight="regular" style={styles.hint}>
                    3–20 characters · lowercase letters, numbers, underscore · must be unique
                </Text>
                {!valid && value.length > 0 ? (
                    <Text weight="medium" style={styles.error}>Invalid format</Text>
                ) : null}
            </GlassPanel>

            <TouchableOpacity
                style={[styles.saveBtn, (!valid || unchanged || saving) && styles.saveBtnDisabled]}
                disabled={!valid || unchanged || saving}
                onPress={save}
                activeOpacity={0.85}
            >
                {saving ? (
                    <ActivityIndicator color="#1A1048" />
                ) : (
                    <Text weight="bold" style={styles.saveText}>Save username</Text>
                )}
            </TouchableOpacity>

            <AppDialog
                visible={dialog.visible}
                title={dialog.title}
                message={dialog.message}
                onDismiss={() => setDialog(d => ({ ...d, visible: false }))}
                actions={[{ label: 'OK', onPress: () => setDialog(d => ({ ...d, visible: false })) }]}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingHorizontal: 20,
        gap: 16,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
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
    title: {
        fontSize: 17,
        color: palette.text,
    },
    panel: {
        padding: 20,
        gap: 10,
    },
    label: {
        fontSize: 12,
        color: palette.mutedText,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette.glassBorder,
        paddingHorizontal: 14,
        height: 52,
    },
    at: {
        fontSize: 18,
        color: palette.mutedText,
        marginRight: 4,
    },
    input: {
        flex: 1,
        fontSize: 17,
        color: palette.text,
        fontFamily: 'Hellix-SemiBold',
    },
    hint: {
        fontSize: 12,
        color: palette.dimText,
        lineHeight: 18,
    },
    error: {
        fontSize: 12,
        color: palette.danger,
    },
    saveBtn: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveBtnDisabled: {
        opacity: 0.45,
    },
    saveText: {
        fontSize: 15,
        color: '#1A1048',
    },
});
