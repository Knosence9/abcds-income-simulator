import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { verifyBuiltSiteMetadata } from '../scripts/verify-built-site-metadata.mjs';

const readerPages = [
  'index.html',
  'budget/index.html',
  'closed-end-funds/index.html',
  'getting-started/index.html',
  'simulator/index.html',
];

test('reports reader pages without parseable WebSite JSON-LD', async () => {
  const root = await mkdtemp(join(tmpdir(), 'abcds-metadata-'));

  try {
    for (const page of readerPages) {
      const target = join(root, page);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, '<html><head></head><body></body></html>');
    }

    assert.deepEqual(await verifyBuiltSiteMetadata(root), [
      'index.html: expected exactly one application/ld+json script, found 0',
      'budget/index.html: expected exactly one application/ld+json script, found 0',
      'closed-end-funds/index.html: expected exactly one application/ld+json script, found 0',
      'getting-started/index.html: expected exactly one application/ld+json script, found 0',
      'simulator/index.html: expected exactly one application/ld+json script, found 0',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects incomplete WebSite JSON-LD on a reader page', async () => {
  const root = await mkdtemp(join(tmpdir(), 'abcds-metadata-'));
  const incompleteGraph = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ABCDs Income Simulator',
    url: 'https://abcds-income-simulator.vercel.app/',
  };

  try {
    for (const page of readerPages) {
      const target = join(root, page);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        `<html><head><script type="application/ld+json">${JSON.stringify(incompleteGraph)}</script></head></html>`,
      );
    }

    assert.deepEqual(await verifyBuiltSiteMetadata(root), [
      'index.html: application/ld+json is not the shared WebSite graph',
      'budget/index.html: application/ld+json is not the shared WebSite graph',
      'closed-end-funds/index.html: application/ld+json is not the shared WebSite graph',
      'getting-started/index.html: application/ld+json is not the shared WebSite graph',
      'simulator/index.html: application/ld+json is not the shared WebSite graph',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts one complete shared WebSite JSON-LD graph on every reader page', async () => {
  const root = await mkdtemp(join(tmpdir(), 'abcds-metadata-'));
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ABCDs Income Simulator',
    url: 'https://abcds-income-simulator.vercel.app/',
    description:
      'An educational weekly-budget and ABCD income-projection tool with transparent assumptions.',
    educationalUse: 'Personal finance education',
  };

  try {
    for (const page of readerPages) {
      const target = join(root, page);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        `<html><head><script type="application/ld+json">${JSON.stringify(graph)}</script></head></html>`,
      );
    }

    assert.deepEqual(await verifyBuiltSiteMetadata(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
