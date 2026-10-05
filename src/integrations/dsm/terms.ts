/** The game's economic terms on DSM: what it creates and offers. Shared by the server and its screens. */
export const COIN = { ticker: 'WILD', alias: 'Wildstate coin', supply: 1_000_000n };
/** What the game's account puts in the market: WILD and ERA (ERA has two decimals). */
export const MARKET = { wild: '50000', era: '1000', feeBps: 30 };
/** Bramble's board (the design's Shop page): what each item costs, in WILD, paid from the wallet. */
export const ITEM_PRICES = { capsule: 3n, poultice: 4n, tonic: 5n, map: 12n } as const;
export type ShopItem = keyof typeof ITEM_PRICES;
/** A capsule's price, in WILD. */
export const CAPSULE_PRICE = ITEM_PRICES.capsule;
/** A trainer's bounty for beating them, in WILD. */
export const TRAINER_REWARD = 12n;
/** A victory's reward, in WILD. */
export const VICTORY_REWARD = 5n;
/** What a new player's wallet receives after its starter creature, in WILD. */
export const WELCOME_COINS = 10n;
