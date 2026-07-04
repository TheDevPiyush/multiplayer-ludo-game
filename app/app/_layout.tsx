import { ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { useRouter, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/components/useColorScheme';
import { navigationTheme } from '@/components/NavigationTheme';
import { supabase } from '@/util/supabase-client';
import { MD3DarkTheme, PaperProvider } from 'react-native-paper';
import { SocketProvider } from '@/components/SocketProvider';
import { VoiceRoomProvider } from '@/components/VoiceRoomProvider';
import { LudoBackground } from '@/components/LudoBackground';
import { getActiveRoom } from '@/util/active-room';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(login)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Hellix-Medium': require('../assets/fonts/Hellix-Medium.ttf'),
    'Hellix-SemiBold': require('../assets/fonts/Hellix-SemiBold.ttf'),
    'Hellix-Bold': require('../assets/fonts/Hellix-Bold.ttf'),
    'SpaceMono-Regular': require('../assets/fonts/SpaceMono-Regular.ttf'),
  })


  const router = useRouter();


  // font loading
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);


  // getting session from supabase + auto-resume active room
  useEffect(() => {
    const resume = async (loggedIn: boolean) => {
      if (!loggedIn) {
        router.replace('/(login)');
        return;
      }
      const active = await getActiveRoom();
      if (active && active.roomId && active.gameCode) {
        if (active.screen === 'board') {
          router.replace({
            pathname: '/(game)/board',
            params: { gameCode: active.gameCode, roomId: active.roomId },
          });
        } else {
          router.replace({
            pathname: '/(game)/lobby',
            params: {
              gameCode: active.gameCode,
              roomId: active.roomId,
              maxPlayers_: String(active.maxPlayers),
            },
          });
        }
      } else {
        router.replace('/(tabs)');
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void resume(!!session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void resume(!!session);
    })

    return () => listener.subscription.unsubscribe()
  }, [])



  if (!loaded) {
    return null;
  }

  return (
    <RootLayoutNav />);
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync('#1A1048');
  }, []);

  const theme = {
    ...MD3DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      secondaryContainer: 'rgba(255, 255, 255, 0.12)',
      onSecondaryContainer: 'rgba(255, 255, 255, 1)',
      surface: 'rgba(255, 255, 255, 0.10)',
      onSurface: 'rgba(255, 255, 255, 0.95)',
      onSurfaceVariant: 'rgba(255, 255, 255, 0.58)',
    },
  };


  return (
    <PaperProvider theme={theme}>
      <StatusBar style="light" />
      <SocketProvider>
        <VoiceRoomProvider>
          <ThemeProvider value={navigationTheme(colorScheme)}>
            <LudoBackground style={{ flex: 1 }}>
              <Stack
                initialRouteName={"(login)"}
                screenOptions={{
                  contentStyle: { backgroundColor: 'transparent' },
                  animation: 'fade',
                }}
              >
                <Stack.Screen name="(login)" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(game)" options={{ headerShown: false }} />
                <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
                <Stack.Screen name="edit-username" options={{ headerShown: false, presentation: 'modal' }} />
              </Stack>
            </LudoBackground>
          </ThemeProvider>
        </VoiceRoomProvider>
      </SocketProvider>
    </PaperProvider>
  );
}
