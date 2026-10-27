import { useSyncExternalStore } from 'react';

import { blockUser, getBlocks, unblockUser, type BlockedUser } from '@/apis/social-api';
import { supabase } from '@/util/supabase-client';

// Players this one has blocked, shared by every screen: rooms hide their emotes
// and chat (the server does too) and label their seats. Loaded by SocialProvider
// on each connect and whenever another device changes the list.

let list: BlockedUser[] = [];
let ids = new Set<string>();
const listeners = new Set<() => void>();

function publish(nextList: BlockedUser[], nextIds = new Set(nextList.map(b => b.user.id))) {
    list = nextList;
    ids = nextIds;
    listeners.forEach(l => l());
}

supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') publish([]);
});

export async function loadBlocks() {
    const res = await getBlocks();
    if (res.ok) publish(res.data.data);
    else if (res.status === 401) publish([]);
}

/** Blocks straight away on this phone; undone if the server refuses. */
export async function blockPlayer(userId: string): Promise<{ ok: boolean; error?: string }> {
    publish(list, new Set(ids).add(userId));
    const res = await blockUser(userId);
    if (!res.ok) {
        const next = new Set(ids);
        next.delete(userId);
        publish(list, next);
        return { ok: false, error: res.error };
    }
    void loadBlocks();
    return { ok: true };
}

export async function unblockPlayer(userId: string): Promise<{ ok: boolean; error?: string }> {
    const before = list;
    publish(list.filter(b => b.user.id !== userId));
    const res = await unblockUser(userId);
    if (!res.ok) {
        publish(before);
        return { ok: false, error: res.error };
    }
    return { ok: true };
}

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};

export function useBlockedIds(): Set<string> {
    return useSyncExternalStore(subscribe, () => ids);
}

export function useBlockedUsers(): BlockedUser[] {
    return useSyncExternalStore(subscribe, () => list);
}
