import { ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { useRouter, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { navigationTheme } from '@/components/NavigationTheme';
import { supabase } from '@/util/supabase-client';
import { MD3DarkTheme, PaperProvider } from 'react-native-paper';

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


  // getting session from supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/(tabs)')
      else router.replace('/(login)')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/(tabs)')
      else router.replace('/(login)')
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
  const bg = Colors[colorScheme === 'dark' ? 'dark' : 'light'].background;

  const theme = {
    ...MD3DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      secondaryContainer: 'rgba(255, 255, 255, 0.1)',
      onSecondaryContainer: 'rgba(255, 255, 255, 1)',
      surface: 'rgba(14, 14, 28, 1)',
      onSurface: 'rgb(216, 202, 250)',
      onSurfaceVariant: 'rgba(102, 102, 122, 1)',
    },
  };


  return (
    <PaperProvider theme={theme}>
      <ThemeProvider value={navigationTheme(colorScheme)}>
        <Stack
          initialRouteName={"(login)"}
          screenOptions={{
            contentStyle: { backgroundColor: bg },
          }}
        >
          <Stack.Screen name="(login)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(game)" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </PaperProvider>
  );
}
