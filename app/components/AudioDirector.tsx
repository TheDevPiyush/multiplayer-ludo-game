import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { useVoiceRoom } from '@/components/VoiceRoomProvider';
import { preloadEffects, setAudioContext } from '@/util/audio';

/** Screens without background music: the game itself (it has its own sounds) and signing in. */
function isMusicScreen(segments: string[]): boolean {
    const [group, screen] = segments;
    if (!group || group === '(login)' || group === 'auth') return false;
    return !(group === '(game)' && (screen === 'board' || screen === 'local-board'));
}

/** Tells the audio engine where the player is (music on menus and the lobby) and whether voice chat is on. */
export function AudioDirector() {
    const segments = useSegments() as string[];
    const { inRoom } = useVoiceRoom();
    const musicScreen = isMusicScreen(segments);

    useEffect(() => {
        setAudioContext({ musicScreen });
        // Signed in: load the effects now so a game's intro and first roll play on time.
        if (musicScreen) preloadEffects();
    }, [musicScreen]);

    useEffect(() => {
        setAudioContext({ inVoice: inRoom });
    }, [inRoom]);

    return null;
}
