import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { getSocialSummary, type SocialSummary } from '@/apis/social-api';
import { useSocket } from '@/components/SocketProvider';
import { loadBlocks } from '@/hooks/useBlocks';

type SocialCtxValue = {
    summary: SocialSummary;
    /** Bumps whenever friends / requests / notifications change on the server — refetch on change. */
    revision: number;
    /** Call after a local change (accept, remove, mark read…). */
    refresh: () => void;
};

const EMPTY: SocialSummary = { unreadNotifications: 0, incomingRequests: 0, outgoingRequests: 0, friends: 0 };

const SocialCtx = createContext<SocialCtxValue>({ summary: EMPTY, revision: 0, refresh: () => {} });

export function useSocial() {
    return useContext(SocialCtx);
}

/** Badge counts for the notifications tab and the friends button, kept live over the socket. */
export function SocialProvider({ children }: { children: React.ReactNode }) {
    const { socket, connectGeneration } = useSocket();
    const [summary, setSummary] = useState<SocialSummary>(EMPTY);
    const [revision, setRevision] = useState(0);

    const loadSummary = useCallback(async () => {
        const res = await getSocialSummary();
        if (res.ok) setSummary(res.data.data);
        else if (res.status === 401) setSummary(EMPTY);
    }, []);

    const refresh = useCallback(() => {
        setRevision(r => r + 1);
        void loadSummary();
    }, [loadSummary]);

    // On every (re)connect: signing in, coming back online, a fresh socket after resume.
    useEffect(() => {
        if (connectGeneration === 0) return;
        void loadSummary();
        void loadBlocks();
    }, [connectGeneration, loadSummary]);

    useEffect(() => {
        if (!socket) return;
        // Blocking also unfriends, so the counts move too.
        const onBlocks = () => {
            void loadBlocks();
            refresh();
        };
        socket.on('social:update', refresh);
        socket.on('blocks:update', onBlocks);
        return () => {
            socket.off('social:update', refresh);
            socket.off('blocks:update', onBlocks);
        };
    }, [socket, refresh]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', s => {
            if (s === 'active') void loadSummary();
        });
        return () => sub.remove();
    }, [loadSummary]);

    const value = useMemo(() => ({ summary, revision, refresh }), [summary, revision, refresh]);
    return <SocialCtx.Provider value={value}>{children}</SocialCtx.Provider>;
}
