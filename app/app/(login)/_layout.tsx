import { Stack } from 'expo-router';

export default function AuthLayoutNav() {
    return (
        <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
                name="otp"
                options={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: 'transparent' } }}
            />
        </Stack>
    );
}