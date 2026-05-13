import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
    mediaDevices,
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    MediaStream,
    type MediaStreamTrack,
} from 'react-native-webrtc';

import { useSocket } from './SocketProvider';

type PeerState = {
    userId: string;
    pc: RTCPeerConnection;
    stream: MediaStream | null;
    muted: boolean;
};

type PublicPeer = {
    userId: string;
    muted: boolean;
    hasAudio: boolean;
};

type VoiceCtxValue = {
    inRoom: boolean;
    roomId: string | null;
    isMuted: boolean;
    peers: PublicPeer[];
    micPermission: 'unknown' | 'granted' | 'denied';
    join: (roomId: string) => Promise<void>;
    leave: () => void;
    toggleMute: () => void;
    setMuted: (muted: boolean) => void;
};

const VoiceCtx = createContext<VoiceCtxValue>({
    inRoom: false,
    roomId: null,
    isMuted: false,
    peers: [],
    micPermission: 'unknown',
    join: async () => {},
    leave: () => {},
    toggleMute: () => {},
    setMuted: () => {},
});

export function useVoiceRoom() {
    return useContext(VoiceCtx);
}

const ICE_SERVERS: RTCConfiguration['iceServers'] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add TURN servers via env if configured
    ...(process.env.EXPO_PUBLIC_TURN_URL
        ? [
              {
                  urls: process.env.EXPO_PUBLIC_TURN_URL.split(',').map(s => s.trim()),
                  username: process.env.EXPO_PUBLIC_TURN_USERNAME ?? '',
                  credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? '',
              } as any,
          ]
        : []),
];

async function requestMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
        const res = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
                title: 'Microphone access',
                message: 'Simple Ludo needs your microphone for voice chat.',
                buttonPositive: 'Allow',
            }
        );
        return res === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
        return false;
    }
}

export function VoiceRoomProvider({ children }: { children: React.ReactNode }) {
    const { socket } = useSocket();

    const [roomId, setRoomId] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [peers, setPeers] = useState<PublicPeer[]>([]);
    const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');

    const localStreamRef = useRef<MediaStream | null>(null);
    const peersRef = useRef<Map<string, PeerState>>(new Map());
    const myUserIdRef = useRef<string | null>(null);

    const exposePeers = useCallback(() => {
        const list: PublicPeer[] = [];
        for (const p of peersRef.current.values()) {
            list.push({
                userId: p.userId,
                muted: p.muted,
                hasAudio: p.stream ? p.stream.getAudioTracks().length > 0 : false,
            });
        }
        setPeers(list);
    }, []);

    const stopLocalStream = useCallback(() => {
        const s = localStreamRef.current;
        if (s) {
            s.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        }
        localStreamRef.current = null;
    }, []);

    const closePeer = useCallback((userId: string) => {
        const p = peersRef.current.get(userId);
        if (!p) return;
        try {
            p.pc.close();
        } catch {}
        peersRef.current.delete(userId);
        exposePeers();
    }, [exposePeers]);

    const closeAllPeers = useCallback(() => {
        for (const u of Array.from(peersRef.current.keys())) closePeer(u);
    }, [closePeer]);

    const createPeer = useCallback(
        (remoteUserId: string, isOfferer: boolean): PeerState => {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

            const local = localStreamRef.current;
            if (local) {
                for (const track of local.getTracks()) {
                    pc.addTrack(track, local);
                }
            }

            const state: PeerState = {
                userId: remoteUserId,
                pc,
                stream: null,
                muted: false,
            };

            (pc as any).addEventListener('icecandidate', (e: any) => {
                if (e.candidate && socket && roomId) {
                    socket.emit('voice:ice', {
                        roomId,
                        targetUserId: remoteUserId,
                        candidate: e.candidate,
                    });
                }
            });

            (pc as any).addEventListener('track', (e: any) => {
                const remoteStream = (e.streams && e.streams[0]) || new MediaStream();
                if (!e.streams || e.streams.length === 0) {
                    remoteStream.addTrack(e.track);
                }
                state.stream = remoteStream;
                exposePeers();
            });

            (pc as any).addEventListener('connectionstatechange', () => {
                if (
                    pc.connectionState === 'failed' ||
                    pc.connectionState === 'closed' ||
                    pc.connectionState === 'disconnected'
                ) {
                    // Let the remote leave event drive cleanup; do nothing for now
                }
            });

            if (isOfferer) {
                (async () => {
                    try {
                        const offer = await pc.createOffer({});
                        await pc.setLocalDescription(offer);
                        socket?.emit('voice:offer', {
                            roomId,
                            targetUserId: remoteUserId,
                            sdp: offer,
                        });
                    } catch (e) {
                        console.warn('createPeer offer error:', e);
                    }
                })();
            }

            peersRef.current.set(remoteUserId, state);
            exposePeers();
            return state;
        },
        [socket, roomId, exposePeers]
    );

    // ─── Signaling handlers ────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const onPeerJoined = ({ userId: remoteId }: any) => {
            if (!roomId) return;
            if (peersRef.current.has(remoteId)) return;
            if (!myUserIdRef.current) return;
            // Existing peers wait for the new one to offer; the new joiner
            // calls join() and emits 'voice:join' which acks with the list,
            // and then iterates the list creating offers (see join()).
            // So if we receive 'voice:peer-joined' for someone else,
            // we just wait for their offer. No-op here.
        };

        const onPeerLeft = ({ userId: remoteId }: any) => {
            closePeer(remoteId);
        };

        const onOffer = async ({ fromUserId, sdp }: any) => {
            try {
                if (!fromUserId || !sdp) return;
                let state = peersRef.current.get(fromUserId);
                if (!state) state = createPeer(fromUserId, false);
                await state.pc.setRemoteDescription(new RTCSessionDescription(sdp));
                const answer = await state.pc.createAnswer();
                await state.pc.setLocalDescription(answer);
                socket.emit('voice:answer', {
                    roomId,
                    targetUserId: fromUserId,
                    sdp: answer,
                });
            } catch (e) {
                console.warn('voice:offer handler error:', e);
            }
        };

        const onAnswer = async ({ fromUserId, sdp }: any) => {
            try {
                const state = peersRef.current.get(fromUserId);
                if (!state) return;
                await state.pc.setRemoteDescription(new RTCSessionDescription(sdp));
            } catch (e) {
                console.warn('voice:answer handler error:', e);
            }
        };

        const onIce = async ({ fromUserId, candidate }: any) => {
            try {
                const state = peersRef.current.get(fromUserId);
                if (!state) return;
                await state.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('voice:ice handler error:', e);
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
    }, [socket, roomId, createPeer, closePeer, exposePeers]);

    const join = useCallback(
        async (newRoomId: string) => {
            if (!socket) return;
            if (roomId && roomId !== newRoomId) {
                closeAllPeers();
                socket.emit('voice:leave', { roomId });
            }

            const granted = await requestMicPermission();
            setMicPermission(granted ? 'granted' : 'denied');
            if (!granted) {
                console.warn('Microphone permission denied');
                return;
            }

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
            } catch (e) {
                console.warn('getUserMedia failed:', e);
                setMicPermission('denied');
                return;
            }

            setRoomId(newRoomId);

            // Discover existing peers
            socket.emit('voice:join', { roomId: newRoomId }, (res: any) => {
                if (!res?.ok) return;
                const existing: string[] = res.data?.peers ?? [];
                for (const remoteId of existing) {
                    if (!peersRef.current.has(remoteId)) {
                        createPeer(remoteId, true);
                    }
                }
            });
        },
        [socket, roomId, closeAllPeers, createPeer]
    );

    const leave = useCallback(() => {
        if (socket && roomId) socket.emit('voice:leave', { roomId });
        closeAllPeers();
        stopLocalStream();
        setRoomId(null);
        setIsMuted(false);
        setPeers([]);
    }, [socket, roomId, closeAllPeers, stopLocalStream]);

    const setMutedFn = useCallback(
        (muted: boolean) => {
            const stream = localStreamRef.current;
            if (stream) {
                for (const t of stream.getAudioTracks()) {
                    t.enabled = !muted;
                }
            }
            setIsMuted(muted);
            if (socket && roomId) {
                socket.emit('voice:mute', { roomId, muted });
            }
        },
        [socket, roomId]
    );

    const toggleMute = useCallback(() => setMutedFn(!isMuted), [isMuted, setMutedFn]);

    // Track our own userId from socket auth (handshake echoes user via emits)
    useEffect(() => {
        if (!socket) return;
        // socket.io doesn't expose user from server; we obtain it lazily via supabase session
        import('@/util/supabase-client').then(async ({ supabase }) => {
            const { data } = await supabase.auth.getUser();
            myUserIdRef.current = data.user?.id ?? null;
        });
    }, [socket]);

    // Cleanup when socket reconnects: existing peer connections are stale
    useEffect(() => {
        return () => {
            closeAllPeers();
            stopLocalStream();
        };
    }, [closeAllPeers, stopLocalStream]);

    const value = useMemo<VoiceCtxValue>(
        () => ({
            inRoom: !!roomId,
            roomId,
            isMuted,
            peers,
            micPermission,
            join,
            leave,
            toggleMute,
            setMuted: setMutedFn,
        }),
        [roomId, isMuted, peers, micPermission, join, leave, toggleMute, setMutedFn]
    );

    return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
