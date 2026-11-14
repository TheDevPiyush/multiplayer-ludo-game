import { useEffect, useState } from 'react';

/**
 * Whether the app knows yet if someone is signed in, and whether its first routing on that is
 * done. The splash screen stays up until then, and the login screen shows its buttons only to
 * someone who is signed out, so a signed-in player never sees (or taps) them on start.
 */
export type AuthPhase = 'unknown' | 'signedIn' | 'signedOut';

let phase: AuthPhase = 'unknown';
let routed = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());

export function setAuthPhase(next: AuthPhase) {
    if (next === phase) return;
    phase = next;
    emit();
}

/** The first sign-in routing has run (the screen it chose is on its way in). */
export function markInitialRouted() {
    if (routed) return;
    routed = true;
    emit();
}

export function useAuthPhase(): { phase: AuthPhase; routed: boolean } {
    const [, setTick] = useState(0);
    useEffect(() => {
        const l = () => setTick(t => t + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return { phase, routed };
}
