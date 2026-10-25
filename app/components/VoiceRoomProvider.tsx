import { AndroidAudioTypePresets, AudioSession } from '@livekit/react-native';
import {
    AudioPresets,
    ConnectionState,
    DisconnectReason,
    Room,
    RoomEvent,
    Track,
    type RemoteParticipant,
} from 'livekit-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { fetchVoiceToken } from '@/apis/rtc-api';
import { supabase } from '@/util/supabase-client';

// Voice runs through LiveKit: every phone connects to the LiveKit server, which
// forwards audio between players. That works between any two networks (mobile
// data ↔ Wi-Fi) where direct peer-to-peer WebRTC often didn't.

// ─── Audio routes ──────────────────────────────────────────────────

export type AudioRoute = 'SPEAKER_PHONE' | 'EARPIECE' | 'BLUETOOTH' | 'WIRED_HEADSET';

/** LiveKit's Android output ids. */
const ROUTE_IDS: Record<AudioRoute, string> = {
    SPEAKER_PHONE: 'speaker',
    EARPIECE: 'earpiece',
    BLUETOOTH: 'bluetooth',
    WIRED_HEADSET: 'headset',
};

/** Game default: headphones / Bluetooth when connected, otherwise the loudspeaker (never the earpiece). */
const PREFERRED: AudioRoute[] = ['BLUETOOTH', 'WIRED_HEADSET', 'SPEAKER_PHONE', 'EARPIECE'];

const FALLBACK_ROUTES: AudioRoute[] = ['SPEAKER_PHONE', 'EARPIECE'];

function toRoutes(ids: string[]): AudioRoute[] {
    return PREFERRED.filter(r => ids.includes(ROUTE_IDS[r]));
}

// ─── Types ─────────────────────────────────────────────────────────

type PublicPeer = {
    userId: string;
    muted: boolean;
    hasAudio: boolean;
    connected: boolean;
};

type VoiceCtxValue = {
    inRoom: boolean;
    roomId: string | null;
    isMuted: boolean;
    peers: PublicPeer[];
    micPermission: 'unknown' | 'granted' | 'denied';
    audioRoute: AudioRoute;
    availableRoutes: AudioRoute[];
    join: (roomId: string) => Promise<void>;
    leave: () => void;
    /** Reconnect if the voice connection dropped (e.g. after screen change). */
    resync: () => void;
    toggleMute: () => void;
    setMuted: (muted: boolean) => void;
    setAudioRoute: (route: AudioRoute) => Promise<void>;
    /** Re-read the outputs available right now (Bluetooth / headphones may have changed). */
    refreshRoutes: () => Promise<void>;
    /** iOS picks outputs in its own system sheet; null on Android. */
    showSystemRoutePicker: (() => void) | null;
    /** False while LiveKit is reconnecting. */
    allPeersConnected: boolean;
};

const VoiceCtx = createContext<VoiceCtxValue>({
    inRoom: false,
    roomId: null,
    isMuted: false,
    peers: [],
    micPermission: 'unknown',
    audioRoute: 'SPEAKER_PHONE',
    availableRoutes: FALLBACK_ROUTES,
    join: async () => {},
    leave: () => {},
    resync: () => {},
    toggleMute: () => {},
    setMuted: () => {},
    setAudioRoute: async () => {},
    refreshRoutes: async () => {},
    showSystemRoutePicker: null,
    allPeersConnected: true,
});

export function useVoiceRoom() {
    return useContext(VoiceCtx);
}

const log = (...args: any[]) => __DEV__ && console.log('[voice]', ...args);
const warn = (...args: any[]) => console.warn('[voice]', ...args);

// ─── Permission ────────────────────────────────────────────────────

async function requestMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
        const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
            title: 'Microphone access',
            message: 'Simple Ludo needs your microphone for voice chat.',
            buttonPositive: 'Allow',
        });
        if (mic !== PermissionsAndroid.RESULTS.GRANTED) return false;

        if (Number(Platform.Version) >= 31) {
            const bt = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, {
                title: 'Bluetooth access',
                message: 'Allow Bluetooth so voice chat can use your earphones.',
                buttonPositive: 'Allow',
            });
            if (bt !== PermissionsAndroid.RESULTS.GRANTED) warn('BLUETOOTH_CONNECT denied — BT audio may not work');
        }
        return true;
    } catch {
        return false;
    }
}

async function startAudio() {
    await AudioSession.configureAudio({
        android: {
            preferredOutputList: PREFERRED.map(r => ROUTE_IDS[r]) as ('speaker' | 'earpiece' | 'headset' | 'bluetooth')[],
            audioTypeOptions: AndroidAudioTypePresets.communication,
        },
        ios: { defaultOutput: 'speaker' },
    });
    await AudioSession.startAudioSession();
}

// ─── Provider ──────────────────────────────────────────────────────

export function VoiceRoomProvider({ children }: { children: React.ReactNode }) {
    const [roomId, setRoomId] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [peers, setPeers] = useState<PublicPeer[]>([]);
    const [connected, setConnected] = useState(true);
    const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
    const [audioRoute, setAudioRouteState] = useState<AudioRoute>('SPEAKER_PHONE');
    const [availableRoutes, setAvailableRoutes] = useState<AudioRoute[]>(FALLBACK_ROUTES);

    const roomRef = useRef<Room | null>(null);
    const roomIdRef = useRef<string | null>(null);
    /** The in-flight join, so double taps and effects don't connect twice. */
    const joiningRef = useRef<Promise<void> | null>(null);
    /** Bumped on every teardown so a join still in flight knows it was cancelled. */
    const genRef = useRef(0);
    /** The player's pick this session; null = follow the default. */
    const chosenRouteRef = useRef<AudioRoute | null>(null);

    const exposePeers = useCallback((room: Room) => {
        const up = room.state === ConnectionState.Connected;
        setConnected(up);
        setPeers(
            Array.from(room.remoteParticipants.values()).map((p: RemoteParticipant) => {
                const mic = p.getTrackPublication(Track.Source.Microphone);
                return {
                    userId: p.identity,
                    muted: !mic || mic.isMuted,
                    hasAudio: !!mic?.isSubscribed,
                    connected: up,
                };
            }),
        );
    }, []);

    const refreshRoutes = useCallback(async () => {
        if (Platform.OS !== 'android' || !roomRef.current) return;
        try {
            const routes = toRoutes(await AudioSession.getAudioOutputs());
            if (routes.length === 0) return;
            setAvailableRoutes(routes);
            const chosen = chosenRouteRef.current;
            // LiveKit follows the preferred list until something is picked by hand.
            setAudioRouteState(chosen && routes.includes(chosen) ? chosen : routes[0]!);
        } catch (e) {
            warn('getAudioOutputs failed:', e);
        }
    }, []);

    const setAudioRoute = useCallback(async (route: AudioRoute) => {
        chosenRouteRef.current = route;
        setAudioRouteState(route);
        try {
            await AudioSession.selectAudioOutput(ROUTE_IDS[route]);
        } catch (e) {
            warn('selectAudioOutput failed:', e);
        }
    }, []);

    const teardown = useCallback(() => {
        genRef.current += 1;
        const room = roomRef.current;
        roomRef.current = null;
        roomIdRef.current = null;
        if (room) {
            room.removeAllListeners();
            void room.disconnect();
            void AudioSession.stopAudioSession().catch(() => {});
        }
        setRoomId(null);
        setIsMuted(false);
        setPeers([]);
        setConnected(true);
        setAudioRouteState('SPEAKER_PHONE');
        setAvailableRoutes(FALLBACK_ROUTES);
        chosenRouteRef.current = null;
    }, []);

    const connect = useCallback(
        async (newRoomId: string) => {
            const gen = genRef.current;
            const cancelled = () => gen !== genRef.current;

            const granted = await requestMicPermission();
            setMicPermission(granted ? 'granted' : 'denied');
            if (!granted) return;

            const { data } = await supabase.auth.getSession();
            const accessToken = data.session?.access_token;
            if (!accessToken) return;
            const res = await fetchVoiceToken(accessToken, newRoomId);
            if (!res.ok) {
                warn('voice token failed:', res.error);
                return;
            }
            if (cancelled()) return;

            await startAudio();
            if (cancelled()) {
                void AudioSession.stopAudioSession().catch(() => {});
                return;
            }
            const room = new Room({
                audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                // Voice, not music: half the bitrate of the default; silence sends almost nothing (DTX).
                publishDefaults: { audioPreset: AudioPresets.speech, dtx: true, red: true },
            });
            const refresh = () => exposePeers(room);
            room
                .on(RoomEvent.ParticipantConnected, refresh)
                .on(RoomEvent.ParticipantDisconnected, refresh)
                .on(RoomEvent.TrackPublished, refresh)
                .on(RoomEvent.TrackUnpublished, refresh)
                .on(RoomEvent.TrackSubscribed, refresh)
                .on(RoomEvent.TrackUnsubscribed, refresh)
                .on(RoomEvent.TrackMuted, refresh)
                .on(RoomEvent.TrackUnmuted, refresh)
                .on(RoomEvent.ConnectionStateChanged, state => {
                    log('connection', state);
                    refresh();
                })
                .on(RoomEvent.Disconnected, reason => {
                    // LiveKit already retried; the next resync() starts a fresh connection.
                    log('disconnected', reason !== undefined ? DisconnectReason[reason] : '');
                    if (roomRef.current === room) refresh();
                });

            roomRef.current = room;
            roomIdRef.current = newRoomId;
            try {
                await room.connect(res.data.url, res.data.token);
                await room.localParticipant.setMicrophoneEnabled(true);
            } catch (e) {
                if (cancelled()) return;
                warn('voice connect failed:', e);
                teardown();
                return;
            }
            if (cancelled()) return; // left while connecting; teardown disconnected it
            log('joined voice', newRoomId, 'peers =', room.remoteParticipants.size);
            setRoomId(newRoomId);
            setIsMuted(false);
            refresh();
            if (chosenRouteRef.current) void setAudioRoute(chosenRouteRef.current);
            void refreshRoutes();
        },
        [exposePeers, refreshRoutes, setAudioRoute, teardown],
    );

    const join = useCallback(
        (newRoomId: string) => {
            if (joiningRef.current) return joiningRef.current;
            const room = roomRef.current;
            if (room && roomIdRef.current === newRoomId && room.state !== ConnectionState.Disconnected) {
                return Promise.resolve();
            }
            if (room) teardown();
            const run = connect(newRoomId).finally(() => {
                joiningRef.current = null;
            });
            joiningRef.current = run;
            return run;
        },
        [connect, teardown],
    );

    const resync = useCallback(() => {
        const rid = roomIdRef.current;
        if (!rid || roomRef.current?.state !== ConnectionState.Disconnected) return;
        log('voice resync →', rid);
        void join(rid);
    }, [join]);

    const leave = useCallback(() => {
        joiningRef.current = null;
        teardown();
    }, [teardown]);

    const setMutedFn = useCallback((muted: boolean) => {
        const room = roomRef.current;
        if (!room) return;
        setIsMuted(muted);
        room.localParticipant.setMicrophoneEnabled(!muted).catch(e => {
            warn('setMicrophoneEnabled failed:', e);
            setIsMuted(!muted);
        });
    }, []);

    const toggleMute = useCallback(() => setMutedFn(!isMuted), [isMuted, setMutedFn]);

    useEffect(() => teardown, [teardown]);

    const showSystemRoutePicker = useMemo(
        () => (Platform.OS === 'ios' ? () => void AudioSession.showAudioRoutePicker() : null),
        [],
    );

    const value = useMemo<VoiceCtxValue>(
        () => ({
            inRoom: !!roomId,
            roomId,
            isMuted,
            peers,
            micPermission,
            audioRoute,
            availableRoutes,
            join,
            leave,
            resync,
            toggleMute,
            setMuted: setMutedFn,
            setAudioRoute,
            refreshRoutes,
            showSystemRoutePicker,
            allPeersConnected: connected,
        }),
        [roomId, isMuted, peers, micPermission, audioRoute, availableRoutes, join, leave, resync, toggleMute, setMutedFn, setAudioRoute, refreshRoutes, showSystemRoutePicker, connected],
    );

    return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
