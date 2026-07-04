import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { BackendUser } from '@/apis/auth-api';
import { fetchMe } from '@/apis/user-api';
import { supabase } from '@/util/supabase-client';

const STORAGE_KEY = 'user';

export function useCurrentUser() {
    const [user, setUser] = useState<BackendUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) {
                setUser(null);
                return;
            }

            const result = await fetchMe(token);
            if (!result.ok) {
                setError(result.error);
                const raw = await AsyncStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const cached = parsed?.user ?? parsed;
                    if (cached?.username) setUser(cached as BackendUser);
                }
                return;
            }

            setUser(result.data.user);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user: result.data.user }));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load profile');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { user, loading, error, refresh, setUser };
}
