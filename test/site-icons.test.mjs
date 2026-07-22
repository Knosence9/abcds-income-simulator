import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test('shared metadata links the branded site icons and manifest', async () => {
  const metadataComponent = await readFile(
    projectFile('src/components/SiteMetadata.astro'),
    'utf8',
  );

  assert.match(
    metadataComponent,
    /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/,
  );
  assert.match(
    metadataComponent,
    /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png" \/>/,
  );
  assert.match(
    metadataComponent,
    /<link rel="manifest" href="\/site\.webmanifest" \/>/,
  );
  assert.match(metadataComponent, /<meta name="theme-color" content="#101f3d" \/>/);
});

test('manifest declares accurate branded static-site metadata', async () => {
  const manifest = JSON.parse(
    await readFile(projectFile('public/site.webmanifest'), 'utf8'),
  );

  assert.equal(manifest.name, 'ABCDs Income Simulator');
  assert.equal(manifest.short_name, 'ABCDs');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#f4eddf');
  assert.equal(manifest.theme_color, '#101f3d');
  assert.deepEqual(manifest.icons, [
    {
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any maskable',
    },
  ]);
});

test('favicon is an accessible SVG with ABCD branding', async () => {
  const icon = await readFile(projectFile('public/favicon.svg'), 'utf8');

  assert.match(icon, /^<svg\b[^>]*aria-labelledby="title"/);
  assert.match(icon, /<title id="title">ABCDs Income Simulator<\/title>/);
  assert.match(icon, />ABCD</);
});

test('Apple touch icon is a compatible 180px PNG', async () => {
  const icon = await readFile(projectFile('public/apple-touch-icon.png'));

  assert.deepEqual(icon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(icon.readUInt32BE(16), 180);
  assert.equal(icon.readUInt32BE(20), 180);
});

test('manifest icons provide compatible install and maskable PNG sizes', async () => {
  for (const size of [192, 512]) {
    const icon = await readFile(projectFile(`public/icon-${size}.png`));

    assert.deepEqual(icon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(icon.readUInt32BE(16), size);
    assert.equal(icon.readUInt32BE(20), size);
  }
});

test('shared icon artwork keeps the ABCD mark inside the maskable safe zone', async () => {
  const icon = await readFile(projectFile('public/favicon.svg'), 'utf8');
  const viewBox = icon.match(/viewBox="0 0 (\d+) (\d+)"/);
  const ring = icon.match(/<circle cx="90" cy="90" r="(\d+)"[^>]*stroke-width="(\d+)"/);

  assert.ok(viewBox);
  assert.ok(ring);
  assert.equal(viewBox[1], viewBox[2]);

  const canvasSize = Number(viewBox[1]);
  const outerRingRadius = Number(ring[1]) + Number(ring[2]) / 2;

  // Maskable artwork must stay inside the central 80%-diameter safe circle.
  assert.ok(outerRingRadius * 2 <= canvasSize * 0.8);
});
