import { EMOTES, QUICK_REPLIES, type Reaction } from '@ludo/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSocket } from '@/components/SocketProvider';
import { useBlockedIds } from '@/hooks/useBlocks';
import { useIsGuest } from '@/hooks/useIsGuest';

export type ChatMessage = { id: string; userId: string; text: string; at: number };

/** What pops over a player's seat: an emote, a quick reply or a chat line. */
export type Bubble = { key: string; userId: string; emoji?: string; text?: string };

export type SendResult = { ok: true } | { ok: false; error: string };

/** How long a bubble stays over the seat. */
const BUBBLE_MS = 2_600;
const MESSAGES_KEPT = 60;

const EMOJI = Object.fromEntries(EMOTES.map(e => [e.id, e.emoji])) as Record<string, string>;
const QUICK = Object.fromEntries(QUICK_REPLIES.map(q => [q.id, q.text])) as Record<string, string>;

/** Players muted per room; kept for the app session so the lobby → board switch keeps them. */
const mutedByRoom = new Map<string, Set<string>>();
/** This player's chat lock (it applies in every room), shared by all screens. */
let lockedUntilShared: number | null = null;

function bubbleFor(userId: string, r: Reaction): Bubble {
    const key = `${userId}:${Date.now()}`;
    return r.kind === 'emote' ? { key, userId, emoji: EMOJI[r.id] } : { key, userId, text: QUICK[r.id] };
}

/**
 * Emotes, quick replies and text chat in one online room. `joinCount` is
 * useGameRoom's: the server only answers sockets that have joined the room.
 */
export function useRoomChat(roomId: string, currentUserId: string | null, joinCount: number) {
    const { socket, isRealtimeReady } = useSocket();
    const guest = useIsGuest();
    const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [unread, setUnread] = useState(0);
    /** The server's answer; until it arrives, guests are assumed not to have chat. */
    const [serverCanChat, setServerCanChat] = useState<boolean | null>(null);
    const canChat = serverCanChat ?? !guest;
    const [lockedUntil, setLockedUntilState] = useState<number | null>(lockedUntilShared);
    const [mutedHere, setMuted] = useState<Set<string>>(() => mutedByRoom.get(roomId) ?? new Set());
    const blocked = useBlockedIds();
    /** Muted in this room, or blocked: hidden either way. */
    const hidden = useMemo(() => (blocked.size ? new Set([...mutedHere, ...blocked]) : mutedHere), [mutedHere, blocked]);
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const sheetOpenRef = useRef(false);
    const mutedRef = useRef(hidden);
    mutedRef.current = hidden;

    const setLockedUntil = useCallback((until: number | null) => {
        lockedUntilShared = until;
        setLockedUntilState(until);
    }, []);

    const showBubble = useCallback((b: Bubble) => {
        if (mutedRef.current.has(b.userId)) return;
        setBubbles(prev => ({ ...prev, [b.userId]: b }));
        const t = timers.current;
        clearTimeout(t.get(b.userId));
        t.set(b.userId, setTimeout(() => {
            t.delete(b.userId);
            setBubbles(prev => {
                if (prev[b.userId]?.key !== b.key) return prev;
                const { [b.userId]: _, ...rest } = prev;
                return rest;
            });
        }, BUBBLE_MS));
    }, []);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const addMessage = useCallback((m: ChatMessage) => {
        setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m].slice(-MESSAGES_KEPT)));
    }, []);

    // Live events.
    useEffect(() => {
        if (!socket) return;
        const onReaction = (p: Reaction & { userId: string }) => showBubble(bubbleFor(p.userId, p));
        const onChat = (m: ChatMessage) => {
            addMessage(m);
            if (mutedRef.current.has(m.userId)) return;
            showBubble({ key: m.id, userId: m.userId, text: m.text });
            if (!sheetOpenRef.current) setUnread(n => n + 1);
        };
        const onLocked = (p: { lockedUntil: number }) => setLockedUntil(p.lockedUntil);
        socket.on('room:reaction', onReaction);
        socket.on('room:chat', onChat);
        socket.on('chat:locked', onLocked);
        return () => {
            socket.off('room:reaction', onReaction);
            socket.off('room:chat', onChat);
            socket.off('chat:locked', onLocked);
        };
    }, [socket, showBubble, addMessage, setLockedUntil]);

    // What was said before this screen opened (e.g. in the lobby), and after each rejoin.
    useEffect(() => {
        if (!socket || !isRealtimeReady || joinCount === 0 || !roomId) return;
        let cancelled = false;
        socket.timeout(8_000).emit('room:chat-history', { roomId }, (err: unknown, res: any) => {
            if (cancelled || err || !res?.ok) return;
            setMessages(res.data.messages ?? []);
            setServerCanChat(res.data.canChat !== false);
            setLockedUntil(res.data.lockedUntil ?? null);
        });
        return () => {
            cancelled = true;
        };
    }, [socket, isRealtimeReady, joinCount, roomId, setLockedUntil]);

    // The lock ends on its own.
    useEffect(() => {
        if (!lockedUntil) return;
        const t = setTimeout(() => setLockedUntil(null), Math.max(0, lockedUntil - Date.now()));
        return () => clearTimeout(t);
    }, [lockedUntil, setLockedUntil]);

    const react = useCallback((reaction: Reaction) => {
        if (!socket?.connected || !currentUserId) return;
        showBubble(bubbleFor(currentUserId, reaction));
        socket.emit('room:react', { roomId, ...reaction });
    }, [socket, roomId, currentUserId, showBubble]);

    const send = useCallback((text: string): Promise<SendResult> => new Promise(resolve => {
        if (!socket?.connected) return resolve({ ok: false, error: 'Not connected.' });
        socket.timeout(8_000).emit('room:chat', { roomId, text }, (err: unknown, res: any) => {
            if (err) return resolve({ ok: false, error: 'Message not sent. Try again.' });
            if (res?.ok) {
                addMessage(res.data);
                showBubble({ key: res.data.id, userId: res.data.userId, text: res.data.text });
                return resolve({ ok: true });
            }
            if (res?.code === 'chat_locked') setLockedUntil(res.lockedUntil ?? null);
            if (res?.code === 'account_required') setServerCanChat(false);
            resolve({ ok: false, error: res?.error ?? 'Message not sent.' });
        });
    }), [socket, roomId, addMessage, showBubble, setLockedUntil]);

    // Someone just blocked drops their bubble at once.
    useEffect(() => {
        setBubbles(prev => {
            const gone = Object.keys(prev).filter(id => blocked.has(id));
            if (gone.length === 0) return prev;
            const next = { ...prev };
            for (const id of gone) delete next[id];
            return next;
        });
    }, [blocked]);

    const toggleMute = useCallback((userId: string) => {
        setMuted(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            mutedByRoom.set(roomId, next);
            return next;
        });
        setBubbles(prev => {
            if (!prev[userId]) return prev;
            const { [userId]: _, ...rest } = prev;
            return rest;
        });
    }, [roomId]);

    /** The chat sheet is showing: nothing is unread while it is. */
    const setSheetOpen = useCallback((open: boolean) => {
        sheetOpenRef.current = open;
        if (open) setUnread(0);
    }, []);

    return {
        bubbles,
        messages,
        unread,
        canChat,
        lockedUntil,
        /** Hidden players: muted in this room or blocked. */
        muted: hidden,
        /** Muted in this room only (the chat sheet's toggles). */
        mutedHere,
        blocked,
        react,
        send,
        toggleMute,
        setSheetOpen,
    };
}

export type RoomChat = ReturnType<typeof useRoomChat>;
