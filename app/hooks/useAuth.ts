import { registerUserAfterOAuth } from '@/apis/auth-api'
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

export function useAuth() {

    const [loading, setLoading] = useState({ googleLoading: false, otpLoading: false });
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

            const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

            if (result.type !== 'success') {
                showDialog('Google sign-in cancelled', `Sign-in was not completed (${result.type}).`);
                return;
            }

            const url = new URL(result.url);
            const code = url.searchParams.get('code');

            if (!code) {
                showDialog('Google sign-in failed', 'No auth code received from callback.');
                return;
            }

            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
                console.log('Google sign-in failed', exchangeError.message)
                return;
            }

            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            let message = 'You are now signed in.';
            if (accessToken) {
                const reg = await registerUserAfterOAuth(accessToken);
                if (!reg.ok) {
                    message = `${message}\n\nCould not sync your profile with the game server`;
                }
                else {
                    await AsyncStorage.setItem('user', JSON.stringify(reg.data))
                }
            }

        } catch (e) {
            showDialog('Google sign-in failed', errorMessage(e));
        } finally {
            setLoading(prev => ({ ...prev, googleLoading: false }))
        }
    }



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
    return { signInWithGoogle, sendEmailOtp, verifyEmailOtp, signOut, loading, dialog, hideDialog }
}