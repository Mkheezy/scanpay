import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDemo } from '../scripts/build-demo.mjs';
import { DEMO_ASSETS } from '../scripts/demo-assets.mjs';
const run = promisify(execFile);

test('deployment contains only the stakeholder demo and no design-spec copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'groundwork-build-'));
  const out = pathToFileURL(dir + '/');
  try {
    await buildDemo(out);
    assert.deepEqual((await readdir(out)).sort(), [...DEMO_ASSETS].sort());
    const html = await readFile(new URL('index.html', out), 'utf8');
    const script = await readFile(new URL('master.js', out), 'utf8');
    assert.match(html, /Your table/);
    assert.match(html, /Open navigation menu/);
    assert.doesNotMatch(html + script, /Active Mode:|Integer Cents|Canvas #|Pay CTAs|SCSS viewer/i);
    for (const [, file] of html.matchAll(/(?:href|src)="\/([^"?#]+)"/g)) {
      assert.ok(DEMO_ASSETS.includes(file), `Unshipped asset: ${file}`);
    }
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    for (const source of ['/design-reference.html', '/demo-info.html']) {
      assert.equal(config.redirects.find((entry) => entry.source === source)?.destination, '/');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('backend home page uses the same presentation as the Vercel demo', async () => {
  for (const file of DEMO_ASSETS) {
    assert.equal(
      await readFile(new URL(`../backend/public/${file}`, import.meta.url), 'utf8'),
      await readFile(new URL(`../site/${file}`, import.meta.url), 'utf8'),
      `${file} is out of sync`,
    );
  }
});

test('clean checkout build creates the configured Vercel output and removes stale assets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'groundwork-clean-build-'));
  try {
    // No backend, dependencies or pre-existing output: like the Vercel checkout.
    for (const file of ['site', 'scripts', 'package.json', 'vercel.json']) {
      await cp(new URL(`../${file}`, import.meta.url), join(dir, file), { recursive: true });
    }
    const config = JSON.parse(await readFile(join(dir, 'vercel.json'), 'utf8'));
    assert.equal(config.outputDirectory, 'public');
    const output = join(dir, config.outputDirectory);
    const build = () => run(process.execPath, ['scripts/build-demo.mjs'], { cwd: dir });
    await build();
    assert.deepEqual((await readdir(output)).sort(), [...DEMO_ASSETS].sort());
    for (const file of DEMO_ASSETS) {
      const source = await readFile(join(dir, 'site', file), 'utf8');
      assert.ok(source.length > 0, `${file} must not be empty`);
      assert.equal(await readFile(join(output, file), 'utf8'), source);
    }
    await writeFile(join(output, 'design-reference.html'), 'stale design reference');
    await build();
    assert.deepEqual((await readdir(output)).sort(), [...DEMO_ASSETS].sort());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
