import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('built homepage places the Start here path between the hero and pillars', async () => {
  const html = await readFile(
    new URL('../dist/index.html', import.meta.url),
    'utf8',
  );

  const heroEnd = html.indexOf('</header>');
  const startHere = html.indexOf('class="start-here"');
  const pillars = html.indexOf('id="pillars"');

  assert.ok(heroEnd >= 0 && heroEnd < startHere && startHere < pillars);
  const stepDestinations = Array.from(
    html.matchAll(/class="start-here__step" href="([^"]+)"/g),
    (match) => match[1],
  );
  assert.deepEqual(stepDestinations, ['/budget', '#pillars', '/simulator']);
});
