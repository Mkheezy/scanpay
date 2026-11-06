import { cp, mkdir, rm } from 'node:fs/promises';
const out = new URL('../dist/', import.meta.url);
await rm(out, {recursive:true, force:true});
await mkdir(out, {recursive:true});
await cp(new URL('../public/', import.meta.url), out, {recursive:true});
console.log('Built Titanium Sequoia demo into dist/');
