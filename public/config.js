// Local development uses the bundled Node server. The Pages build replaces
// this module with the hosted, read-only market API URL.
export const MARKET_API = new URL('./api/market', import.meta.url).href;
