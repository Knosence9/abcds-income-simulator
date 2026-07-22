import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test('every built reader page links the emitted site assets', async () => {
  const pages = [
    'index.html',
    'budget/index.html',
    'closed-end-funds/index.html',
    'getting-started/index.html',
    'simulator/index.html',
  ];
  const metadata = [
    '<meta name="theme-color" content="#101f3d">',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ];

  for (const page of pages) {
    const html = await readFile(projectFile(`dist/${page}`), 'utf8');

    for (const element of metadata) {
      assert.ok(html.includes(element), `${page} is missing ${element}`);
    }
  }

  for (const asset of [
    'apple-touch-icon.png',
    'favicon.svg',
    'icon-192.png',
    'icon-512.png',
    'site.webmanifest',
  ]) {
    const [source, built] = await Promise.all([
      readFile(projectFile(`public/${asset}`)),
      readFile(projectFile(`dist/${asset}`)),
    ]);

    assert.deepEqual(built, source, `${asset} was not emitted unchanged`);
  }
});
