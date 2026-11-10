import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

/** The game's coin: gold with a star, so it never reads as real money. */
export function Coin({ size = 18 }: { size?: number }) {
    return (
        <View style={[styles.coin, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(1.5, size / 10) }]}>
            <MaterialCommunityIcons name="star-four-points" size={size * 0.56} color="#B86E00" />
        </View>
    );
}

const styles = StyleSheet.create({
    coin: {
        backgroundColor: '#FFCB3D',
        borderColor: '#E59A0B',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
