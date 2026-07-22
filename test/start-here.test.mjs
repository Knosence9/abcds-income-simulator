import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('homepage surfaces the connected three-step reader path beneath the hero', async () => {
  const source = await readFile(
    new URL('../src/pages/index.astro', import.meta.url),
    'utf8',
  );

  const heroEnd = source.indexOf('</header>');
  const startHere = source.indexOf('<section class="start-here" aria-labelledby="start-here-title">');
  const pillars = source.indexOf('<section id="pillars"');

  assert.ok(heroEnd >= 0 && heroEnd < startHere && startHere < pillars);
  assert.equal((source.match(/class="start-here__step"/g) ?? []).length, 3);
  assert.match(source, /<h2 id="start-here-title">Start here<\/h2>/);
  assert.match(
    source,
    /<a class="start-here__step" href="\/budget">\s*<span>1<\/span>\s*Set your weekly budget\s*<\/a>/,
  );
  assert.match(
    source,
    /<a class="start-here__step" href="#pillars">\s*<span>2<\/span>\s*Learn the four pillars\s*<\/a>/,
  );
  assert.match(
    source,
    /<a class="start-here__step" href="\/simulator">\s*<span>3<\/span>\s*Run a base and stress projection\s*<\/a>/,
  );
  assert.match(source, /\.start-here__steps\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/);
  assert.match(
    source,
    /@media \(max-width:\s*1100px\)\s*\{[\s\S]*\.start-here__steps\s*\{\s*grid-template-columns:\s*1fr;/,
  );
  assert.match(source, /\.start-here__step:focus-visible\s*\{/);
});
