import type { Shop } from './shop-api';
import { apiFetch, type Result } from './http';

/**
 * After a purchase or a restore: the server syncs from RevenueCat and returns the shop.
 * `equip`: a product just bought, whose items it equips.
 */
export const syncPurchases = (token: string, equip?: string): Promise<Result<Shop>> =>
    apiFetch(token, '/purchases/sync', { method: 'POST', body: JSON.stringify(equip ? { equip } : {}) });
