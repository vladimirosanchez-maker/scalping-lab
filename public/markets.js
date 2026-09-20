export const MARKETS = Object.freeze({
  'BTC-USDT': { asset: 'BTC', name: 'Bitcoin', glyph: '₿', pricePrecision: 1, quantityPrecision: 4, minQuantity: 0.0001 },
  'ETH-USDT': { asset: 'ETH', name: 'Ethereum', glyph: 'Ξ', pricePrecision: 2, quantityPrecision: 2, minQuantity: 0.01 },
});
export function validMarket(symbol) { return Object.hasOwn(MARKETS, symbol); }
