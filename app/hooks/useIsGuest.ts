import { useSyncExternalStore } from 'react';

import { supabase } from '@/util/supabase-client';

// Whether this player is a guest (Supabase anonymous sign-in), from the local
// session: no network call. Kept at module level so screens get the answer on
// their first render, and updated the moment a guest links Google or an email.

let guest = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => {
    if (next === guest) return;
    guest = next;
    listeners.forEach(l => l());
};

void supabase.auth.getSession().then(({ data }) => set(data.session?.user.is_anonymous === true));
supabase.auth.onAuthStateChange((_event, session) => set(session?.user.is_anonymous === true));

export function useIsGuest(): boolean {
    return useSyncExternalStore(
        l => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => guest,
    );
}
