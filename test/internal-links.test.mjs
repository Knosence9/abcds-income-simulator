import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  builtRootForModule,
  verifyBuiltInternalLinks,
} from '../scripts/verify-built-internal-links.mjs';

async function withBuiltSite(files, run) {
  const root = await mkdtemp(join(tmpdir(), 'abcds-links-'));

  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const destination = join(root, relativePath);
      await mkdir(join(destination, '..'), { recursive: true });
      await writeFile(destination, contents);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('decodes the module file URL when deriving the default built root', () => {
  const project = join(tmpdir(), 'ABCDs site with spaces');
  const moduleUrl = pathToFileURL(join(project, 'scripts', 'verify-links.mjs'));

  assert.equal(builtRootForModule(moduleUrl), join(project, 'dist'));
});

test('reports missing local routes and fragment targets', async () => {
  await withBuiltSite(
    {
      'index.html': `
        <main id="main-content">
          <a href="/missing">Missing route</a>
          <a href="/guide#missing-section">Missing section</a>
        </main>`,
      'guide/index.html': '<main id="overview"></main>',
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'index.html: /missing does not resolve to a built file',
        'index.html: /guide#missing-section targets missing fragment "missing-section" in guide/index.html',
      ]);
    },
  );
});

test('reports malformed local path encoding without aborting verification', async () => {
  await withBuiltSite(
    {
      'index.html': '<a href="/%E0%A4%A">Malformed path</a>',
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'index.html: /%E0%A4%A has an invalid path encoding',
      ]);
    },
  );
});

test('reports malformed fragment encoding without aborting verification', async () => {
  await withBuiltSite(
    {
      'index.html': '<a href="#%E0%A4%A">Malformed fragment</a>',
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'index.html: #%E0%A4%A has an invalid fragment encoding',
      ]);
    },
  );
});

test('does not resolve encoded local paths outside the built root', async () => {
  await withBuiltSite(
    {
      'index.html': '<a href="/%2e%2e%2foutside.html">Escaped path</a>',
    },
    async (root) => {
      const outsideFile = join(root, '..', 'outside.html');
      await writeFile(outsideFile, '<main id="outside"></main>');

      try {
        assert.deepEqual(await verifyBuiltInternalLinks(root), [
          'index.html: /%2e%2e%2foutside.html does not resolve to a built file',
        ]);
      } finally {
        await rm(outsideFile, { force: true });
      }
    },
  );
});

test('does not resolve symlinked targets outside the built root', async () => {
  await withBuiltSite(
    {
      'index.html': '<a href="/escaped.html">Escaped symlink</a>',
    },
    async (root) => {
      const outsideFile = join(root, '..', 'outside.html');
      await writeFile(outsideFile, '<main></main>');
      await symlink(outsideFile, join(root, 'escaped.html'));

      try {
        assert.deepEqual(await verifyBuiltInternalLinks(root), [
          'index.html: /escaped.html does not resolve to a built file',
        ]);
      } finally {
        await rm(outsideFile, { force: true });
      }
    },
  );
});

test('checks unquoted href attributes', async () => {
  await withBuiltSite(
    {
      'index.html': '<a href=/missing>Missing route</a>',
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'index.html: /missing does not resolve to a built file',
      ]);
    },
  );
});

test('ignores non-element and non-id fragment lookalikes', async () => {
  await withBuiltSite(
    {
      'index.html': `
        <a href="#data-id">Data id</a>
        <a href="#data-name">Data name</a>
        <a href="#comment">Comment</a>
        <a href="#raw-text">Raw text</a>
        <div data-id="data-id" data-name="data-name"></div>
        <!-- <div id="comment"></div> -->
        <script>const example = '<div id="raw-text">';</script>
        <style>.example { --markup: '<div name="raw-text">'; }</style>`,
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'index.html: #data-id targets missing fragment "data-id" in index.html',
        'index.html: #data-name targets missing fragment "data-name" in index.html',
        'index.html: #comment targets missing fragment "comment" in index.html',
        'index.html: #raw-text targets missing fragment "raw-text" in index.html',
      ]);
    },
  );
});

test('decodes HTML character references in href and fragment attributes', async () => {
  await withBuiltSite(
    {
      'index.html': `
        <a href="#one&amp;two">Ampersand</a>
        <a href="#quotes&quot;&apos;&lt;&gt;">Other named references</a>
        <div id="one&#38;two"></div>
        <a name="quotes&#x22;&#39;&#60;&#62;"></a>`,
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), []);
    },
  );
});

test('decodes non-basic named character references in href and fragment attributes', async () => {
  await withBuiltSite(
    {
      'index.html': `
        <a href="#copyright&copy;">Copyright id</a>
        <a href="#legacy&copy;">Copyright name</a>
        <div id="copyright©"></div>
        <a name="legacy©"></a>`,
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), []);
    },
  );
});

test('ignores markup-like text in HTML text states and script end-tag prefixes', async () => {
  await withBuiltSite(
    {
      'index.html': `
        <a href="#textarea-target">Textarea target</a>
        <a href="#title-target">Title target</a>
        <a href="#xmp-target">XMP target</a>
        <a href="#iframe-target">Iframe target</a>
        <a href="#noembed-target">Noembed target</a>
        <a href="#noframes-target">Noframes target</a>
        <a href="#script-prefix-target">Script prefix target</a>
        <textarea><div id="textarea-target"></div><a href="/textarea-phantom"></a></textarea>
        <title><div id="title-target"></div><a href="/title-phantom"></a></title>
        <xmp><div id="xmp-target"></div><a href="/xmp-phantom"></a></xmp>
        <iframe><div id="iframe-target"></div><a href="/iframe-phantom"></a></iframe>
        <noembed><div id="noembed-target"></div><a href="/noembed-phantom"></a></noembed>
        <noframes><div id="noframes-target"></div><a href="/noframes-phantom"></a></noframes>
        <script>const closingPrefix = '</scripture><div id="script-prefix-target"></div><a href="/script-phantom"></a>';</script>`,
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'index.html: #textarea-target targets missing fragment "textarea-target" in index.html',
        'index.html: #title-target targets missing fragment "title-target" in index.html',
        'index.html: #xmp-target targets missing fragment "xmp-target" in index.html',
        'index.html: #iframe-target targets missing fragment "iframe-target" in index.html',
        'index.html: #noembed-target targets missing fragment "noembed-target" in index.html',
        'index.html: #noframes-target targets missing fragment "noframes-target" in index.html',
        'index.html: #script-prefix-target targets missing fragment "script-prefix-target" in index.html',
      ]);
    },
  );
});

test('treats name as a fragment target only on anchor elements', async () => {
  await withBuiltSite(
    {
      'index.html': `
        <a href="#non-anchor-name">Non-anchor name</a>
        <a href="#anchor-name">Anchor name</a>
        <div name="non-anchor-name"></div>
        <a name="anchor-name"></a>`,
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'index.html: #non-anchor-name targets missing fragment "non-anchor-name" in index.html',
      ]);
    },
  );
});

test('reports invalid production search-discovery artifacts', async () => {
  await withBuiltSite(
    {
      'index.html': '<main></main>',
      'robots.txt': 'User-agent: *\nDisallow: /\n',
      'sitemap-index.xml': '<sitemapindex><sitemap><loc>https://example.com/sitemap.xml</loc></sitemap></sitemapindex>',
      'sitemap-0.xml': '<urlset><url><loc>https://abcds-income-simulator.vercel.app/menu-lab/</loc></url></urlset>',
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'robots.txt does not match the canonical crawl policy',
        'sitemap-index.xml does not reference the canonical sitemap',
        'sitemap-0.xml public URLs do not match the five reader routes',
      ]);
    },
  );
});

test('rejects malformed sitemap XML even when it contains the canonical locations', async () => {
  const origin = 'https://abcds-income-simulator.vercel.app';
  const readerLocations = [
    `${origin}/`,
    `${origin}/budget/`,
    `${origin}/closed-end-funds/`,
    `${origin}/getting-started/`,
    `${origin}/simulator/`,
  ].map((location) => `<loc>${location}</loc>`).join('');

  await withBuiltSite(
    {
      'robots.txt': `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap-index.xml\n`,
      'sitemap-index.xml': `<garbage><loc>${origin}/sitemap-0.xml</loc></garbage>`,
      'sitemap-0.xml': `<garbage>${readerLocations}</garbage>`,
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), [
        'sitemap-index.xml does not reference the canonical sitemap',
        'sitemap-0.xml public URLs do not match the five reader routes',
      ]);
    },
  );
});

test('accepts built routes, query strings, fragments, and excluded schemes', async () => {
  await withBuiltSite(
    {
      'index.html': `
        <main id="main-content">
          <a href="#main-content">Same page</a>
          <a href="/guide?from=home#overview">Guide</a>
          <a href="https://example.com">External</a>
          <a href="mailto:hello@example.com">Email</a>
          <a href="tel:+155****0100">Telephone</a>
          <a href="javascript:void(0)">Non-navigation control</a>
        </main>`,
      'guide/index.html': '<main id="overview"></main>',
    },
    async (root) => {
      assert.deepEqual(await verifyBuiltInternalLinks(root), []);
    },
  );
});
