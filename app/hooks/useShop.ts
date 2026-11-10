import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { buyItem, equipItem, fetchShop, type Equipped, type Shop } from '@/apis/shop-api';
import { canDraw } from '@/components/cosmetics/items';
import { refreshProgress } from '@/hooks/useProgress';
import { track } from '@/util/analytics';
import { supabase } from '@/util/supabase-client';

const DEFAULTS: Equipped = { pawn: 'pawn.classic', dice: 'dice.classic', board: 'board.classic' };
/** The last equipped items, so offline games and a cold start show them before the server answers. */
const KEY = 'simpleludo:equipped';

// One copy shared by every screen, like useProgress.
let cached: { userId: string; shop: Shop } | null = null;
let equipped: Equipped = DEFAULTS;
const shopListeners = new Set<(s: Shop | null) => void>();
const equipListeners = new Set<(e: Equipped) => void>();

function setEquipped(next: Equipped) {
    if (next.pawn === equipped.pawn && next.dice === equipped.dice && next.board === equipped.board) return;
    equipped = next;
    for (const l of equipListeners) l(equipped);
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

function publish(userId: string | null, shop: Shop | null) {
    cached = userId && shop ? { userId, shop } : null;
    for (const l of shopListeners) l(cached?.shop ?? null);
    if (shop) setEquipped(shop.equipped);
}

supabase.auth.onAuthStateChange((_event, session) => {
    if (cached && cached.userId !== session?.user.id) {
        publish(null, null);
        setEquipped(DEFAULTS);
    }
    // Game screens need the equipped items even if the shop is never opened. Outside the
    // callback: Supabase calls made inside it can deadlock.
    if (session && cached?.userId !== session.user.id) setTimeout(() => void refreshShop(), 0);
});

async function session() {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    return s ? { token: s.access_token, userId: s.user.id } : null;
}

/** On app start: the saved equipped items at once, then the server's. */
export async function loadEquipped() {
    try {
        const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null') as Partial<Equipped> | null;
        if (saved) setEquipped({ ...DEFAULTS, ...saved });
    } catch {
        // A broken saved copy is replaced by the server's.
    }
    await refreshShop();
}

export async function refreshShop() {
    const s = await session();
    if (!s) return;
    const r = await fetchShop(s.token);
    if (r.ok) publish(s.userId, r.data);
}

/** What the player has equipped now (for starting offline games). */
export function equippedNow(): Equipped {
    return equipped;
}

/** The player's equipped items, kept current. */
export function useEquipped(): Equipped {
    const [value, setValue] = useState(equipped);
    useEffect(() => {
        equipListeners.add(setValue);
        setValue(equipped);
        return () => void equipListeners.delete(setValue);
    }, []);
    return value;
}

type ActionResult = { ok: true } | { ok: false; error: string };

export function useShop() {
    const [shop, setShop] = useState<Shop | null>(cached?.shop ?? null);

    useEffect(() => {
        shopListeners.add(setShop);
        return () => void shopListeners.delete(setShop);
    }, []);

    useFocusEffect(useCallback(() => void refreshShop(), []));

    const run = useCallback(async (call: typeof buyItem, itemId: string): Promise<ActionResult> => {
        const s = await session();
        if (!s) return { ok: false, error: 'Sign in to use the shop.' };
        const r = await call(s.token, itemId);
        if (!r.ok) {
            void refreshShop();
            return { ok: false, error: r.error };
        }
        publish(s.userId, r.data);
        return { ok: true };
    }, []);

    const buy = useCallback(async (itemId: string, price: number): Promise<ActionResult> => {
        const r = await run(buyItem, itemId);
        if (r.ok) {
            track('purchase', { item: itemId, currency: 'coins', price });
            void refreshProgress();
        }
        return r;
    }, [run]);

    const equip = useCallback(async (itemId: string): Promise<ActionResult> => {
        const r = await run(equipItem, itemId);
        if (r.ok) track('shop_equip', { item: itemId });
        return r;
    }, [run]);

    /** Items this app can draw; newer ones wait for an update. */
    const items = shop?.items.filter(i => canDraw(i.id)) ?? null;
    return { shop, items, buy, equip, refresh: refreshShop };
}
