// Must stay first: a real crypto.getRandomValues for Supabase PKCE.
import 'react-native-get-random-values';
import { ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { ErrorBoundary as RouterErrorBoundary, useRouter, Stack, type ErrorBoundaryProps } from 'expo-router';
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
import { LudoBackground } from '@/components/LudoBackground';
import { getActiveRoom } from '@/util/active-room';
import { SocialProvider } from '@/components/SocialProvider';
import { InviteBanner } from '@/components/InviteBanner';
import { AudioDirector } from '@/components/AudioDirector';
import { AnnouncementsHost } from '@/components/AnnouncementsHost';
import { friendsHref, setInitialRouteDone, takePendingLink } from '@/util/links';
import { listenForNotificationTaps, startPushTokenSync } from '@/util/push';
import { setAnalyticsUser } from '@/util/analytics';
import { reportError, setMonitoringUser, startMonitoring } from '@/util/monitoring';
import { loadRemoteConfig } from '@/util/remote-config';
import { markInitialRouted, setAuthPhase, useAuthPhase } from '@/util/auth-phase';
import { loadEquipped } from '@/hooks/useShop';

startMonitoring();
void loadRemoteConfig();
void loadEquipped();

/** The router's error screen, plus a report: errors caught here never reach the global crash handler. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => reportError(props.error), [props.error]);
  return <RouterErrorBoundary {...props} />;
}

export const unstable_settings = {
  initialRouteName: '(login)',
};

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
  const { routed } = useAuthPhase();

  // font loading
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // The splash stays up until fonts are in and the first sign-in routing has run, so a signed-in
  // player opens straight onto Home (or their game) instead of glimpsing the login screen.
  // A moment after routing lets the new screen replace the login one; 4 s is the fallback.
  useEffect(() => {
    if (!loaded) return;
    const hide = () => void SplashScreen.hideAsync().catch(() => {});
    const timer = setTimeout(hide, routed ? 200 : 4_000);
    return () => clearTimeout(timer);
  }, [loaded, routed]);


  // Notification taps. Before the sign-in routing below: a tap that launched the app becomes its pending link.
  useEffect(() => listenForNotificationTaps(router), []);

  // Push token to the server on every app open, sign-in and token change (newest 3 devices are kept).
  useEffect(() => startPushTokenSync(), []);

  // getting session from supabase + auto-resume active room
  useEffect(() => {
    const resume = async (loggedIn: boolean) => {
      if (!loggedIn) {
        setInitialRouteDone(false);
        router.replace('/(login)');
        markInitialRouted();
        return;
      }
      const active = await getActiveRoom();
      // From here to the routing below runs in one go (no await), so a link is either
      // pending by now and followed here, or arrives after and is opened directly.
      // A link opened the app (or arrived while signed out): go there.
      const link = takePendingLink();
      setInitialRouteDone(true);
      markInitialRouted();
      if (link?.kind === 'join') {
        router.replace({ pathname: '/join/[code]', params: { code: link.code } });
        return;
      }
      if (link?.kind === 'friends') {
        router.replace('/(tabs)');
        router.push(friendsHref(link.tab));
        return;
      }
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
      // Before the check below: a guest saving their account stays signed in but changes type.
      setAnalyticsUser(session?.user.id ?? null, session?.user.is_anonymous === true);
      setMonitoringUser(session?.user.id ?? null);
      const next = !!session;
      setAuthPhase(next ? 'signedIn' : 'signedOut');
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
                <Stack.Screen
                  name="blocked"
                  dangerouslySingular
                  options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
                />
                <Stack.Screen name="join/[code]" dangerouslySingular options={{ headerShown: false, gestureEnabled: false }} />
              </Stack>
              <InviteBanner />
              <AudioDirector />
              <AnnouncementsHost />
            </LudoBackground>
          </ThemeProvider>
        </SocialProvider>
      </SocketProvider>
    </PaperProvider>
  );
}
