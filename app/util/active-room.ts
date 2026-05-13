import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'simpleludo:active-room';

export type ActiveRoom = {
    roomId: string;
    gameCode: string;
    maxPlayers: number;
    /** 'lobby' | 'board' — where to resume */
    screen: 'lobby' | 'board';
};

export async function setActiveRoom(r: ActiveRoom | null) {
    if (!r) {
        await AsyncStorage.removeItem(KEY);
        return;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(r));
}

export async function getActiveRoom(): Promise<ActiveRoom | null> {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        if (!raw) return null;
        return JSON.parse(raw) as ActiveRoom;
    } catch {
        return null;
    }
}
