import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAGE_METADATA,
  SITE_ORIGIN,
  buildPageMetadata,
  serializeStructuredData,
} from '../src/lib/site-metadata.mjs';

const expectedPages = {
  '/': {
    title: 'ABCD Strategy Guide',
    description:
      'Learn the ABCD income strategy, weekly cash-flow rules, margin repair thresholds, and a practical path from budgeting to projection.',
  },
  '/budget/': {
    title: 'ABCD Weekly Budget Planner',
    description:
      'Build a private, browser-local weekly budget and calculate a safe contribution after essentials, flexible spending, and breathing room.',
  },
  '/simulator/': {
    title: 'ABCD Income Projection Lab',
    description:
      'Explore transparent ABCD income projections with separate market value, net equity, distributions, reinvestment, cash, and margin ledgers.',
  },
  '/getting-started/': {
    title: 'ABCD Getting Started Guide',
    description:
      'Start the ABCD process with an exact weekly budget, understand the four income pillars, and learn when investing should pause or resume.',
  },
  '/closed-end-funds/': {
    title: 'Closed-End Funds in the ABCD System',
    description:
      'Learn how closed-end funds work, including NAV, discounts, premiums, leverage, distributions, and their role in the ABCD income framework.',
  },
};

const readerPaths = Object.keys(expectedPages);

test('every reader page has complete self-referencing metadata', () => {
  assert.equal(SITE_ORIGIN, 'https://abcds-income-simulator.vercel.app');
  assert.deepEqual(Object.keys(PAGE_METADATA).sort(), [...readerPaths].sort());

  for (const path of readerPaths) {
    const metadata = buildPageMetadata(path);

    assert.equal(metadata.title, expectedPages[path].title);
    assert.equal(metadata.description, expectedPages[path].description);
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

test('structured metadata serialization escapes script-closing input', () => {
  const hostileMetadata = {
    description: '</script><script>alert("unsafe")</script>',
  };
  const serialized = serializeStructuredData(hostileMetadata);

  assert.doesNotMatch(serialized, /</);
  assert.deepEqual(JSON.parse(serialized), hostileMetadata);
});

test('every reader page receives safe parseable WebSite structured metadata', async () => {
  const expectedStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ABCDs Income Simulator',
    url: `${SITE_ORIGIN}/`,
    description:
      'An educational weekly-budget and ABCD income-projection tool with transparent assumptions.',
    educationalUse: 'Personal finance education',
  };

  for (const path of readerPaths) {
    const metadata = buildPageMetadata(path);

    assert.deepEqual(metadata.structuredData, expectedStructuredData);
    assert.deepEqual(JSON.parse(metadata.structuredDataJson), expectedStructuredData);
    assert.doesNotMatch(metadata.structuredDataJson, /</);
  }

  const component = await readFile(
    new URL('../src/components/SiteMetadata.astro', import.meta.url),
    'utf8',
  );
  assert.match(
    component,
    /<script type="application\/ld\+json" is:inline set:html=\{metadata\.structuredDataJson\}><\/script>/,
  );
});
