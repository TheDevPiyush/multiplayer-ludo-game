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
            existing.auth = { token };
            existing.connect();
            setStatus('connecting');
            return;
        }

        setStatus('connecting');

        const s = io(base, {
            transports: ['websocket'],
            auth: { token },
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
        });
        s.on('reconnect_attempt', () => setStatus('reconnecting'));
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

    // Reconnect on app foregrounding
    useEffect(() => {
        let prev: AppStateStatus = AppState.currentState;
        const sub = AppState.addEventListener('change', (next) => {
            if (prev.match(/inactive|background/) && next === 'active') {
                void NetInfo.fetch().then(state => {
                    const online = isNetworkReachable(state);
                    networkOnlineRef.current = online;
                    setNetworkOnline(online);
                    if (!online) return;
                    const s = socketRef.current;
                    if (s && !s.connected) s.connect();
                    else if (!s) void connect();
                });
            }
            prev = next;
        });
        return () => sub.remove();
    }, [connect]);

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
