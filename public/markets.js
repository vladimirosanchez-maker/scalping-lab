export const MARKETS = Object.freeze({
  'BTC-USDT': { asset: 'BTC', name: 'Bitcoin', glyph: '₿', pricePrecision: 1, quantityPrecision: 3, minQuantity: 0.001 },
  'ETH-USDT': { asset: 'ETH', name: 'Ethereum', glyph: 'Ξ', pricePrecision: 2, quantityPrecision: 3, minQuantity: 0.001 },
});
export function validMarket(symbol) { return Object.hasOwn(MARKETS, symbol); }
