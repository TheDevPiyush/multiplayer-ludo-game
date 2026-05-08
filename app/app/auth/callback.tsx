import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Text } from '@/components/Themed';

export default function AuthCallbackScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <FontAwesome name="google" size={22} color="#EA4335" />
          </View>

          <Text weight="bold" style={styles.title}>
            Logging you in
          </Text>
          <Text weight="medium" style={styles.subtitle}>
            Securely completing sign-in...
          </Text>

          <ActivityIndicator size="small" color="#3B7DD8" style={styles.loader} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08080F',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: '#0E0E1C',
    borderWidth: 1,
    borderColor: '#20203A',
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#13132A',
    borderWidth: 1,
    borderColor: '#2A2A48',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    color: '#F2F2FA',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8EA8',
    textAlign: 'center',
  },
  loader: {
    marginTop: 16,
  },
});
