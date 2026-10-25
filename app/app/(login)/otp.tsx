import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
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
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/hooks/useAuth';
import { leaveGuest, LEAVE_GUEST_DIALOG, takenDialog } from '@/util/guest';

const palette = Colors.dark;

/** Must match Supabase → Auth → Providers → Email → "Email OTP length". */
const OTP_LENGTH = Number(process.env.EXPO_PUBLIC_OTP_LENGTH ?? 6);
const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type DialogAction = { label: string; onPress: () => void };
type LocalDialog = { title: string; message: string; actions: DialogAction[] } | null;

export default function OtpLoginScreen() {
    return <EmailCodeScreen mode="signin" />;
}

/**
 * Email + code, in two modes: `signin` signs in (or up); `link` saves a guest's
 * progress by attaching the email to the guest account (app/save-progress.tsx).
 */
export function EmailCodeScreen({ mode }: { mode: 'signin' | 'link' }) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { sendEmailOtp, verifyEmailOtp, startEmailLink, verifyEmailLink, loading, dialog, hideDialog } = useAuth();
    const linking = mode === 'link';
    /** Dialogs with choices (taken email, leaving the guest, saved). */
    const [choice, setChoice] = useState<LocalDialog>(null);
    const closeChoice = () => setChoice(null);

    const [step, setStep] = useState<'email' | 'code'>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [resendIn, setResendIn] = useState(0);
    const codeInputRef = useRef<TextInput>(null);

    const emailValid = EMAIL_RE.test(email.trim());
    const busy = loading.otpLoading;

    useEffect(() => {
        if (resendIn <= 0) return;
        const t = setTimeout(() => setResendIn(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendIn]);

    const confirmLeaveGuest = () =>
        setChoice({
            ...LEAVE_GUEST_DIALOG,
            actions: [
                { label: 'Cancel', onPress: closeChoice },
                { label: 'Leave guest', onPress: () => { closeChoice(); void leaveGuest(); } },
            ],
        });

    const sendCode = async () => {
        if (!emailValid || busy) return;
        let ok: boolean;
        if (linking) {
            const res = await startEmailLink(email);
            if (!res.ok && res.reason === 'taken') {
                setChoice({
                    ...takenDialog('email'),
                    actions: [
                        { label: 'Sign in to it', onPress: confirmLeaveGuest },
                        { label: 'Use another email', onPress: closeChoice },
                    ],
                });
            }
            ok = res.ok;
        } else {
            ok = await sendEmailOtp(email);
        }
        if (!ok) return;
        setCode('');
        setStep('code');
        setResendIn(RESEND_SECONDS);
        setTimeout(() => codeInputRef.current?.focus(), 250);
    };

    const verify = async (value = code) => {
        if (value.length !== OTP_LENGTH || busy) return;
        // Signing in: the root auth listener navigates into the app on success.
        const ok = linking ? await verifyEmailLink(email, value) : await verifyEmailOtp(email, value);
        if (ok && linking) {
            setChoice({
                title: 'Progress saved',
                message: `Your guest progress now belongs to ${email.trim().toLowerCase()}. Sign in with it on any phone.`,
                actions: [{ label: 'Done', onPress: () => { closeChoice(); router.back(); } }],
            });
            return;
        }
        if (!ok) {
            setCode('');
            codeInputRef.current?.focus();
        }
    };

    const onCodeChange = (text: string) => {
        const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
        setCode(digits);
        if (digits.length === OTP_LENGTH) void verify(digits);
    };

    const goBack = () => {
        if (step === 'code') {
            setStep('email');
            setCode('');
            return;
        }
        router.back();
    };

    return (
        <KeyboardAvoidingView
            style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <RNView style={styles.topBar}>
                <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.8}>
                    <FontAwesome name="chevron-left" size={14} color={palette.mutedText} />
                </TouchableOpacity>
                <Text weight="bold" style={styles.topTitle}>
                    {step === 'code' ? 'Verify email' : linking ? 'Save your progress' : 'Sign in with email'}
                </Text>
                <RNView style={{ width: 36 }} />
            </RNView>

            <RNView style={styles.hero}>
                <RNView style={styles.heroIcon}>
                    <FontAwesome name={step === 'email' ? 'envelope' : 'lock'} size={22} color="#FFFFFF" />
                </RNView>
                <Text weight="bold" style={styles.heading}>
                    {step === 'email' ? "What's your email?" : 'Enter the code'}
                </Text>
                {step === 'email' ? (
                    <Text weight="medium" style={styles.subheading}>
                        {linking
                            ? `Your stats and history move to this email. We'll send a ${OTP_LENGTH}-digit code to confirm it's yours.`
                            : `We'll send you a ${OTP_LENGTH}-digit code. No password needed.`}
                    </Text>
                ) : (
                    <Text weight="medium" style={styles.subheading}>
                        Sent to <Text weight="semiBold" style={styles.emailText}>{email.trim().toLowerCase()}</Text>
                        {'  '}
                        <Text weight="semiBold" style={styles.link} onPress={goBack}>Change</Text>
                    </Text>
                )}
            </RNView>

            {step === 'email' ? (
                <GlassPanel intensity="heavy" style={styles.panel}>
                    <Text weight="medium" style={styles.label}>Email</Text>
                    <RNView style={styles.inputWrap}>
                        <FontAwesome name="at" size={15} color={palette.mutedText} />
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            onSubmitEditing={sendCode}
                            autoFocus
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="email"
                            keyboardType="email-address"
                            textContentType="emailAddress"
                            returnKeyType="send"
                            placeholder="you@example.com"
                            placeholderTextColor={palette.dimText}
                            style={styles.input}
                        />
                    </RNView>
                </GlassPanel>
            ) : (
                <Pressable onPress={() => codeInputRef.current?.focus()} style={styles.codeRow}>
                    {Array.from({ length: OTP_LENGTH }).map((_, i) => {
                        const digit = code[i] ?? '';
                        const active = i === Math.min(code.length, OTP_LENGTH - 1) && !busy;
                        return (
                            <RNView
                                key={i}
                                style={[styles.codeBox, digit ? styles.codeBoxFilled : null, active ? styles.codeBoxActive : null]}
                            >
                                <Text weight="bold" style={styles.codeDigit}>{digit}</Text>
                            </RNView>
                        );
                    })}
                    {/* One hidden input drives all boxes — supports paste and OS code autofill. */}
                    <TextInput
                        ref={codeInputRef}
                        value={code}
                        onChangeText={onCodeChange}
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                        maxLength={OTP_LENGTH}
                        caretHidden
                        style={styles.hiddenInput}
                    />
                </Pressable>
            )}

            <RNView style={{ flex: 1 }} />

            {step === 'email' ? (
                <TouchableOpacity
                    style={[styles.primaryBtn, (!emailValid || busy) && styles.primaryBtnDisabled]}
                    disabled={!emailValid || busy}
                    onPress={sendCode}
                    activeOpacity={0.85}
                >
                    {busy ? <ActivityIndicator color="#1A1048" /> : <Text weight="bold" style={styles.primaryText}>Send code</Text>}
                </TouchableOpacity>
            ) : (
                <RNView style={{ gap: 14 }}>
                    <TouchableOpacity
                        style={[styles.primaryBtn, (code.length !== OTP_LENGTH || busy) && styles.primaryBtnDisabled]}
                        disabled={code.length !== OTP_LENGTH || busy}
                        onPress={() => verify()}
                        activeOpacity={0.85}
                    >
                        {busy ? <ActivityIndicator color="#1A1048" /> : <Text weight="bold" style={styles.primaryText}>{linking ? 'Verify & save' : 'Verify & play'}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                        disabled={resendIn > 0 || busy}
                        onPress={sendCode}
                        activeOpacity={0.7}
                        style={styles.resendBtn}
                    >
                        <Text weight="semiBold" style={[styles.resendText, (resendIn > 0 || busy) && { color: palette.dimText }]}>
                            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                        </Text>
                    </TouchableOpacity>
                </RNView>
            )}

            <AppDialog
                visible={dialog.visible}
                title={dialog.title}
                message={dialog.message}
                onDismiss={hideDialog}
                actions={[{ label: 'OK', onPress: hideDialog }]}
            />
            <AppDialog
                visible={!!choice}
                title={choice?.title ?? ''}
                message={choice?.message}
                onDismiss={closeChoice}
                actions={choice?.actions}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingHorizontal: 20,
        gap: 20,
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
    topTitle: {
        fontSize: 17,
        color: palette.text,
    },
    hero: {
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
    },
    heroIcon: {
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    heading: {
        fontSize: 24,
        color: '#EEEEF8',
        textAlign: 'center',
    },
    subheading: {
        fontSize: 13,
        color: palette.mutedText,
        textAlign: 'center',
        lineHeight: 20,
    },
    emailText: {
        color: '#EEEEF8',
    },
    link: {
        color: '#7FB1FF',
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
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette.glassBorder,
        paddingHorizontal: 14,
        height: 52,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: palette.text,
        fontFamily: Fonts.semiBold,
    },
    codeRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    codeBox: {
        flex: 1,
        maxWidth: 52,
        aspectRatio: 0.85,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: palette.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    codeBoxFilled: {
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    codeBoxActive: {
        borderColor: '#7FB1FF',
        borderWidth: 1.5,
    },
    codeDigit: {
        fontSize: 24,
        color: '#FFFFFF',
    },
    hiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
    },
    primaryBtn: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    primaryBtnDisabled: {
        opacity: 0.45,
    },
    primaryText: {
        fontSize: 15,
        color: '#1A1048',
    },
    resendBtn: {
        alignItems: 'center',
        paddingVertical: 4,
    },
    resendText: {
        fontSize: 13,
        color: '#7FB1FF',
    },
});
