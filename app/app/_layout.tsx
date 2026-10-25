// Must stay first: a real crypto.getRandomValues for Supabase PKCE. LiveKit's
// registerGlobals() otherwise creates a global.crypto that only has randomUUID.
import 'react-native-get-random-values';
import { registerGlobals } from '@livekit/react-native';
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
import { SocialProvider } from '@/components/SocialProvider';
import { InviteBanner } from '@/components/InviteBanner';
import { AudioDirector } from '@/components/AudioDirector';
import { friendsHref, takePendingLink } from '@/util/links';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(login)',
};

// WebRTC globals LiveKit needs; must run before any voice code.
registerGlobals();

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // Plus Jakarta Sans, SIL Open Font License (assets/fonts/PlusJakartaSans-OFL.txt).
    'PlusJakartaSans-Medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'PlusJakartaSans-SemiBold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'PlusJakartaSans-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
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
      // A link opened the app (or arrived while signed out): go there now.
      const link = takePendingLink();
      if (link?.kind === 'join') {
        router.replace({ pathname: '/join/[code]', params: { code: link.code } });
        return;
      }
      if (link?.kind === 'friends') {
        router.replace('/(tabs)');
        router.push(friendsHref(link.tab));
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

    // Route only when the signed-in state actually changes. Token refreshes
    // (e.g. every time the app returns to the foreground) must not navigate,
    // or they yank players out of whatever screen they're on.
    let signedIn: boolean | null = null;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = !!session;
      if (next === signedIn) return;
      signedIn = next;
      void resume(next);
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
    void SystemUI.setBackgroundColorAsync('#4B3BF2');
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
        <SocialProvider>
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
                  <Stack.Screen name="edit-username" dangerouslySingular options={{ headerShown: false, presentation: 'modal' }} />
                  <Stack.Screen name="save-progress" dangerouslySingular options={{ headerShown: false, animation: 'slide_from_right' }} />
                  <Stack.Screen
                    name="friends"
                    dangerouslySingular
                    options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
                  />
                  <Stack.Screen name="join/[code]" dangerouslySingular options={{ headerShown: false, gestureEnabled: false }} />
                </Stack>
                <InviteBanner />
                <AudioDirector />
              </LudoBackground>
            </ThemeProvider>
          </VoiceRoomProvider>
        </SocialProvider>
      </SocketProvider>
    </PaperProvider>
  );
}
