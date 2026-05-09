import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import React from 'react'
import { TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TwoTabScreen() {

  const { signOut } = useAuth()
  return (
    <SafeAreaView>
      <TouchableOpacity onPress={signOut}>
        <Text weight="bold">
          Sign out
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}
