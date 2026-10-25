import AsyncStorage from '@react-native-async-storage/async-storage';

import { setActiveRoom } from '@/util/active-room';
import { supabase } from '@/util/supabase-client';

// Shared wording and actions for guests saving (or leaving) their progress.

/** The Google account / email picked to save a guest already has its own Simple Ludo account. */
export function takenDialog(what: 'Google account' | 'email') {
    return {
        title: 'Already has an account',
        message:
            `That ${what} already has its own Simple Ludo account, so it can't take over your guest progress.\n\n` +
            `To keep your progress, use a ${what} that hasn't been used here yet. ` +
            `Or sign in to that account instead, leaving the guest progress behind.`,
    };
}

export const LEAVE_GUEST_DIALOG = {
    title: 'Leave your guest account?',
    message: "A guest account can't be opened again once you sign out. Its stats and match history will be lost.",
};

/** Signs the guest out (the root layout then shows sign-in). Their guest account is left behind for good. */
export async function leaveGuest() {
    await setActiveRoom(null);
    await supabase.auth.signOut();
    await AsyncStorage.setItem('user', 'null');
}
