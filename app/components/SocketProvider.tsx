import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { supabase } from '@/util/supabase-client';

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'disconnected';

type SocketCtxValue = {
    socket: Socket | null;
    status: Status;
    lastError: string | null;
    /** Force reconnect (e.g. after coming back online) */
    reconnect: () => Promise<void>;
};

const SocketCtx = createContext<SocketCtxValue>({
    socket: null,
    status: 'idle',
    lastError: null,
    reconnect: async () => {},
});

export function useSocket() {
    return useContext(SocketCtx);
}

function apiBase(): string | null {
    const url = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (!url) return null;
    return url.replace(/\/$/, '');
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<Status>('idle');
    const [lastError, setLastError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);

    const teardown = useCallback(() => {
        const s = socketRef.current;
        if (s) {
            s.removeAllListeners();
            s.disconnect();
        }
        socketRef.current = null;
        setSocket(null);
    }, []);

    const connect = useCallback(async () => {
        const base = apiBase();
        if (!base) {
            setStatus('error');
            setLastError('EXPO_PUBLIC_API_URL is not set.');
            return;
        }

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
            setStatus('idle');
            return;
        }

        teardown();
        setStatus('connecting');

        const s = io(base, {
            transports: ['websocket'],
            auth: { token },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 800,
            reconnectionDelayMax: 4000,
            timeout: 10_000,
            forceNew: true,
        });

        s.on('connect', () => {
            setStatus('connected');
            setLastError(null);
        });
        s.on('disconnect', (reason) => {
            setStatus(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
        });
        s.on('reconnect_attempt', () => setStatus('reconnecting'));
        s.on('connect_error', (err) => {
            setLastError(err?.message ?? 'connect_error');
        });

        socketRef.current = s;
        setSocket(s);
    }, [teardown]);

    // Initial connect — re-runs whenever auth changes
    useEffect(() => {
        let alive = true;

        (async () => {
            await connect();
        })();

        const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
            if (!alive) return;
            if (session) connect();
            else teardown();
        });

        return () => {
            alive = false;
            listener.subscription.unsubscribe();
            teardown();
        };
    }, [connect, teardown]);

    // Reconnect on app foregrounding
    useEffect(() => {
        let prev: AppStateStatus = AppState.currentState;
        const sub = AppState.addEventListener('change', (next) => {
            if (prev.match(/inactive|background/) && next === 'active') {
                const s = socketRef.current;
                if (s && !s.connected) s.connect();
                else if (!s) void connect();
            }
            prev = next;
        });
        return () => sub.remove();
    }, [connect]);

    const value = useMemo<SocketCtxValue>(
        () => ({ socket, status, lastError, reconnect: connect }),
        [socket, status, lastError, connect],
    );

    return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>;
}
