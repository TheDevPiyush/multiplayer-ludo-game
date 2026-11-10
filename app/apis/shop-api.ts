import { apiFetch, type Result } from './http';

export type ItemKind = 'pawn' | 'dice' | 'board';

export type ShopItem = { id: string; kind: ItemKind; name: string; price: number; owned: boolean };

/** Each kind's equipped item id (a kind's free default when nothing else is). */
export type Equipped = Record<ItemKind, string>;

/** The shop for one player (server: shop/shop.ts getShop). */
export type Shop = { coins: number; equipped: Equipped; items: ShopItem[] };

export const fetchShop = (token: string): Promise<Result<Shop>> => apiFetch(token, '/shop');

export const buyItem = (token: string, itemId: string): Promise<Result<Shop>> =>
    apiFetch(token, `/shop/items/${encodeURIComponent(itemId)}/buy`, { method: 'POST' });

export const equipItem = (token: string, itemId: string): Promise<Result<Shop>> =>
    apiFetch(token, `/shop/items/${encodeURIComponent(itemId)}/equip`, { method: 'POST' });
