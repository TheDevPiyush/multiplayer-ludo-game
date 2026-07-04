import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    NativeEventEmitter,
    NativeModules,
    PermissionsAndroid,
    Platform,
} from 'react-native';
import InCallManager from 'react-native-incall-manager';
import {
    mediaDevices,
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    MediaStream,
    type MediaStreamTrack,
} from 'react-native-webrtc';

import { useSocket } from './SocketProvider';
import { fetchIceServers } from '@/apis/rtc-api';
import { supabase } from '@/util/supabase-client';

// ─── Audio route types ─────────────────────────────────────────────

export type AudioRoute = 'SPEAKER_PHONE' | 'EARPIECE' | 'BLUETOOTH' | 'WIRED_HEADSET';

export const AUDIO_ROUTE_LABELS: Record<AudioRoute, string> = {
    SPEAKER_PHONE: 'Speaker',
    EARPIECE: 'Earpiece',
    BLUETOOTH: 'Bluetooth',
    WIRED_HEADSET: 'Headset',
};

export const AUDIO_ROUTE_ICONS: Record<AudioRoute, string> = {
    SPEAKER_PHONE: 'volume-up',
    EARPIECE: 'phone',
    BLUETOOTH: 'bluetooth',
    WIRED_HEADSET: 'headphones',
};

const ALL_ROUTES: AudioRoute[] = ['SPEAKER_PHONE', 'EARPIECE', 'BLUETOOTH', 'WIRED_HEADSET'];

function parseRoute(value: unknown): AudioRoute | null {
    if (typeof value !== 'string') return null;
    return ALL_ROUTES.includes(value as AudioRoute) ? (value as AudioRoute) : null;
}

function parseAvailableRoutes(raw: unknown): AudioRoute[] {
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown[];
        return parsed.map(parseRoute).filter((r): r is AudioRoute => r !== null);
    } catch {
        return [];
    }
}

// ─── Types ─────────────────────────────────────────────────────────

type PeerState = {
    userId: string;
    pc: RTCPeerConnection;
    stream: MediaStream | null;
    muted: boolean;
    /** True after we've called setRemoteDescription on this peer.
     *  Any ICE candidates received before this must be buffered. */
    remoteDescriptionSet: boolean;
    pendingCandidates: RTCIceCandidateInit[];
};

type PublicPeer = {
    userId: string;
    muted: boolean;
    hasAudio: boolean;
    /** WebRTC ICE connection is up */
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
    /** Re-register with server and rebuild peer connections (e.g. after screen change) */
    resync: () => void;
    toggleMute: () => void;
    setMuted: (muted: boolean) => void;
    setAudioRoute: (route: AudioRoute) => Promise<void>;
    /** True when all remote peers have an active ICE connection */
    allPeersConnected: boolean;
};

const VoiceCtx = createContext<VoiceCtxValue>({
    inRoom: false,
    roomId: null,
    isMuted: false,
    peers: [],
    micPermission: 'unknown',
    audioRoute: 'SPEAKER_PHONE',
    availableRoutes: ['SPEAKER_PHONE', 'EARPIECE'],
    join: async () => {},
    leave: () => {},
    resync: () => {},
    toggleMute: () => {},
    setMuted: () => {},
    setAudioRoute: async () => {},
    allPeersConnected: true,
});

export function useVoiceRoom() {
    return useContext(VoiceCtx);
}

// ─── Constants ─────────────────────────────────────────────────────

const STUN_ONLY: RTCConfiguration['iceServers'] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
];

// Server-provided TURN credentials (Cloudflare), cached until near expiry.
let cachedIceServers: RTCConfiguration['iceServers'] | null = null;
let iceServersExpireAt = 0;

async function getIceServers(): Promise<RTCConfiguration['iceServers']> {
    if (cachedIceServers && Date.now() < iceServersExpireAt) {
        return cachedIceServers;
    }
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return cachedIceServers ?? STUN_ONLY;

        const result = await fetchIceServers(token);
        if (result.ok && result.data.iceServers?.length) {
            cachedIceServers = result.data.iceServers as RTCConfiguration['iceServers'];
            iceServersExpireAt = result.data.expiresAt || Date.now() + 60 * 60 * 1000;
            log('fetched ICE servers from API, expires', new Date(iceServersExpireAt).toISOString());
            return cachedIceServers;
        }
        warn('ice-servers fetch failed:', !result.ok ? result.error : 'empty list');
    } catch (e) {
        warn('ice-servers fetch threw:', e);
    }
    return cachedIceServers ?? STUN_ONLY;
}

const DEBUG = __DEV__;
const log = (...args: any[]) => DEBUG && console.log('[voice]', ...args);
const warn = (...args: any[]) => console.warn('[voice]', ...args);

const VOICE_JOIN_MAX_ATTEMPTS = 12;
const VOICE_JOIN_RETRY_MS = 350;

// ─── Audio routing ─────────────────────────────────────────────────
// Each call is wrapped individually because some of them throw native
// exceptions when their corresponding Android permission is missing
// (e.g. setKeepScreenOn → WAKE_LOCK). Those native exceptions bypass
// JS try/catch when fired on the bridge thread, but a properly granted
// manifest plus individual try/catch keeps everything else working.

function safe(fn: () => void, label: string) {
    try { fn(); }
    catch (e) { warn(`InCallManager.${label} failed:`, e); }
}

function startAudioSession() {
    // auto:true lets InCallManager route to BT / wired headset when connected
    safe(() => InCallManager.start({ media: 'audio', auto: true }), 'start');
    safe(() => InCallManager.startProximitySensor(), 'startProximitySensor');
    safe(() => InCallManager.setKeepScreenOn(true), 'setKeepScreenOn');
    if (Platform.OS === 'android') {
        void InCallManager.requestAudioFocus().catch(() => {});
    }
    log('audio session started (auto routing enabled)');
}

function stopAudioSession() {
    safe(() => InCallManager.stopProximitySensor(), 'stopProximitySensor');
    safe(() => InCallManager.setKeepScreenOn(false), 'setKeepScreenOn(false)');
    safe(() => InCallManager.setForceSpeakerphoneOn(false), 'setForceSpeakerphoneOn(false)');
    safe(() => InCallManager.setSpeakerphoneOn(false), 'setSpeakerphoneOn(false)');
    if (Platform.OS === 'android') {
        void InCallManager.abandonAudioFocus().catch(() => {});
    }
    safe(() => InCallManager.stop(), 'stop');
    log('audio session stopped');
}

async function applyAudioRoute(route: AudioRoute): Promise<AudioRoute> {
    if (Platform.OS === 'android') {
        try {
            const result = await InCallManager.chooseAudioRoute(route);
            const selected = parseRoute(result?.selectedAudioDevice);
            if (selected) return selected;
        } catch (e) {
            warn('chooseAudioRoute failed:', e);
        }
    }

    // iOS + Android fallback
    if (route === 'SPEAKER_PHONE') {
        safe(() => InCallManager.setForceSpeakerphoneOn(true), 'setForceSpeakerphoneOn(true)');
        safe(() => InCallManager.setSpeakerphoneOn(true), 'setSpeakerphoneOn(true)');
        return 'SPEAKER_PHONE';
    }

    safe(() => InCallManager.setForceSpeakerphoneOn(false), 'setForceSpeakerphoneOn(false)');
    safe(() => InCallManager.setSpeakerphoneOn(false), 'setSpeakerphoneOn(false)');
    return route === 'BLUETOOTH' || route === 'WIRED_HEADSET' ? route : 'EARPIECE';
}

// ─── Permission ────────────────────────────────────────────────────

async function requestMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
        const mic = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
                title: 'Microphone access',
                message: 'Simple Ludo needs your microphone for voice chat.',
                buttonPositive: 'Allow',
            },
        );
        if (mic !== PermissionsAndroid.RESULTS.GRANTED) return false;

        if (Number(Platform.Version) >= 31) {
            const bt = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                {
                    title: 'Bluetooth access',
                    message: 'Allow Bluetooth so voice chat can use your earphones.',
                    buttonPositive: 'Allow',
                },
            );
            if (bt !== PermissionsAndroid.RESULTS.GRANTED) {
                warn('BLUETOOTH_CONNECT denied — BT audio may not work');
            }
        }
        return true;
    } catch {
        return false;
    }
}

// ─── Provider ──────────────────────────────────────────────────────

export function VoiceRoomProvider({ children }: { children: React.ReactNode }) {
    const { socket } = useSocket();

    const [roomId, setRoomId] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [peers, setPeers] = useState<PublicPeer[]>([]);
    const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
    const [audioRoute, setAudioRouteState] = useState<AudioRoute>('SPEAKER_PHONE');
    const [availableRoutes, setAvailableRoutes] = useState<AudioRoute[]>(['SPEAKER_PHONE', 'EARPIECE']);

    // ── Refs (always-current values for use inside async/event callbacks) ──
    const roomIdRef = useRef<string | null>(null);
    const myUserIdRef = useRef<string | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const peersRef = useRef<Map<string, PeerState>>(new Map());
    const socketRef = useRef(socket);
    const iceServersRef = useRef<RTCConfiguration['iceServers']>(STUN_ONLY);
    const restartTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const createPeerRef = useRef<((remoteUserId: string, isInitialOfferer: boolean) => PeerState) | null>(null);
    const [allPeersConnected, setAllPeersConnected] = useState(true);

    /** Register with server voice room; retries until socket game-room join completes. */
    const announceVoiceJoin = useCallback((rid: string, label: string): Promise<boolean> => {
        const s = socketRef.current;
        if (!s?.connected) return Promise.resolve(false);

        return new Promise(resolve => {
            let attempt = 0;

            const tryJoin = () => {
                attempt += 1;
                s.emit('voice:join', { roomId: rid }, (res: any) => {
                    if (res?.ok) {
                        const existing: string[] = res.data?.peers ?? [];
                        log(`${label} voice:join ok, peers =`, existing);
                        for (const remoteId of existing) {
                            if (!peersRef.current.has(remoteId)) {
                                createPeerRef.current?.(remoteId, true);
                            }
                        }
                        resolve(true);
                        return;
                    }

                    const err = res?.error ?? 'unknown';
                    if (attempt < VOICE_JOIN_MAX_ATTEMPTS) {
                        log(`${label} voice:join attempt ${attempt} failed (${err}), retrying…`);
                        setTimeout(tryJoin, VOICE_JOIN_RETRY_MS);
                    } else {
                        warn(`${label} voice:join failed after ${attempt} attempts:`, err);
                        resolve(false);
                    }
                });
            };

            tryJoin();
        });
    }, []);

    useEffect(() => { socketRef.current = socket; }, [socket]);
    useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

    // ── InCallManager device events (BT / wired headset routing) ──
    useEffect(() => {
        const mod = NativeModules.InCallManager;
        if (!mod) return;

        const emitter = new NativeEventEmitter(mod);

        const onDeviceChanged = (data: {
            availableAudioDeviceList?: string;
            selectedAudioDevice?: string;
        }) => {
            const routes = parseAvailableRoutes(data?.availableAudioDeviceList);
            if (routes.length > 0) setAvailableRoutes(routes);
            const selected = parseRoute(data?.selectedAudioDevice);
            if (selected) setAudioRouteState(selected);
        };

        const onWiredHeadset = () => {
            if (!roomIdRef.current) return;
            void InCallManager.chooseAudioRoute('WIRED_HEADSET').catch(() => {});
        };

        const sub1 = emitter.addListener('onAudioDeviceChanged', onDeviceChanged);
        const sub2 = emitter.addListener('WiredHeadset', onWiredHeadset);
        const sub3 = emitter.addListener('NoisyAudio', onWiredHeadset);

        return () => {
            sub1.remove();
            sub2.remove();
            sub3.remove();
        };
    }, []);

    const setAudioRoute = useCallback(async (route: AudioRoute) => {
        const applied = await applyAudioRoute(route);
        setAudioRouteState(applied);
    }, []);

    // Resolve my user id once + pre-warm TURN credentials for faster voice join
    useEffect(() => {
        (async () => {
            const { data } = await supabase.auth.getUser();
            myUserIdRef.current = data.user?.id ?? null;
            log('myUserId =', myUserIdRef.current);
            if (data.user) {
                iceServersRef.current = await getIceServers();
            }
        })();
    }, []);

    // Refresh TURN credentials periodically while in a voice room
    useEffect(() => {
        if (!roomId) return;
        const id = setInterval(() => {
            void getIceServers().then(servers => { iceServersRef.current = servers; });
        }, 30 * 60 * 1000);
        return () => clearInterval(id);
    }, [roomId]);

    // ── Public peer list helper ──
    const exposePeers = useCallback(() => {
        const list: PublicPeer[] = [];
        let allUp = true;
        for (const p of peersRef.current.values()) {
            const ice = (p.pc as any).iceConnectionState as string | undefined;
            const connected = ice === 'connected' || ice === 'completed';
            if (!connected) allUp = false;
            list.push({
                userId: p.userId,
                muted: p.muted,
                hasAudio: p.stream ? p.stream.getAudioTracks().length > 0 : false,
                connected,
            });
        }
        setPeers(list);
        setAllPeersConnected(list.length === 0 || allUp);
    }, []);

    // ── Cleanup helpers ──
    const stopLocalStream = useCallback(() => {
        const s = localStreamRef.current;
        if (s) {
            s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        }
        localStreamRef.current = null;
    }, []);

    const closePeer = useCallback((userId: string) => {
        const timer = restartTimersRef.current.get(userId);
        if (timer) {
            clearTimeout(timer);
            restartTimersRef.current.delete(userId);
        }
        const p = peersRef.current.get(userId);
        if (!p) return;
        try { p.pc.close(); } catch {}
        peersRef.current.delete(userId);
        log('closed peer', userId);
        exposePeers();
    }, [exposePeers]);

    const closeAllPeers = useCallback(() => {
        for (const u of Array.from(peersRef.current.keys())) closePeer(u);
    }, [closePeer]);

    // ── Decide who offers when both peers race ──
    // The "lower" userId offers, the "higher" one waits for the offer.
    const shouldOffer = (remoteUserId: string): boolean => {
        const me = myUserIdRef.current;
        if (!me) return false;
        return me < remoteUserId;
    };

    // ── ICE failure recovery ──────────────────────────────────────
    // On 'failed' rebuild immediately; on 'disconnected' give ICE a
    // grace window to self-heal first. The lower userId re-offers, the
    // higher side just tears down and waits for the incoming offer.
    const scheduleRebuild = useCallback((remoteUserId: string, delayMs: number) => {
        if (restartTimersRef.current.has(remoteUserId)) return;

        const timer = setTimeout(() => {
            restartTimersRef.current.delete(remoteUserId);
            const state = peersRef.current.get(remoteUserId);
            if (!state) return;
            const ice = (state.pc as any).iceConnectionState;
            if (ice === 'connected' || ice === 'completed') return; // self-healed
            if (!roomIdRef.current || !localStreamRef.current) return;

            log('rebuilding peer after ICE', ice, '→', remoteUserId);
            closePeer(remoteUserId);
            if (shouldOffer(remoteUserId)) {
                createPeerRef.current?.(remoteUserId, true);
            }
        }, delayMs);

        restartTimersRef.current.set(remoteUserId, timer);
    }, [closePeer]);

    const flushPendingIceFor = useCallback(async (userId: string, state: PeerState) => {
        const buffered = pendingIceRef.current.get(userId) ?? [];
        pendingIceRef.current.delete(userId);
        for (const c of buffered) {
            try { await state.pc.addIceCandidate(new RTCIceCandidate(c)); }
            catch (e) { warn('flushPendingIce: addIceCandidate failed:', e); }
        }
    }, []);

    // ── Create / get peer ─────────────────────────────────────────
    const createPeer = useCallback(
        (remoteUserId: string, isInitialOfferer: boolean): PeerState => {
            const existing = peersRef.current.get(remoteUserId);
            if (existing) {
                const ice = (existing.pc as any).iceConnectionState;
                if (ice !== 'failed' && ice !== 'closed') return existing;
                closePeer(remoteUserId);
            }

            log('createPeer', remoteUserId, 'isOfferer=', isInitialOfferer);

            const pc = new RTCPeerConnection({
                iceServers: iceServersRef.current,
                // @ts-ignore
                iceTransportPolicy: 'all',
                // @ts-ignore — RN-WebRTC supports these but the types omit them
                bundlePolicy: 'max-bundle',
                // @ts-ignore
                rtcpMuxPolicy: 'require',
            });

            // Add local audio tracks
            const local = localStreamRef.current;
            if (local) {
                for (const track of local.getTracks()) {
                    try { pc.addTrack(track, local); }
                    catch (e) { warn('addTrack failed:', e); }
                }
            } else {
                warn('createPeer: no localStream yet — peer will be useless until we have it');
            }

            const state: PeerState = {
                userId: remoteUserId,
                pc,
                stream: null,
                muted: false,
                remoteDescriptionSet: false,
                pendingCandidates: [],
            };

            // ── ICE candidate emission (use refs — never stale) ──
            const onIceCandidate = (e: any) => {
                if (!e?.candidate) return;
                const s = socketRef.current;
                const rid = roomIdRef.current;
                if (!s || !rid) {
                    warn('onIceCandidate: no socket/roomId — dropping candidate');
                    return;
                }
                s.emit('voice:ice', {
                    roomId: rid,
                    targetUserId: remoteUserId,
                    candidate: e.candidate,
                });
            };
            (pc as any).addEventListener?.('icecandidate', onIceCandidate);
            (pc as any).onicecandidate = onIceCandidate;

            // ── Remote track (audio) handler ──
            const onTrack = (e: any) => {
                log('ontrack', remoteUserId, 'streams=', e.streams?.length);
                let remoteStream: MediaStream | null = null;
                if (e.streams && e.streams.length > 0) {
                    remoteStream = e.streams[0];
                } else if (e.track) {
                    remoteStream = new MediaStream();
                    remoteStream.addTrack(e.track);
                }
                state.stream = remoteStream;
                exposePeers();
            };
            (pc as any).addEventListener?.('track', onTrack);
            (pc as any).ontrack = onTrack;

            // Legacy fallback
            (pc as any).onaddstream = (e: any) => {
                log('onaddstream', remoteUserId);
                state.stream = e.stream;
                exposePeers();
            };

            // ── State change logs + ICE failure recovery ──
            (pc as any).onconnectionstatechange = () => {
                log('connectionState', remoteUserId, pc.connectionState);
                exposePeers();
            };
            (pc as any).oniceconnectionstatechange = () => {
                const ice = (pc as any).iceConnectionState;
                log('iceState', remoteUserId, ice);
                exposePeers();
                if (ice === 'connected' || ice === 'completed') {
                    const timer = restartTimersRef.current.get(remoteUserId);
                    if (timer) {
                        clearTimeout(timer);
                        restartTimersRef.current.delete(remoteUserId);
                    }
                } else if (ice === 'failed') {
                    scheduleRebuild(remoteUserId, 0);
                } else if (ice === 'disconnected') {
                    scheduleRebuild(remoteUserId, 4000);
                }
            };
            (pc as any).onsignalingstatechange = () => {
                log('signalingState', remoteUserId, pc.signalingState);
            };

            peersRef.current.set(remoteUserId, state);
            exposePeers();

            // ── Optional: send first offer ──
            if (isInitialOfferer) {
                (async () => {
                    try {
                        // Tiny delay so addTrack flushes before SDP negotiation
                        await new Promise(r => setTimeout(r, 30));
                        const offer = await pc.createOffer({
                            offerToReceiveAudio: 1,
                            offerToReceiveVideo: 0,
                        } as any);
                        await pc.setLocalDescription(offer);

                        const s = socketRef.current;
                        const rid = roomIdRef.current;
                        if (!s || !rid) {
                            warn('offer ready but no socket/roomId — dropping');
                            return;
                        }
                        s.emit('voice:offer', {
                            roomId: rid,
                            targetUserId: remoteUserId,
                            sdp: offer,
                        });
                        log('sent voice:offer →', remoteUserId, 'roomId=', rid);
                    } catch (e) {
                        warn('offer creation failed:', e);
                    }
                })();
            }

            return state;
        },
        [exposePeers, scheduleRebuild, closePeer],
    );

    // Keep a ref so scheduleRebuild (defined earlier) can call the latest createPeer
    useEffect(() => { createPeerRef.current = createPeer; }, [createPeer]);

    // ── Flush buffered ICE candidates after remote description is set ──
    const flushPendingCandidates = useCallback(async (state: PeerState) => {
        for (const c of state.pendingCandidates) {
            try { await state.pc.addIceCandidate(new RTCIceCandidate(c)); }
            catch (e) { warn('flushPendingCandidates: addIceCandidate failed:', e); }
        }
        state.pendingCandidates = [];
        await flushPendingIceFor(state.userId, state);
    }, [flushPendingIceFor]);

    // ── Socket signaling handlers ─────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const onPeerJoined = ({ userId: remoteId }: any) => {
            log('voice:peer-joined ←', remoteId);
            // Only act if we ourselves are currently in a voice room.
            if (!roomIdRef.current) return;
            if (!localStreamRef.current) return;
            if (peersRef.current.has(remoteId)) return;
            if (remoteId === myUserIdRef.current) return;
            // Glare prevention: the peer with the lower userId is the offerer.
            const iOffer = shouldOffer(remoteId);
            log('new peer joined, iOffer=', iOffer);
            createPeer(remoteId, iOffer);
        };

        const onPeerLeft = ({ userId: remoteId }: any) => {
            log('voice:peer-left ←', remoteId);
            closePeer(remoteId);
        };

        const onOffer = async ({ fromUserId, sdp }: any) => {
            try {
                log('voice:offer ←', fromUserId);
                if (!fromUserId || !sdp) return;
                if (!localStreamRef.current) {
                    warn('received offer but no localStream yet — ignoring');
                    return;
                }
                let state = peersRef.current.get(fromUserId);
                if (!state) state = createPeer(fromUserId, false);

                await state.pc.setRemoteDescription(new RTCSessionDescription(sdp));
                state.remoteDescriptionSet = true;
                await flushPendingCandidates(state);

                const answer = await state.pc.createAnswer();
                await state.pc.setLocalDescription(answer);

                const s = socketRef.current;
                const rid = roomIdRef.current;
                if (!s || !rid) {
                    warn('answer ready but no socket/roomId — dropping');
                    return;
                }
                s.emit('voice:answer', {
                    roomId: rid,
                    targetUserId: fromUserId,
                    sdp: answer,
                });
                log('sent voice:answer →', fromUserId);
            } catch (e) {
                warn('voice:offer handler error:', e);
            }
        };

        const onAnswer = async ({ fromUserId, sdp }: any) => {
            try {
                log('voice:answer ←', fromUserId);
                const state = peersRef.current.get(fromUserId);
                if (!state) {
                    warn('received answer for unknown peer', fromUserId);
                    return;
                }
                await state.pc.setRemoteDescription(new RTCSessionDescription(sdp));
                state.remoteDescriptionSet = true;
                await flushPendingCandidates(state);
            } catch (e) {
                warn('voice:answer handler error:', e);
            }
        };

        const onIce = async ({ fromUserId, candidate }: any) => {
            try {
                if (!fromUserId || !candidate) return;
                const state = peersRef.current.get(fromUserId);
                if (!state) {
                    const buf = pendingIceRef.current.get(fromUserId) ?? [];
                    buf.push(candidate);
                    pendingIceRef.current.set(fromUserId, buf);
                    log('voice:ice buffered for future peer', fromUserId, 'count=', buf.length);
                    return;
                }
                if (!state.remoteDescriptionSet) {
                    state.pendingCandidates.push(candidate);
                    return;
                }
                await state.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                warn('voice:ice handler error:', e);
            }
        };

        const onMute = ({ userId: remoteId, muted }: any) => {
            const state = peersRef.current.get(remoteId);
            if (state) {
                state.muted = !!muted;
                exposePeers();
            }
        };

        socket.on('voice:peer-joined', onPeerJoined);
        socket.on('voice:peer-left', onPeerLeft);
        socket.on('voice:offer', onOffer);
        socket.on('voice:answer', onAnswer);
        socket.on('voice:ice', onIce);
        socket.on('voice:mute', onMute);

        return () => {
            socket.off('voice:peer-joined', onPeerJoined);
            socket.off('voice:peer-left', onPeerLeft);
            socket.off('voice:offer', onOffer);
            socket.off('voice:answer', onAnswer);
            socket.off('voice:ice', onIce);
            socket.off('voice:mute', onMute);
        };
    }, [socket, createPeer, closePeer, exposePeers, flushPendingCandidates]);

    // ── join() ────────────────────────────────────────────────────
    const join = useCallback(
        async (newRoomId: string) => {
            const s = socketRef.current;
            if (!s) {
                warn('join: no socket');
                return;
            }
            if (roomIdRef.current && roomIdRef.current !== newRoomId) {
                log('switching voice rooms, leaving', roomIdRef.current);
                closeAllPeers();
                s.emit('voice:leave', { roomId: roomIdRef.current });
            }

            // 1. mic permission
            const granted = await requestMicPermission();
            setMicPermission(granted ? 'granted' : 'denied');
            if (!granted) { warn('Mic permission denied'); return; }

            // 2. fetch fresh TURN credentials (works across NAT / mobile networks)
            iceServersRef.current = await getIceServers();

            // 3. get local stream BEFORE signaling so addTrack always works
            try {
                const stream = await mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    } as any,
                    video: false,
                });
                localStreamRef.current = stream as unknown as MediaStream;
                log('got local stream, audio tracks =',
                    (stream as unknown as MediaStream).getAudioTracks().length);
            } catch (e) {
                warn('getUserMedia failed:', e);
                setMicPermission('denied');
                return;
            }

            // 4. start InCallManager session (auto-routes BT / headset)
            startAudioSession();

            // 5. register on server (retries until socket room:join has completed)
            roomIdRef.current = newRoomId;
            const ok = await announceVoiceJoin(newRoomId, 'join');
            if (!ok) {
                warn('join: server voice registration failed — rolling back');
                roomIdRef.current = null;
                closeAllPeers();
                stopLocalStream();
                stopAudioSession();
                setRoomId(null);
                setPeers([]);
                return;
            }

            // 6. update UI state
            setRoomId(newRoomId);
        },
        [closeAllPeers, stopLocalStream, announceVoiceJoin],
    );

    // ── resync() — same room, rebuild signaling + WebRTC peers ─────
    const resync = useCallback(() => {
        const s = socketRef.current;
        const rid = roomIdRef.current;
        if (!s?.connected || !rid || !localStreamRef.current) {
            warn('resync: not ready', { connected: s?.connected, rid, hasStream: !!localStreamRef.current });
            return;
        }
        log('voice resync →', rid);
        closeAllPeers();
        startAudioSession();
        void (async () => {
            iceServersRef.current = await getIceServers();
            const ok = await announceVoiceJoin(rid, 'resync');
            if (!ok) warn('resync: server voice registration failed');
        })();
    }, [closeAllPeers, announceVoiceJoin]);

    // ── leave() ───────────────────────────────────────────────────
    const leave = useCallback(() => {
        const s = socketRef.current;
        const rid = roomIdRef.current;
        if (s && rid) s.emit('voice:leave', { roomId: rid });
        closeAllPeers();
        stopLocalStream();
        stopAudioSession();
        pendingIceRef.current.clear();
        roomIdRef.current = null;
        setRoomId(null);
        setIsMuted(false);
        setPeers([]);
        setAudioRouteState('SPEAKER_PHONE');
        setAvailableRoutes(['SPEAKER_PHONE', 'EARPIECE']);
    }, [closeAllPeers, stopLocalStream]);

    // ── mute ──────────────────────────────────────────────────────
    const setMutedFn = useCallback((muted: boolean) => {
        const stream = localStreamRef.current;
        if (stream) {
            for (const t of stream.getAudioTracks()) t.enabled = !muted;
        }
        safe(() => InCallManager.setMicrophoneMute(muted), 'setMicrophoneMute');
        setIsMuted(muted);
        const s = socketRef.current;
        const rid = roomIdRef.current;
        if (s && rid) s.emit('voice:mute', { roomId: rid, muted });
    }, []);

    const toggleMute = useCallback(() => {
        setMutedFn(!isMuted);
    }, [isMuted, setMutedFn]);

    // ── Cleanup on unmount ────────────────────────────────────────
    useEffect(() => {
        return () => {
            closeAllPeers();
            stopLocalStream();
            stopAudioSession();
        };
    }, [closeAllPeers, stopLocalStream]);

    // ── Cleanup on socket disconnect / reconnect ───────────────────
    useEffect(() => {
        if (!socket) return;
        const onDisconnect = () => {
            log('socket disconnected — tearing down peers');
            closeAllPeers();
        };
        const onConnect = () => {
            const rid = roomIdRef.current;
            if (!rid || !localStreamRef.current) return;
            log('socket reconnected — re-syncing voice room');
            closeAllPeers();
            startAudioSession();
            void (async () => {
                iceServersRef.current = await getIceServers();
                const ok = await announceVoiceJoin(rid, 'reconnect');
                if (!ok) warn('voice re-join after socket reconnect failed');
            })();
        };
        socket.on('disconnect', onDisconnect);
        socket.on('connect', onConnect);
        return () => {
            socket.off('disconnect', onDisconnect);
            socket.off('connect', onConnect);
        };
    }, [socket, closeAllPeers, announceVoiceJoin]);

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
            allPeersConnected,
        }),
        [roomId, isMuted, peers, micPermission, audioRoute, availableRoutes, join, leave, resync, toggleMute, setMutedFn, setAudioRoute, allPeersConnected],
    );

    return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
