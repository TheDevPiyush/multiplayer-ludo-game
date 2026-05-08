import { Stack } from 'expo-router';

export default function AuthLayoutNav() {
    return (
        <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
    );
}