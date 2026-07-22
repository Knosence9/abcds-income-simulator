import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const canonicalOrigin = 'https://abcds-income-simulator.vercel.app';

test('production config generates a sitemap for the canonical site', async () => {
  const configSource = await readFile(projectFile('astro.config.mjs'), 'utf8');

  assert.match(configSource, /import sitemap from ['"]@astrojs\/sitemap['"]/);
  assert.match(configSource, /site:\s*['"]https:\/\/abcds-income-simulator\.vercel\.app['"]/);
  assert.match(configSource, /integrations:\s*\[[^\]]*sitemap\(\)[^\]]*\]/s);
});

test('robots policy permits crawling and references the canonical sitemap index', async () => {
  const robots = await readFile(projectFile('public/robots.txt'), 'utf8').catch(() => '');

  assert.equal(
    robots,
    `User-agent: *\nAllow: /\nSitemap: ${canonicalOrigin}/sitemap-index.xml\n`,
  );
  assert.doesNotMatch(robots, /menu-lab/);
});
