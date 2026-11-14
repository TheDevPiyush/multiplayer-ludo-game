/**
 * Cosmetics on sale for coins. The art for each id lives in the app (components/cosmetics);
 * an app too old to draw an item doesn't list it. Ids never change once released: users own
 * and equip them. Price 0 is a kind's free default, which everyone has.
 */
export type ItemKind = 'pawn' | 'dice' | 'board';

export interface ShopItem {
    id: string;
    kind: ItemKind;
    name: string;
    price: number;
}

export const CATALOG: readonly ShopItem[] = [
    { id: 'pawn.classic', kind: 'pawn', name: 'Classic', price: 0 },
    { id: 'pawn.marble', kind: 'pawn', name: 'Marble', price: 250 },
    { id: 'pawn.duck', kind: 'pawn', name: 'Ducky', price: 300 },
    { id: 'pawn.cupcake', kind: 'pawn', name: 'Cupcake', price: 350 },
    { id: 'pawn.mushroom', kind: 'pawn', name: 'Mushroom', price: 350 },
    { id: 'pawn.cat', kind: 'pawn', name: 'Kitty', price: 450 },
    { id: 'pawn.ghost', kind: 'pawn', name: 'Ghost', price: 450 },
    { id: 'pawn.star', kind: 'pawn', name: 'Star Cap', price: 600 },
    { id: 'pawn.penguin', kind: 'pawn', name: 'Penguin', price: 600 },
    { id: 'pawn.robot', kind: 'pawn', name: 'Robo', price: 600 },
    { id: 'pawn.pumpkin', kind: 'pawn', name: 'Pumpkin', price: 600 },
    { id: 'pawn.alien', kind: 'pawn', name: 'Alien', price: 750 },
    { id: 'pawn.diya', kind: 'pawn', name: 'Diya', price: 750 },
    { id: 'pawn.crown', kind: 'pawn', name: 'Crown', price: 900 },
    { id: 'pawn.rocket', kind: 'pawn', name: 'Rocket', price: 900 },
    { id: 'pawn.ninja', kind: 'pawn', name: 'Ninja', price: 900 },
    { id: 'pawn.knight', kind: 'pawn', name: 'Knight', price: 1200 },
    { id: 'pawn.planet', kind: 'pawn', name: 'Planet', price: 1500 },
    { id: 'pawn.gem', kind: 'pawn', name: 'Gemstone', price: 2000 },
    { id: 'pawn.trophy', kind: 'pawn', name: 'Champion', price: 2500 },

    { id: 'dice.classic', kind: 'dice', name: 'Classic', price: 0 },
    { id: 'dice.midnight', kind: 'dice', name: 'Midnight', price: 250 },
    { id: 'dice.candy', kind: 'dice', name: 'Candy', price: 600 },
    { id: 'dice.wood', kind: 'dice', name: 'Teak', price: 900 },
    { id: 'dice.gold', kind: 'dice', name: 'Gold', price: 1500 },

    { id: 'board.classic', kind: 'board', name: 'Classic', price: 0 },
    { id: 'board.midnight', kind: 'board', name: 'Night Sky', price: 600 },
    { id: 'board.wood', kind: 'board', name: 'Woodcraft', price: 700 },
    { id: 'board.desert', kind: 'board', name: 'Sand Dunes', price: 700 },
    { id: 'board.chalk', kind: 'board', name: 'Chalkboard', price: 800 },
    { id: 'board.candy', kind: 'board', name: 'Candyland', price: 800 },
    { id: 'board.garden', kind: 'board', name: 'Garden', price: 900 },
    { id: 'board.reef', kind: 'board', name: 'Coral Reef', price: 900 },
    { id: 'board.snow', kind: 'board', name: 'Snowfall', price: 900 },
    { id: 'board.sakura', kind: 'board', name: 'Sakura', price: 1000 },
    { id: 'board.haunted', kind: 'board', name: 'Haunted Night', price: 1200 },
    { id: 'board.pixel', kind: 'board', name: '8-Bit', price: 1200 },
    { id: 'board.stadium', kind: 'board', name: 'Cricket Ground', price: 1200 },
    { id: 'board.diwali', kind: 'board', name: 'Festival of Lights', price: 1500 },
    { id: 'board.holi', kind: 'board', name: 'Holi Colours', price: 1500 },
    { id: 'board.mech', kind: 'board', name: 'Mech Lab', price: 1500 },
    { id: 'board.space', kind: 'board', name: 'Deep Space', price: 1800 },
    { id: 'board.neon', kind: 'board', name: 'Neon Arcade', price: 2000 },
    { id: 'board.royal', kind: 'board', name: 'Royal', price: 2500 },
];

const BY_ID = new Map(CATALOG.map(i => [i.id, i]));

export function itemById(id: string): ShopItem | undefined {
    return BY_ID.get(id);
}

/** Where each kind's equipped item is kept on `User`. */
export const EQUIP_COLUMN = { pawn: 'pawnSkin', dice: 'diceSkin', board: 'boardTheme' } as const satisfies Record<ItemKind, string>;

/** The free default of each kind. */
export const DEFAULT_ITEM: Record<ItemKind, string> = { pawn: 'pawn.classic', dice: 'dice.classic', board: 'board.classic' };

/**
 * What a stored equip column means: the item if it's a real item of that kind the user can use
 * (free, or in `usable`), else null (the default). Covers removed items and ended trials.
 */
export function equippedItem(kind: ItemKind, stored: string | null | undefined, usable: Set<string>): string | null {
    if (!stored) return null;
    const item = itemById(stored);
    if (!item || item.kind !== kind) return null;
    return item.price === 0 || usable.has(item.id) ? item.id : null;
}
