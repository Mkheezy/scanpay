import { readFile, writeFile } from 'node:fs/promises';

const destination = process.argv[2];
if (!destination) throw new Error('Provide an output HTML path.');
const source = new URL('../public/', import.meta.url);
let html = await readFile(new URL('index.html', source), 'utf8');
for (const file of ['master.css', 'pitch.css', 'glass.css']) {
  const css = (await readFile(new URL(file, source), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  html = html.replace(`<link rel="stylesheet" href="/${file}" />`, () => `<style>${css}</style>`);
}
const model = (await readFile(new URL('order-model.mjs', source), 'utf8'))
  .replace(/^export /gm, '');
const app = (await readFile(new URL('master.js', source), 'utf8'))
  .replace(/^import .*?;\s*/, '');
html = html.replace('<script type="module" src="/master.js"></script>', () =>
  `<script type="module">${model}\n${app}</script>`);
await writeFile(destination, html);
console.log(`Exported standalone presentation to ${destination}`);
