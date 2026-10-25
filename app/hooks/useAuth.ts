import { registerUserAfterOAuth } from '@/apis/auth-api'
import { fetchMe } from '@/apis/user-api'
import { supabase } from '@/util/supabase-client'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS === 'web') {
    WebBrowser.maybeCompleteAuthSession()
}

const redirectTo = makeRedirectUri({ scheme: 'simpleludo', path: 'auth/callback' })

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

type DialogState = {
    visible: boolean;
    title: string;
    message: string;
}

/**
 * Saving a guest's progress links Google or an email to the same Supabase user,
 * so everything they played stays theirs. `taken` = that Google account or email
 * already has its own Simple Ludo account, which can't absorb a guest.
 */
export type LinkResult = { ok: true } | { ok: false; reason: 'taken' | 'cancelled' | 'failed' };

/** Opens the provider page and returns the redirect's query + hash parameters, or null if cancelled. */
async function runBrowserAuth(url: string): Promise<URLSearchParams | null> {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
    if (result.type !== 'success') return null;
    const u = new URL(result.url);
    const params = new URLSearchParams(u.search);
    new URLSearchParams(u.hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v));
    return params;
}

/** Saves the player row locally (profile screens paint it before the network answers). */
async function cacheProfile(accessToken: string) {
    const me = await fetchMe(accessToken);
    if (me.ok) await AsyncStorage.setItem('user', JSON.stringify({ user: me.data.user }));
}

export function useAuth() {

    const [loading, setLoading] = useState({ googleLoading: false, otpLoading: false, guestLoading: false });
    const [dialog, setDialog] = useState<DialogState>({
        visible: false,
        title: '',
        message: '',
    });

    const showDialog = (title: string, message: string) =>
        setDialog({ visible: true, title, message });

    const hideDialog = () =>
        setDialog(prev => ({ ...prev, visible: false }));


    // sign in with google via supabase
    const signInWithGoogle = async () => {
        try {
            setLoading(prev => ({ ...prev, googleLoading: true }))

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo,
                    skipBrowserRedirect: true,
                    queryParams: {
                        prompt: 'select_account',
                    },
                },
            })

            if (error || !data.url) {
                showDialog('Google sign-in failed', error?.message ?? 'Unable to start Google sign-in.');
                return;
            }

            const params = await runBrowserAuth(data.url);
            if (!params) {
                showDialog('Google sign-in cancelled', 'Sign-in was not completed.');
                return;
            }

            const code = params.get('code');
            if (!code) {
                showDialog('Google sign-in failed', params.get('error_description') ?? 'No auth code received from callback.');
                return;
            }

            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
                console.log('Google sign-in failed', exchangeError.message)
                return;
            }

            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            if (accessToken) {
                const reg = await registerUserAfterOAuth(accessToken);
                if (reg.ok) await AsyncStorage.setItem('user', JSON.stringify(reg.data))
            }

        } catch (e) {
            showDialog('Google sign-in failed', errorMessage(e));
        } finally {
            setLoading(prev => ({ ...prev, googleLoading: false }))
        }
    }

    /** Play without an account. On success the auth listener in app/_layout.tsx navigates into the app. */
    const playAsGuest = async (): Promise<boolean> => {
        setLoading(prev => ({ ...prev, guestLoading: true }));
        try {
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error || !data.session) {
                showDialog(
                    'Could not start a guest game',
                    error?.code === 'anonymous_provider_disabled'
                        ? 'Guest play is switched off right now. Sign in with Google or email instead.'
                        : error?.message ?? 'Please try again.',
                );
                return false;
            }
            const reg = await registerUserAfterOAuth(data.session.access_token);
            if (reg.ok) await AsyncStorage.setItem('user', JSON.stringify(reg.data));
            return true;
        } catch (e) {
            showDialog('Could not start a guest game', errorMessage(e));
            return false;
        } finally {
            setLoading(prev => ({ ...prev, guestLoading: false }));
        }
    };

    /** Guest → Google account, keeping everything. Shows its own dialog for unexpected failures. */
    const linkGoogle = async (): Promise<LinkResult> => {
        setLoading(prev => ({ ...prev, googleLoading: true }));
        try {
            const { data, error } = await supabase.auth.linkIdentity({
                provider: 'google',
                options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
            });
            if (error || !data?.url) {
                showDialog('Could not link Google', error?.code === 'manual_linking_disabled'
                    ? 'Linking accounts is switched off right now. Please try again later.'
                    : error?.message ?? 'Unable to start Google sign-in.');
                return { ok: false, reason: 'failed' };
            }

            const params = await runBrowserAuth(data.url);
            if (!params) return { ok: false, reason: 'cancelled' };
            const errorCode = params.get('error_code');
            const errorText = params.get('error_description') ?? '';
            if (errorCode === 'identity_already_exists' || /already (linked|registered|exists)/i.test(errorText)) {
                return { ok: false, reason: 'taken' };
            }
            const code = params.get('code');
            if (!code) {
                showDialog('Could not link Google', errorText || 'No auth code received from callback.');
                return { ok: false, reason: 'failed' };
            }

            const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError || !exchanged.session) {
                showDialog('Could not link Google', exchangeError?.message ?? 'Please try again.');
                return { ok: false, reason: 'failed' };
            }
            // The server sees a non-guest token for the same player and fills in name, avatar and provider.
            await cacheProfile(exchanged.session.access_token);
            return { ok: true };
        } catch (e) {
            showDialog('Could not link Google', errorMessage(e));
            return { ok: false, reason: 'failed' };
        } finally {
            setLoading(prev => ({ ...prev, googleLoading: false }));
        }
    };

    /** Guest → email account, step 1: sends a code to the new address. */
    const startEmailLink = async (email: string): Promise<LinkResult> => {
        setLoading(prev => ({ ...prev, otpLoading: true }));
        try {
            const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
            if (!error) return { ok: true };
            if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message)) {
                return { ok: false, reason: 'taken' };
            }
            showDialog('Could not send code', error.message);
            return { ok: false, reason: 'failed' };
        } catch (e) {
            showDialog('Could not send code', errorMessage(e));
            return { ok: false, reason: 'failed' };
        } finally {
            setLoading(prev => ({ ...prev, otpLoading: false }));
        }
    };

    /** Guest → email account, step 2: the code from that email confirms it. */
    const verifyEmailLink = async (email: string, token: string): Promise<boolean> => {
        setLoading(prev => ({ ...prev, otpLoading: true }));
        try {
            const { data, error } = await supabase.auth.verifyOtp({
                email: email.trim().toLowerCase(),
                token,
                type: 'email_change',
            });
            if (error || !data.session) {
                showDialog('Invalid code', error?.message ?? 'That code did not work. Check it and try again.');
                return false;
            }
            await cacheProfile(data.session.access_token);
            return true;
        } catch (e) {
            showDialog('Could not verify code', errorMessage(e));
            return false;
        } finally {
            setLoading(prev => ({ ...prev, otpLoading: false }));
        }
    };



    // email OTP via supabase — no browser redirect / OAuth app needed
    const sendEmailOtp = async (email: string): Promise<boolean> => {
        setLoading(prev => ({ ...prev, otpLoading: true }));
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: email.trim().toLowerCase(),
                options: { shouldCreateUser: true },
            });
            if (error) {
                showDialog('Could not send code', error.message);
                return false;
            }
            return true;
        } catch (e) {
            showDialog('Could not send code', errorMessage(e));
            return false;
        } finally {
            setLoading(prev => ({ ...prev, otpLoading: false }));
        }
    };

    /** On success the auth listener in app/_layout.tsx navigates into the app. */
    const verifyEmailOtp = async (email: string, token: string): Promise<boolean> => {
        setLoading(prev => ({ ...prev, otpLoading: true }));
        try {
            const { data, error } = await supabase.auth.verifyOtp({
                email: email.trim().toLowerCase(),
                token,
                type: 'email',
            });
            if (error || !data.session) {
                showDialog('Invalid code', error?.message ?? 'That code did not work. Check it and try again.');
                return false;
            }
            const reg = await registerUserAfterOAuth(data.session.access_token);
            if (reg.ok) await AsyncStorage.setItem('user', JSON.stringify(reg.data));
            return true;
        } catch (e) {
            showDialog('Could not verify code', errorMessage(e));
            return false;
        } finally {
            setLoading(prev => ({ ...prev, otpLoading: false }));
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut()
        await AsyncStorage.setItem('user', 'null');
    }
    return {
        signInWithGoogle, sendEmailOtp, verifyEmailOtp, playAsGuest,
        linkGoogle, startEmailLink, verifyEmailLink,
        signOut, loading, dialog, hideDialog, showDialog,
    }
}
