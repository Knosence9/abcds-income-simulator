import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tablePages = [
  [
    'index.astro',
    [
      'Portfolio operating rules table',
      'Contribution gears table',
      'Example family portfolios table',
    ],
  ],
  ['budget.astro', ['Weekly contribution examples table']],
  ['getting-started.astro', ['Starter contribution timelines table']],
  [
    'closed-end-funds.astro',
    [
      'Closed-end fund pricing examples table',
      'Closed-end fund comparison table',
    ],
  ],
];

test('every horizontally scrollable table is keyboard focusable and labeled', async () => {
  let wrapperCount = 0;

  for (const [page, expectedLabels] of tablePages) {
    const source = await readFile(
      new URL(`../src/pages/${page}`, import.meta.url),
      'utf8',
    );
    const wrappers = source.match(
      /<div\b[^>]*\bclass="(?:[^"]*\s)?table-wrap(?:\s[^"]*)?"[^>]*>/g,
    ) ?? [];

    assert.equal(wrappers.length, expectedLabels.length, `${page} table wrapper inventory changed`);
    wrapperCount += wrappers.length;

    for (const [index, wrapper] of wrappers.entries()) {
      assert.match(wrapper, /\brole="region"/);
      assert.match(wrapper, /\btabindex="0"/);
      assert.ok(wrapper.includes(`aria-label="${expectedLabels[index]}"`));
    }

    assert.match(
      source,
      /\.table-wrap:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--a\)/,
    );
  }

  assert.equal(wrapperCount, 7);
});
