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
  assert.match(
    source,
    /\.skip-link\s*\{[\s\S]*transform:\s*translateY\(calc\(-100% - 20px\)\)/,
  );
  assert.match(source, /\.skip-link:focus(?:-visible)?\s*\{/);
  assert.match(
    source,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.skip-link\s*\{\s*transition:\s*none;/,
  );
});

test('shared site footer provides navigation, disclosure, and privacy context', async () => {
  const source = await readFile(
    new URL('../src/components/SiteFooter.astro', import.meta.url),
    'utf8',
  );

  assert.match(source, /<footer class="site-footer">/);
  assert.match(source, /href="\/getting-started"/);
  assert.match(source, /href="\/budget"/);
  assert.match(source, /href="\/simulator"/);
  assert.match(source, /href="\/#rules"/);
  assert.match(source, /not financial advice/i);
  assert.match(
    source,
    /Your planner inputs and imported budget snapshots stay in your browser's local storage unless you choose to export them\./,
  );
  assert.doesNotMatch(source, /menu-lab/);
  assert.match(source, /\.site-footer a:focus-visible\s*\{/);
  assert.match(source, /\.site-footer nav\s*\{[^}]*flex-wrap:\s*wrap/);
});

for (const page of readerPages) {
  test(`${page} lets keyboard users skip to its main landmark`, async () => {
    const source = await readFile(
      new URL(`../src/pages/${page}`, import.meta.url),
      'utf8',
    );

    assert.match(source, /import SkipLink from '..\/components\/SkipLink\.astro';/);
    assert.match(source, /import SiteFooter from '..\/components\/SiteFooter\.astro';/);
    assert.match(source, /<body>\s*<SkipLink \/>/);
    assert.equal((source.match(/<SiteFooter \/>/g) ?? []).length, 1);
    assert.equal(
      (source.match(/<main id="main-content" tabindex="-1">/g) ?? []).length,
      1,
    );
    assert.equal((source.match(/<\/main>/g) ?? []).length, 1);
  });

  test(`${page} disables smooth skip-link scrolling for reduced motion`, async () => {
    const source = await readFile(
      new URL(`../src/pages/${page}`, import.meta.url),
      'utf8',
    );

    if (/html\s*\{\s*scroll-behavior:\s*smooth;\s*\}/.test(source)) {
      assert.match(
        source,
        /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*html\s*\{\s*scroll-behavior:\s*auto;\s*\}/,
      );
    }
  });
}
