import { Stack } from 'expo-router';
import React from 'react'

export default function GameRoomLayout() {
    return (
        <Stack initialRouteName="create-room" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="create-room" />
            <Stack.Screen name="join-room" />
            <Stack.Screen name="board" />
        </Stack>
    )
}
