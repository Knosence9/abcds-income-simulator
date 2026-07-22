import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAGE_METADATA,
  SITE_ORIGIN,
  buildPageMetadata,
} from '../src/lib/site-metadata.mjs';

const readerPaths = [
  '/',
  '/budget/',
  '/simulator/',
  '/getting-started/',
  '/closed-end-funds/',
];

test('every reader page has complete self-referencing metadata', () => {
  assert.equal(SITE_ORIGIN, 'https://abcds-income-simulator.vercel.app');
  assert.deepEqual(Object.keys(PAGE_METADATA).sort(), readerPaths.sort());

  for (const path of readerPaths) {
    const metadata = buildPageMetadata(path);

    assert.ok(metadata.title.trim(), `${path} needs a title`);
    assert.ok(metadata.description.trim(), `${path} needs a description`);
    assert.equal(metadata.canonicalUrl, new URL(path, SITE_ORIGIN).href);
    assert.equal(metadata.openGraph.type, 'website');
    assert.equal(metadata.openGraph.title, metadata.title);
    assert.equal(metadata.openGraph.description, metadata.description);
    assert.equal(metadata.openGraph.url, metadata.canonicalUrl);
    assert.equal(metadata.twitter.card, 'summary');
    assert.equal(metadata.twitter.title, metadata.title);
    assert.equal(metadata.twitter.description, metadata.description);
  }
});

test('unknown routes cannot silently inherit incorrect canonical metadata', () => {
  assert.throws(
    () => buildPageMetadata('/missing/'),
    /Unknown reader page metadata path/,
  );
});
