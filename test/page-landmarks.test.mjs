import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readerPages = [
  'index.astro',
  'budget.astro',
  'getting-started.astro',
  'closed-end-funds.astro',
  'simulator.astro',
];

test('shared skip link targets the main landmark and appears on focus', async () => {
  const source = await readFile(
    new URL('../src/components/SkipLink.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /<a class="skip-link" href="#main-content">Skip to main content<\/a>/,
  );
  assert.match(source, /\.skip-link:focus(?:-visible)?\s*\{/);
});

for (const page of readerPages) {
  test(`${page} lets keyboard users skip to its main landmark`, async () => {
    const source = await readFile(
      new URL(`../src/pages/${page}`, import.meta.url),
      'utf8',
    );

    assert.match(source, /import SkipLink from '..\/components\/SkipLink\.astro';/);
    assert.match(source, /<body>\s*<SkipLink \/>/);
    assert.equal(
      (source.match(/<main id="main-content" tabindex="-1">/g) ?? []).length,
      1,
    );
    assert.equal((source.match(/<\/main>/g) ?? []).length, 1);
  });
}
