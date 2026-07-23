import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { fileURLToPath } from 'node:url';

const READER_PAGES = [
  'index.html',
  'budget/index.html',
  'closed-end-funds/index.html',
  'getting-started/index.html',
  'simulator/index.html',
];
const EXPECTED_GRAPH = Object.freeze({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ABCDs Income Simulator',
  url: 'https://abcds-income-simulator.vercel.app/',
  description:
    'An educational weekly-budget and ABCD income-projection tool with transparent assumptions.',
  educationalUse: 'Personal finance education',
});
const EXPECTED_GRAPH_KEYS = Object.keys(EXPECTED_GRAPH).sort();

function childNodes(node) {
  return node.childNodes ?? [];
}

function findJsonLdScripts(node, found = []) {
  if (
    node.nodeName === 'script' &&
    node.attrs?.some(
      ({ name, value }) => name === 'type' && value === 'application/ld+json',
    )
  ) {
    found.push(node);
  }
  for (const child of childNodes(node)) findJsonLdScripts(child, found);
  return found;
}

function scriptText(node) {
  return childNodes(node)
    .filter((child) => child.nodeName === '#text')
    .map((child) => child.value)
    .join('');
}

export async function verifyBuiltSiteMetadata(root) {
  const errors = [];

  for (const page of READER_PAGES) {
    const html = await readFile(resolve(root, page), 'utf8');
    const scripts = findJsonLdScripts(parse(html));
    if (scripts.length !== 1) {
      errors.push(
        `${page}: expected exactly one application/ld+json script, found ${scripts.length}`,
      );
      continue;
    }

    let graph;
    try {
      graph = JSON.parse(scriptText(scripts[0]));
    } catch {
      errors.push(`${page}: application/ld+json script is not valid JSON`);
      continue;
    }

    if (
      !graph ||
      typeof graph !== 'object' ||
      Array.isArray(graph) ||
      Object.keys(graph).sort().join('\n') !== EXPECTED_GRAPH_KEYS.join('\n') ||
      Object.entries(EXPECTED_GRAPH).some(([key, value]) => graph[key] !== value)
    ) {
      errors.push(`${page}: application/ld+json is not the shared WebSite graph`);
    }
  }

  return errors;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? 'dist');
  const errors = await verifyBuiltSiteMetadata(root);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Verified WebSite JSON-LD on ${READER_PAGES.length} reader pages.`);
  }
}
