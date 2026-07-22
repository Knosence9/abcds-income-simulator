import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

test('menu lab stays available only as a development route', async () => {
  const simulatorSource = await readFile(
    projectFile('src/pages/simulator.astro'),
    'utf8',
  );
  const configSource = await readFile(projectFile('astro.config.mjs'), 'utf8');

  assert.doesNotMatch(simulatorSource, /href=["']\/menu-lab["']/);
  assert.equal(await exists(projectFile('src/pages/menu-lab.astro')), false);
  assert.equal(await exists(projectFile('src/dev-pages/menu-lab.astro')), true);
  assert.match(configSource, /command\s*===\s*['"]dev['"]/);
  assert.match(configSource, /integrations:\s*\[[^\]]*developmentRoutes[^\]]*\]/s);
  assert.match(configSource, /injectRoute\(\{[\s\S]*pattern:\s*['"]\/menu-lab['"]/);
  assert.match(
    configSource,
    /entrypoint:\s*['"]\.\/src\/dev-pages\/menu-lab\.astro['"]/,
  );
});
