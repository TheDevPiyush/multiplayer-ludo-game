'use client';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AdminConfig = {
    supabaseUrl: string;
    supabaseKey: string;
    apiUrl: string;
};

type AdminCtx = {
    supabase: SupabaseClient | null;
    session: Session | null;
    /** True until the stored session has been read. */
    loading: boolean;
    config: AdminConfig;
    /** Calls the game server's /admin API as the signed-in admin. */
    api: <T>(path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; params?: Record<string, string | number | boolean | undefined> }) => Promise<T>;
    signOut: () => Promise<void>;
};

const Ctx = createContext<AdminCtx | null>(null);

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

export function AdminProvider({ config, children }: { config: AdminConfig; children: ReactNode }) {
    const supabase = useMemo(
        () => (config.supabaseUrl && config.supabaseKey
            ? createClient(config.supabaseUrl, config.supabaseKey, {
                // Its own storage key, so it never shares a session with anything else on this domain.
                auth: { persistSession: true, autoRefreshToken: true, storageKey: 'simple-ludo-admin' },
            })
            : null),
        [config.supabaseUrl, config.supabaseKey],
    );
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        void supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setLoading(false);
        });
        const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
        return () => data.subscription.unsubscribe();
    }, [supabase]);

    const api = useCallback<AdminCtx['api']>(async (path, init = {}) => {
        if (!supabase) throw new ApiError(500, 'Supabase is not configured.');
        // getSession refreshes an expired token first.
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new ApiError(401, 'Signed out.');
        const url = new URL(`${config.apiUrl}/admin${path}`);
        for (const [k, v] of Object.entries(init.params ?? {})) {
            if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
        }
        const res = await fetch(url, {
            method: init.method ?? 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
            cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(res.status, json?.message ?? `Request failed (${res.status}).`);
        return json as never;
    }, [supabase, config.apiUrl]);

    const signOut = useCallback(async () => {
        await supabase?.auth.signOut();
    }, [supabase]);

    const value = useMemo(() => ({ supabase, session, loading, config, api, signOut }), [supabase, session, loading, config, api, signOut]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminCtx {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useAdmin outside AdminProvider');
    return ctx;
}

export type Page<T> = { data: T[]; page: number; pageSize: number; total: number; counts?: Record<string, number> };

/**
 * One page of an /admin list. Refetches when the params change; the search box
 * is debounced by the caller (see useDebounced).
 */
export function usePagedList<T>(path: string, params: Record<string, string | number | boolean | undefined>, opts: { refreshMs?: number } = {}) {
    const { api } = useAdmin();
    const [state, setState] = useState<{ rows: T[]; total: number; counts: Record<string, number> | null; loading: boolean; error: string | null }>({
        rows: [], total: 0, counts: null, loading: true, error: null,
    });
    const [tick, setTick] = useState(0);
    const key = JSON.stringify(params);

    useEffect(() => {
        let alive = true;
        setState(s => ({ ...s, loading: true }));
        api<Page<T>>(path, { params })
            .then(res => alive && setState({ rows: res.data, total: res.total, counts: res.counts ?? null, loading: false, error: null }))
            .catch((e: Error) => alive && setState(s => ({ ...s, loading: false, error: e.message })));
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, path, key, tick]);

    useEffect(() => {
        if (!opts.refreshMs) return;
        const t = setInterval(() => setTick(n => n + 1), opts.refreshMs);
        return () => clearInterval(t);
    }, [opts.refreshMs]);

    return { ...state, reload: useCallback(() => setTick(n => n + 1), []) };
}

export function useDebounced<T>(value: T, ms = 300): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}
