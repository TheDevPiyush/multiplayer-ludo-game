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
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { io, type Socket } from 'socket.io-client';

import { supabase } from '@/util/supabase-client';

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'disconnected';

export type ConnectionPhase =
    | 'offline'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'error';

type SocketCtxValue = {
    socket: Socket | null;
    status: Status;
    /** Device has network connectivity (Wi‑Fi / cellular). */
    networkOnline: boolean;
    /** Network up and socket connected — safe to send realtime game actions. */
    isRealtimeReady: boolean;
    connectionPhase: ConnectionPhase;
    lastError: string | null;
    /** Increments on each successful socket connect (use to re-join rooms). */
    connectGeneration: number;
    reconnect: () => Promise<void>;
};

const SocketCtx = createContext<SocketCtxValue>({
    socket: null,
    status: 'idle',
    networkOnline: true,
    isRealtimeReady: false,
    connectionPhase: 'connecting',
    lastError: null,
    connectGeneration: 0,
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

/** If the socket isn't back this long after returning to the app, start a fresh one. */
const FOREGROUND_RECONNECT_TIMEOUT_MS = 5000;

/** Current access token; never hangs (supabase-js can stall right after resume). */
async function currentToken(): Promise<string> {
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000));
    const session = await Promise.race([supabase.auth.getSession().then(r => r.data.session), timeout]);
    return session?.access_token ?? '';
}

function isNetworkReachable(state: NetInfoState): boolean {
    return state.isConnected === true && state.isInternetReachable !== false;
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<Status>('idle');
    const [networkOnline, setNetworkOnline] = useState(true);
    const [lastError, setLastError] = useState<string | null>(null);
    const [connectGeneration, setConnectGeneration] = useState(0);
    const socketRef = useRef<Socket | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const networkOnlineRef = useRef(true);

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

        if (!networkOnlineRef.current) {
            setStatus('disconnected');
            return;
        }

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
            setStatus('idle');
            return;
        }

        const existing = socketRef.current;
        if (existing?.connected) return;

        if (existing) {
            existing.connect();
            setStatus('connecting');
            return;
        }

        setStatus('connecting');

        const s = io(base, {
            transports: ['websocket'],
            // Called on every (re)connect attempt, so auto-reconnects never reuse an
            // expired access token (supabase-js refreshes the session in the background).
            auth: (cb) => {
                void currentToken().then(token => cb({ token }));
            },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 800,
            reconnectionDelayMax: 4000,
            timeout: 10_000,
        });

        s.on('connect', () => {
            setStatus('connected');
            setLastError(null);
            setConnectGeneration(g => g + 1);
        });
        s.on('disconnect', (reason) => {
            setStatus(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
            // Socket.IO never auto-reconnects after a server-side disconnect; we always want to.
            if (reason === 'io server disconnect') {
                setTimeout(() => {
                    if (socketRef.current === s && !s.connected) s.connect();
                }, 1000);
            }
        });
        s.io.on('reconnect_attempt', () => setStatus('reconnecting'));
        s.on('connect_error', (err) => {
            setLastError(err?.message ?? 'connect_error');
            if (!networkOnlineRef.current) {
                setStatus('disconnected');
            }
        });

        socketRef.current = s;
        setSocket(s);
    }, []);

    // Initial connect — re-runs whenever auth changes
    useEffect(() => {
        let alive = true;

        (async () => {
            await connect();
        })();

        const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
            if (!alive) return;
            if (session) void connect();
            else teardown();
        });

        return () => {
            alive = false;
            listener.subscription.unsubscribe();
            teardown();
        };
    }, [connect, teardown]);

    // Network reachability — auto reconnect when back online
    useEffect(() => {
        const apply = (state: NetInfoState) => {
            const online = isNetworkReachable(state);
            networkOnlineRef.current = online;
            setNetworkOnline(online);

            if (!online) {
                setStatus(prev => (prev === 'connected' ? 'reconnecting' : prev));
                return;
            }

            const s = socketRef.current;
            if (s && !s.connected) {
                setStatus('reconnecting');
                s.connect();
            } else if (!s) {
                void connect();
            }
        };

        const unsub = NetInfo.addEventListener(apply);
        void NetInfo.fetch().then(apply);
        return () => unsub();
    }, [connect]);

    // Background / foreground: pause token refresh while hidden (per supabase-js
    // React Native docs) and make sure the socket really comes back on resume.
    useEffect(() => {
        let prev: AppStateStatus = AppState.currentState;
        let watchdog: ReturnType<typeof setTimeout> | null = null;

        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void supabase.auth.startAutoRefresh();
            else void supabase.auth.stopAutoRefresh();

            if (prev.match(/inactive|background/) && next === 'active') {
                void NetInfo.fetch().then(state => {
                    const online = isNetworkReachable(state);
                    networkOnlineRef.current = online;
                    setNetworkOnline(online);
                    if (!online) return;
                    const s = socketRef.current;
                    if (s && !s.connected) s.connect();
                    else if (!s) void connect();

                    // Last resort: a socket that is still stuck gets replaced.
                    if (watchdog) clearTimeout(watchdog);
                    watchdog = setTimeout(() => {
                        if (socketRef.current?.connected) return;
                        teardown();
                        void connect();
                    }, FOREGROUND_RECONNECT_TIMEOUT_MS);
                });
            }
            prev = next;
        });
        return () => {
            sub.remove();
            if (watchdog) clearTimeout(watchdog);
        };
    }, [connect, teardown]);

    const connectionPhase = useMemo<ConnectionPhase>(() => {
        if (!networkOnline) return 'offline';
        if (status === 'error') return 'error';
        if (status === 'connected') return 'connected';
        if (status === 'reconnecting') return 'reconnecting';
        if (status === 'disconnected') return 'disconnected';
        return 'connecting';
    }, [networkOnline, status]);

    const isRealtimeReady = networkOnline && status === 'connected';

    const value = useMemo<SocketCtxValue>(
        () => ({
            socket,
            status,
            networkOnline,
            isRealtimeReady,
            connectionPhase,
            lastError,
            connectGeneration,
            reconnect: connect,
        }),
        [socket, status, networkOnline, isRealtimeReady, connectionPhase, lastError, connectGeneration, connect],
    );

    return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>;
}
