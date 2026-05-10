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

type DialogState = {
    visible: boolean;
    title: string;
    message: string;
}

export function useAuth() {

    const [loading, setLoading] = useState({ googleLoading: false, githubLoading: false });
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
            setLoading(prev => ({ ...prev, googleLoading: true, githubLoading: false }))

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
                showDialog('Google sign-in failed', exchangeError.message);
                return;
            }

            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            let message = 'You are now signed in.';
            if (accessToken) {
                const reg = await registerUserAfterOAuth(accessToken);
                if (!reg.ok) {
                    message = `${message}\n\nCould not sync your profile with the game server: ${reg.error}`;
                }
                else {
                    await AsyncStorage.setItem('user', JSON.stringify(reg.data))
                }
            }

            showDialog('Login successful', message);
        } finally {
            setLoading(prev => ({ ...prev, googleLoading: false, githubLoading: false }))
        }
    }



    // sign in with github via supabase
    const signInWithGithub = async () => {

        setLoading(prev => ({ ...prev, googleLoading: false, githubLoading: true }))

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
                redirectTo,
                skipBrowserRedirect: true,
            },
        })

        if (error || !data.url) return

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
        if (result.type === 'success') {

            const url = new URL(result.url);
            const code = url.searchParams.get('code');

            if (code) {
                const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                if (exchangeError) {
                    showDialog('GitHub sign-in failed', exchangeError.message);
                }

                else {

                    const { data: sessionData } = await supabase.auth.getSession();
                    const accessToken = sessionData.session?.access_token;

                    let message = 'You are now signed in.';
                    if (accessToken) {
                        const reg = await registerUserAfterOAuth(accessToken);
                        if (!reg.ok) {
                            message = `${message}\n\nCould not sync your profile with the game server: ${reg.error}`;
                        }
                        else {
                            await AsyncStorage.setItem('user', JSON.stringify(reg.data))
                        }
                    }
                    showDialog('Login successful', message);
                }
            }
        }
        setLoading(prev => ({ ...prev, googleLoading: false, githubLoading: false }))
    }

    const signOut = async () => {
        await supabase.auth.signOut()
        await AsyncStorage.setItem('user', 'null');
    }
    return { signInWithGoogle, signInWithGithub, signOut, loading, dialog, hideDialog }
}