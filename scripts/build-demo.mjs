import { copyFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { DEMO_ASSETS } from './demo-assets.mjs';

export async function buildDemo(out = new URL('../dist/', import.meta.url)) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const file of DEMO_ASSETS) {
    await copyFile(new URL(`../public/${file}`, import.meta.url), new URL(file, out));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildDemo();
  console.log('Built Groundwork stakeholder demo into dist/');
}
