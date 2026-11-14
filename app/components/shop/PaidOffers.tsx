import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import type { ShopItem, ShopProduct } from '@/apis/shop-api';
import { PREVIEW_ASPECT, PREVIEWS } from '@/components/cosmetics/previews';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';

const palette = Colors.dark;
const GOLD = '#FFCB3D';
const GREEN = '#37BD6A';

/** One item's picture in a tile `size` wide: boards fill it, pawns and dice sit inside. */
function ItemPicture({ id, size }: { id: string; size: number }) {
    const source = PREVIEWS[id];
    if (!source) return <RNView style={[styles.tile, { width: size, height: size }]} />;
    const kind = id.split('.')[0];
    const dims = kind === 'board'
        ? { width: size, height: size }
        : kind === 'pawn'
            ? { width: size * 0.96, height: (size * 0.96) / PREVIEW_ASPECT.pawn }
            : { width: size * 0.6 * PREVIEW_ASPECT.dice, height: size * 0.6 };
    return (
        <RNView style={[styles.tile, { width: size, height: size }]}>
            <Image source={source} style={dims} fadeDuration={0} resizeMode="contain" />
        </RNView>
    );
}

function PriceButton({ price, bought, busy, onPress, label }: {
    price: string;
    bought: boolean;
    busy: boolean;
    onPress: () => void;
    label: string;
}) {
    if (bought) {
        return (
            <RNView style={[styles.action, styles.owned]}>
                <MaterialCommunityIcons name="check-bold" size={15} color={GREEN} />
                <Text weight="bold" style={[styles.actionText, { color: GREEN }]}>Owned</Text>
            </RNView>
        );
    }
    return (
        <Pressable
            onPress={onPress}
            disabled={busy}
            style={({ pressed }) => [styles.action, styles.buy, pressed && { transform: [{ scale: 0.97 }] }]}
            accessibilityRole="button"
            accessibilityLabel={`Buy ${label} for ${price}`}
            accessibilityState={{ busy }}
        >
            {busy ? <ActivityIndicator size="small" color="#5A2E00" /> : (
                <Text weight="bold" style={[styles.actionText, styles.buyText]}>{price}</Text>
            )}
        </Pressable>
    );
}

/**
 * The Sets tab: real-money products, at the store's price. Every item in them can also be earned
 * with coins, and nothing here sells coins.
 */
export function PaidOffers({ width, products, prices, items, busy, restoring, onBuy, onRestore, bottomInset }: {
    width: number;
    products: ShopProduct[];
    /** The store's price per product id; products without one aren't shown. */
    prices: Map<string, string>;
    items: ShopItem[];
    busy: string | null;
    restoring: boolean;
    onBuy: (product: ShopProduct) => void;
    onRestore: () => void;
    bottomInset: number;
}) {
    const inner = Math.min(width, 520) - 40;
    const tile = Math.floor((inner - 28 - 16) / 3);
    const byId = new Map(items.map(i => [i.id, i]));
    // A starter pack is offered once: gone after it's bought.
    const shown = products.filter(p => prices.has(p.id) && !(p.kind === 'starter' && p.bought));

    return (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 24 }]}>
            {shown.map(p => {
                const price = prices.get(p.id)!;
                if (p.kind === 'noads') {
                    return (
                        <RNView key={p.id} style={[styles.card, styles.noAdsCard]}>
                            <RNView style={styles.noAdsIcon}>
                                <MaterialCommunityIcons name="advertisements-off" size={26} color="#FFFFFF" />
                            </RNView>
                            <RNView style={{ flex: 1, gap: 3 }}>
                                <Text weight="bold" style={styles.name}>{p.name}</Text>
                                <Text weight="medium" style={styles.sub}>
                                    No more full-screen ads after games. You can still watch ads for coins when you want to.
                                </Text>
                            </RNView>
                            <RNView style={{ width: 92 }}>
                                <PriceButton price={price} bought={p.bought} busy={busy === p.id} onPress={() => onBuy(p)} label={p.name} />
                            </RNView>
                        </RNView>
                    );
                }
                const have = p.items.filter(id => byId.get(id)?.owned).length;
                const names = p.items.map(id => byId.get(id)?.name ?? '').filter(Boolean).join(' · ');
                return (
                    <RNView key={p.id} style={[styles.card, p.kind === 'starter' && styles.starterCard]}>
                        <RNView style={styles.head}>
                            <Text weight="bold" style={styles.name}>{p.name}</Text>
                            {p.kind === 'starter' && (
                                <RNView style={styles.badge}>
                                    <Text weight="bold" style={styles.badgeText}>ONE-TIME OFFER</Text>
                                </RNView>
                            )}
                        </RNView>
                        <RNView style={styles.tiles}>
                            {p.items.map(id => <ItemPicture key={id} id={id} size={tile} />)}
                        </RNView>
                        <Text weight="medium" style={styles.sub} numberOfLines={2}>{names}</Text>
                        {!p.bought && have > 0 && (
                            <Text weight="medium" style={styles.have}>
                                You already have {have} of {p.items.length}.
                            </Text>
                        )}
                        <PriceButton price={price} bought={p.bought} busy={busy === p.id} onPress={() => onBuy(p)} label={p.name} />
                    </RNView>
                );
            })}

            <Pressable
                onPress={onRestore}
                disabled={restoring}
                style={({ pressed }) => [styles.restore, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
            >
                {restoring ? <ActivityIndicator size="small" color={palette.text} /> : (
                    <>
                        <MaterialCommunityIcons name="restore" size={17} color="rgba(255,255,255,0.85)" />
                        <Text weight="bold" style={styles.restoreText}>Restore purchases</Text>
                    </>
                )}
            </Pressable>
            <Text weight="medium" style={styles.note}>
                Payments go through Google Play. Everything in a set can also be earned with coins, and coins
                can&apos;t be bought.
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    list: { gap: 12, paddingHorizontal: 20 },
    card: {
        padding: 14,
        gap: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(10, 8, 60, 0.26)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    starterCard: { borderColor: 'rgba(255,203,61,0.7)', backgroundColor: 'rgba(255,203,61,0.10)' },
    noAdsCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    noAdsIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { fontSize: 16, color: '#FFFFFF' },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: GOLD },
    badgeText: { fontSize: 10, color: '#5A2E00', letterSpacing: 0.5 },
    tiles: { flexDirection: 'row', gap: 8 },
    tile: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
    },
    sub: { fontSize: 12.5, lineHeight: 17, color: palette.mutedText },
    have: { fontSize: 12, color: GOLD },
    action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 12 },
    actionText: { fontSize: 15, color: '#FFFFFF' },
    owned: { backgroundColor: 'rgba(55,189,106,0.16)' },
    buy: { backgroundColor: GOLD },
    buyText: { color: '#5A2E00' },
    restore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, marginTop: 4 },
    restoreText: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
    note: { fontSize: 12, color: palette.mutedText, textAlign: 'center', paddingHorizontal: 12 },
});
