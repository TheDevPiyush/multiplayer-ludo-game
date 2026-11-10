import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Platform, Pressable, StyleSheet, useWindowDimensions, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ItemKind, ShopItem } from '@/apis/shop-api';
import { PREVIEW_ASPECT, PREVIEWS } from '@/components/cosmetics/previews';
import AppDialog from '@/components/Dialog';
import { Coin } from '@/components/progress/Coin';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useShop } from '@/hooks/useShop';
import { track } from '@/util/analytics';
import { playEffect } from '@/util/audio';
import { haptic } from '@/util/feedback';

const palette = Colors.dark;
const GOLD = '#FFCB3D';
const GREEN = '#37BD6A';

const KINDS: { kind: ItemKind; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
    { kind: 'pawn', label: 'Pawns', icon: 'chess-pawn' },
    { kind: 'dice', label: 'Dice', icon: 'dice-5' },
    { kind: 'board', label: 'Boards', icon: 'checkerboard' },
];

/** Size of a card's picture: boards fill the card's width, pawns and dice sit in a shorter box. */
function previewSize(kind: ItemKind, inner: number) {
    if (kind === 'board') return { box: inner, w: inner, h: inner };
    if (kind === 'pawn') return { box: inner * 0.66, w: inner * 0.96, h: (inner * 0.96) / PREVIEW_ASPECT.pawn };
    return { box: inner * 0.66, w: inner * 0.5 * PREVIEW_ASPECT.dice, h: inner * 0.5 };
}

/**
 * One shop item. Its picture is a pre-drawn image (scripts/shop-previews.test.tsx): drawing
 * every board and pawn live as SVG made the list stutter while scrolling. Re-renders only
 * when its own state changes.
 */
const ItemCard = memo(function ItemCard({
    item, width, equipped, short, busy, onBuy, onEquip,
}: {
    item: ShopItem;
    width: number;
    equipped: boolean;
    /** The player can't afford it yet. */
    short: boolean;
    busy: boolean;
    onBuy: (item: ShopItem) => void;
    onEquip: (item: ShopItem) => void;
}) {
    const size = previewSize(item.kind, width - 23);
    const source = PREVIEWS[item.id];
    // The whole card is the button: it buys, or equips something already owned.
    const onPress = equipped || busy ? undefined : item.owned ? () => onEquip(item) : () => onBuy(item);
    const label = equipped
        ? `${item.name}, equipped`
        : item.owned ? `Equip ${item.name}` : `Buy ${item.name} for ${item.price} coins`;
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => [styles.card, { width }, equipped && styles.cardEquipped, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !onPress, busy, selected: equipped }}
        >
            <RNView style={[styles.preview, { height: size.box }]}>
                {source && <Image source={source} style={{ width: size.w, height: size.h }} fadeDuration={0} resizeMode="contain" />}
            </RNView>
            <Text weight="bold" style={styles.name} numberOfLines={1}>{item.name}</Text>
            {equipped ? (
                <RNView style={[styles.action, styles.equipped]}>
                    <MaterialCommunityIcons name="check-bold" size={15} color={GREEN} />
                    <Text weight="bold" style={[styles.actionText, { color: GREEN }]}>Equipped</Text>
                </RNView>
            ) : item.owned ? (
                <RNView style={[styles.action, styles.equip]}>
                    {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text weight="bold" style={styles.actionText}>Equip</Text>}
                </RNView>
            ) : (
                <RNView style={[styles.action, short ? styles.locked : styles.buy]}>
                    {busy ? <ActivityIndicator size="small" color="#5A2E00" /> : (
                        <>
                            <Coin size={15} />
                            <Text weight="bold" style={[styles.actionText, short ? styles.lockedText : styles.buyText]}>
                                {item.price.toLocaleString('en-IN')}
                            </Text>
                        </>
                    )}
                </RNView>
            )}
        </Pressable>
    );
});

export default function ShopScreen() {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const { shop, items, buy, equip } = useShop();
    const [kind, setKind] = useState<ItemKind>('pawn');
    const [busy, setBusy] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ShopItem | null>(null);
    const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

    useFocusEffect(useCallback(() => track('shop_view', {}), []));

    const cardWidth = Math.floor((Math.min(width, 520) - 40 - 12) / 2);
    const shown = useMemo(() => items?.filter(i => i.kind === kind) ?? [], [items, kind]);
    // Read through a ref, so the card callbacks stay the same and cards don't all re-render.
    const shopRef = useRef(shop);
    shopRef.current = shop;

    const askBuy = useCallback((item: ShopItem) => {
        const shop = shopRef.current;
        if (!shop) return;
        if (item.price > shop.coins) {
            setDialog({
                title: 'Not enough coins yet',
                message: `${item.name} costs ${item.price.toLocaleString('en-IN')} coins. You need ${(item.price - shop.coins).toLocaleString('en-IN')} more: play games, finish missions and collect your daily reward.`,
            });
            return;
        }
        setConfirm(item);
    }, []);

    const doBuy = async (item: ShopItem) => {
        setConfirm(null);
        setBusy(item.id);
        const r = await buy(item.id, item.price);
        setBusy(null);
        if (r.ok) {
            haptic.success();
            playEffect('home');
        } else {
            setDialog({ title: "Couldn't buy that", message: r.error });
        }
    };

    const doEquip = useCallback(async (item: ShopItem) => {
        setBusy(item.id);
        const r = await equip(item.id);
        setBusy(null);
        if (r.ok) haptic.light();
        else setDialog({ title: "Couldn't equip that", message: r.error });
    }, [equip]);

    return (
        <RNView style={[styles.screen, { paddingTop: insets.top + 12 }]}>
            <RNView style={styles.header}>
                <RNView style={{ flex: 1, gap: 4 }}>
                    <Text weight="bold" style={styles.title}>Shop</Text>
                    <Text weight="medium" style={styles.subtitle}>Make your pawns, dice and board yours</Text>
                </RNView>
                {shop && (
                    <RNView style={styles.coins} accessibilityLabel={`${shop.coins} coins`}>
                        <Coin size={18} />
                        <Text weight="bold" style={styles.coinsText}>{shop.coins.toLocaleString('en-IN')}</Text>
                    </RNView>
                )}
            </RNView>

            <RNView style={styles.tabs}>
                {KINDS.map(k => {
                    const active = k.kind === kind;
                    return (
                        <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={[styles.tab, active && styles.tabActive]}>
                            <MaterialCommunityIcons name={k.icon} size={17} color={active ? '#1B1A4A' : 'rgba(255,255,255,0.75)'} />
                            <Text weight="bold" style={[styles.tabText, active && styles.tabTextActive]}>{k.label}</Text>
                        </Pressable>
                    );
                })}
            </RNView>

            {!items ? (
                <RNView style={styles.center}><ActivityIndicator color={palette.text} /></RNView>
            ) : (
                // A list, not a scroll view: only the cards on screen are drawn (boards are big drawings).
                <FlatList
                    key={kind}
                    data={shown}
                    keyExtractor={item => item.id}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
                    initialNumToRender={6}
                    maxToRenderPerBatch={6}
                    windowSize={7}
                    removeClippedSubviews={Platform.OS === 'android'}
                    renderItem={({ item }) => (
                        <ItemCard
                            item={item}
                            width={cardWidth}
                            equipped={shop?.equipped[item.kind] === item.id}
                            short={item.price > (shop?.coins ?? 0)}
                            busy={busy === item.id}
                            onBuy={askBuy}
                            onEquip={doEquip}
                        />
                    )}
                    ListFooterComponent={
                        <Text weight="medium" style={styles.note}>
                            {kind === 'board'
                                ? 'Your board is just for you. Coins are earned by playing and can\'t be bought.'
                                : 'Everyone in your games sees your pawns and dice. Coins are earned by playing and can\'t be bought.'}
                        </Text>
                    }
                />
            )}

            <AppDialog
                visible={!!confirm}
                title={confirm ? `Buy ${confirm.name}?` : ''}
                message={confirm ? `${confirm.price.toLocaleString('en-IN')} coins. It's equipped as soon as you buy it.` : undefined}
                onDismiss={() => setConfirm(null)}
                actions={confirm ? [
                    { label: 'Cancel', onPress: () => setConfirm(null) },
                    { label: 'Buy', onPress: () => void doBuy(confirm) },
                ] : undefined}
            />
            <AppDialog visible={!!dialog} title={dialog?.title ?? ''} message={dialog?.message} onDismiss={() => setDialog(null)} />
        </RNView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: 'transparent' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
    title: { fontSize: 26, color: palette.text, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: palette.mutedText },
    coins: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: 'rgba(10, 8, 60, 0.35)',
        borderWidth: 1,
        borderColor: 'rgba(255,203,61,0.45)',
    },
    coinsText: { fontSize: 15, color: '#FFFFFF' },
    tabs: {
        flexDirection: 'row',
        gap: 6,
        padding: 4,
        marginHorizontal: 20,
        marginBottom: 14,
        borderRadius: 16,
        backgroundColor: 'rgba(10, 8, 60, 0.3)',
    },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 12 },
    tabActive: { backgroundColor: '#FFFFFF' },
    tabText: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
    tabTextActive: { color: '#1B1A4A' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    grid: { gap: 12, paddingHorizontal: 20 },
    row: { gap: 12 },
    card: {
        padding: 10,
        gap: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(10, 8, 60, 0.26)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    cardEquipped: { borderColor: GREEN, backgroundColor: 'rgba(55,189,106,0.12)' },
    cardPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
    preview: { alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
    name: { fontSize: 14, color: '#FFFFFF', paddingHorizontal: 2, textAlign: 'center' },
    action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 12 },
    actionText: { fontSize: 14, color: '#FFFFFF' },
    equipped: { backgroundColor: 'rgba(55,189,106,0.16)' },
    equip: { backgroundColor: 'rgba(255,255,255,0.16)' },
    buy: { backgroundColor: GOLD },
    buyText: { color: '#5A2E00' },
    locked: { backgroundColor: 'rgba(255,255,255,0.1)' },
    lockedText: { color: 'rgba(255,255,255,0.75)' },
    note: { fontSize: 12, color: palette.mutedText, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
});
