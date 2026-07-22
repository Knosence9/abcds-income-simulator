import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as accessibility from '../scripts/verify-built-accessibility.mjs';

const { verifyAccessibilityMarkup } = accessibility;

test('reports missing built accessibility landmarks and accessible names', () => {
  const html = `
    <a class="skip-link" href="#missing-main">Skip to main content</a>
    <main></main>
    <div class="table-wrap" tabindex="0"><table></table></div>
    <input id="projection" type="range">
  `;

  assert.deepEqual(verifyAccessibilityMarkup(html, 'simulator/index.html'), [
    'simulator/index.html: skip link must target #main-content',
    'simulator/index.html: expected one <main id="main-content"> landmark',
    'simulator/index.html: focusable table scroll region requires role="region" and an accessible name',
    'simulator/index.html: range input #projection requires an accessible name',
  ]);
});

test('rejects dangling and empty aria-labelledby references', () => {
  const html = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content">
      <div class="table-wrap" role="region" tabindex="0" aria-labelledby="missing-heading">
        <table></table>
      </div>
      <span id="empty-range-label"></span>
      <input id="projection" type="range" aria-labelledby="empty-range-label">
    </main>
  `;

  assert.deepEqual(verifyAccessibilityMarkup(html, 'simulator/index.html'), [
    'simulator/index.html: focusable table scroll region requires role="region" and an accessible name',
    'simulator/index.html: range input #projection requires an accessible name',
  ]);
});

test('rejects dangling aria-labelledby even when aria-label is present', () => {
  const html = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content">
      <input id="projection" type="range" aria-label="Projection" aria-labelledby="missing-label">
    </main>
  `;

  assert.deepEqual(verifyAccessibilityMarkup(html, 'simulator/index.html'), [
    'simulator/index.html: range input #projection requires an accessible name',
  ]);
});

test('rejects invalid aria-labelledby references on other elements', () => {
  const html = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content">
      <section aria-labelledby="missing-heading">Content</section>
    </main>
  `;

  assert.deepEqual(verifyAccessibilityMarkup(html, 'index.html'), [
    'index.html: <section> aria-labelledby must reference unique elements with non-empty text',
  ]);
});

test('rejects duplicate aria-labelledby target IDs', () => {
  const html = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content">
      <span id="projection-label"></span>
      <span id="projection-label">Projection</span>
      <input id="projection" type="range" aria-labelledby="projection-label">
    </main>
  `;

  assert.deepEqual(verifyAccessibilityMarkup(html, 'simulator/index.html'), [
    'simulator/index.html: range input #projection requires an accessible name',
  ]);
});

test('accepts explicit and wrapping labels for range inputs', () => {
  const html = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content">
      <label for="explicit-range">Explicit projection</label>
      <input id="explicit-range" type="range">
      <label>Wrapped projection <input id="wrapped-range" type="range"></label>
    </main>
  `;

  assert.deepEqual(verifyAccessibilityMarkup(html, 'simulator/index.html'), []);
});

test('checks the complete built reader-page inventory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'abcds-accessibility-'));
  const validPage = `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <main id="main-content"></main>
  `;

  try {
    await writeFile(join(root, 'index.html'), validPage);

    assert.deepEqual(await accessibility.verifyBuiltAccessibility(root), [
      'budget/index.html: reader page is missing from the build',
      'closed-end-funds/index.html: reader page is missing from the build',
      'getting-started/index.html: reader page is missing from the build',
      'simulator/index.html: reader page is missing from the build',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
