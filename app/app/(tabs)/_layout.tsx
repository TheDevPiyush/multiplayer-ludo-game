import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BottomNavigation } from 'react-native-paper';
import { CommonActions } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useSocial } from '@/components/SocialProvider';

/** Active tab colours, bright enough to read on the dark glass bar. */
const TAB_COLORS: Record<string, string> = {
  index: '#FF5A6A',
  history: '#FFB020',
  notifications: '#B794FF',
  profile: '#5AA2FF',
};

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];
  const { summary } = useSocial();

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: 'transparent' },
        headerShown: false,
      }}
      tabBar={({ navigation, state, descriptors, insets }) => (
        // Glass like the app's panels: the indigo tint, no live blur (cheaper on basic phones).
        <View style={styles.glass}>
          <BottomNavigation.Bar
            navigationState={state}
            safeAreaInsets={insets}
            style={styles.bar}
            activeColor={TAB_COLORS[state.routes[state.index].name] ?? palette.tabIconSelected}
            inactiveColor={INACTIVE}
            activeIndicatorStyle={{ backgroundColor: (TAB_COLORS[state.routes[state.index].name] ?? '#5AA2FF') + '2E' }}
            theme={{ colors: { onSurface: '#FFFFFF', onSurfaceVariant: INACTIVE, onSecondaryContainer: '#FFFFFF' } }}
            onTabPress={({ route, preventDefault }) => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (event.defaultPrevented) preventDefault();
              else navigation.dispatch({
                ...CommonActions.navigate(route.name, route.params),
                target: state.key,
              });
            }}
            renderIcon={({ route, focused, color }) => {
              const activeColor = focused ? TAB_COLORS[route.name] ?? color : color;
              return descriptors[route.key].options.tabBarIcon?.({
                focused,
                color: activeColor,
                size: 24,
              }) ?? null;
            }}
            getBadge={({ route }) =>
              route.name === 'notifications' && summary.unreadNotifications > 0
                ? Math.min(summary.unreadNotifications, 99)
                : false
            }
            getLabelText={({ route }) =>
              descriptors[route.key].options.title ?? route.name
            }
          />
        </View>
      )}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="history" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="bell" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const INACTIVE = 'rgba(255, 255, 255, 0.62)';

const styles = StyleSheet.create({
  glass: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: 'rgba(12, 10, 70, 0.55)',
  },
  bar: { backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
});
