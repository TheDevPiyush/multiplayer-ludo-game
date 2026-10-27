import { Stack } from 'expo-router';
import React from 'react'

/**
 * `dangerouslySingular`: a screen is never stacked twice. A second push (e.g. a
 * fast double tap on a Home button) goes to the copy already open instead of
 * opening another one on top.
 */
export default function GameRoomLayout() {
    return (
        <Stack initialRouteName="create-room" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="create-room" dangerouslySingular />
            <Stack.Screen name="join-room" dangerouslySingular />
            <Stack.Screen name="quick-match" dangerouslySingular options={{ animation: 'fade' }} />
            <Stack.Screen name="lobby" dangerouslySingular />
            <Stack.Screen name="board" dangerouslySingular />
            <Stack.Screen name="local-setup" dangerouslySingular />
            <Stack.Screen name="local-board" dangerouslySingular options={{ gestureEnabled: false }} />
        </Stack>
    )
}
