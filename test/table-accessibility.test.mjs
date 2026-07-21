import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tablePages = [
  ['index.astro', 3],
  ['budget.astro', 1],
  ['getting-started.astro', 1],
  ['closed-end-funds.astro', 2],
];

test('every horizontally scrollable table is keyboard focusable and labeled', async () => {
  let wrapperCount = 0;

  for (const [page, expectedCount] of tablePages) {
    const source = await readFile(
      new URL(`../src/pages/${page}`, import.meta.url),
      'utf8',
    );
    const wrappers = source.match(/<div class="table-wrap"[^>]*>/g) ?? [];

    assert.equal(wrappers.length, expectedCount, `${page} table wrapper inventory changed`);
    wrapperCount += wrappers.length;

    for (const wrapper of wrappers) {
      assert.match(wrapper, /\brole="region"/);
      assert.match(wrapper, /\btabindex="0"/);
      assert.match(wrapper, /\baria-label="[^"]+"/);
    }

    assert.match(
      source,
      /\.table-wrap:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--a\)/,
    );
  }

  assert.equal(wrapperCount, 7);
});
