import { mkdir, readdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const configuration = JSON.parse(await readFile(new URL('../deployment.json', import.meta.url), 'utf8'));
const api = new URL(configuration.marketApi);
if (api.protocol !== 'https:' || api.pathname !== '/api/market') throw new Error('A hosted HTTPS market API is required.');
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await mkdir(resolve(output, 'vendor'), { recursive: true });
for (const file of await readdir(resolve(root, 'public'), { withFileTypes: true })) {
  if (file.isFile()) await copyFile(resolve(root, 'public', file.name), resolve(output, file.name));
}
await copyFile(resolve(root, 'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.mjs'), resolve(output, 'vendor/charts.js'));
await copyFile(resolve(root, 'node_modules/lightweight-charts/LICENSE'), resolve(output, 'vendor/LICENSE'));
await copyFile(resolve(root, 'NOTICE'), resolve(output, 'NOTICE'));
await copyFile(resolve(root, 'scalpingcripto.MD'), resolve(output, 'estrategia-original.md'));
await writeFile(resolve(output, 'config.js'), `export const MARKET_API = ${JSON.stringify(api.href)};\n`);
await writeFile(resolve(output, '.nojekyll'), '');
console.log(`GitHub Pages build ready in dist/; market API: ${api.origin}`);
