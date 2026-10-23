import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { BottomNavigation } from 'react-native-paper';
import { CommonActions } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const TAB_COLORS: Record<string, string> = {
  index: '#FF3B4E',
  history: '#F59E0B',
  profile: '#2E86FF',
};

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: 'transparent' },
        headerShown: false,
      }}
      tabBar={({ navigation, state, descriptors, insets }) => (
        <BottomNavigation.Bar
          navigationState={state}
          safeAreaInsets={insets}
          style={styles.bar}
          activeColor={TAB_COLORS[state.routes[state.index].name] ?? palette.tabIconSelected}
          inactiveColor="#9097B8"
          activeIndicatorStyle={{ backgroundColor: (TAB_COLORS[state.routes[state.index].name] ?? '#2E86FF') + '1F' }}
          theme={{ colors: { onSurface: '#1B1A4A', onSurfaceVariant: '#9097B8', onSecondaryContainer: '#1B1A4A' } }}
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
          getLabelText={({ route }) =>
            descriptors[route.key].options.title ?? route.name
          }
        />
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

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});
