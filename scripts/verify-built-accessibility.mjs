import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';

const READER_FILES = [
  'index.html',
  'budget/index.html',
  'closed-end-funds/index.html',
  'getting-started/index.html',
  'simulator/index.html',
];

function *elementNodes(node) {
  if (node.tagName) yield node;
  for (const child of node.childNodes ?? []) yield *elementNodes(child);
}

function attributeValue(element, name) {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function hasClass(element, className) {
  return (attributeValue(element, 'class') ?? '').split(/\s+/).includes(className);
}

function textContent(node) {
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes ?? []).map(textContent).join('');
}

function hasNativeLabel(element, elements) {
  const id = attributeValue(element, 'id');
  const hasExplicitLabel = id !== undefined && elements.some(
    (candidate) => candidate.tagName === 'label'
      && attributeValue(candidate, 'for') === id
      && textContent(candidate).trim() !== '',
  );
  if (hasExplicitLabel) return true;

  for (let ancestor = element.parentNode; ancestor; ancestor = ancestor.parentNode) {
    if (ancestor.tagName === 'label') return textContent(ancestor).trim() !== '';
  }
  return false;
}

function hasAccessibleName(element, elementsById, elements, allowNativeLabel = false) {
  const labelledBy = attributeValue(element, 'aria-labelledby');
  if (labelledBy !== undefined) {
    const ids = labelledBy.trim().split(/\s+/).filter(Boolean);
    return ids.length > 0 && ids.every((id) => {
      const label = elementsById.get(id);
      return label !== undefined && textContent(label).trim() !== '';
    });
  }

  const ariaLabel = attributeValue(element, 'aria-label');
  if (ariaLabel?.trim()) return true;

  return allowNativeLabel && hasNativeLabel(element, elements);
}

export function verifyAccessibilityMarkup(html, displayPath) {
  const elements = [...elementNodes(parse(html))];
  const elementsById = new Map(
    elements
      .map((element) => [attributeValue(element, 'id'), element])
      .filter(([id]) => id !== undefined),
  );
  const errors = [];
  const skipLinks = elements.filter(
    (element) => element.tagName === 'a' && hasClass(element, 'skip-link'),
  );
  const mainLandmarks = elements.filter(
    (element) => element.tagName === 'main' && attributeValue(element, 'id') === 'main-content',
  );

  if (
    skipLinks.length !== 1
    || attributeValue(skipLinks[0], 'href') !== '#main-content'
  ) {
    errors.push(`${displayPath}: skip link must target #main-content`);
  }
  if (mainLandmarks.length !== 1) {
    errors.push(`${displayPath}: expected one <main id="main-content"> landmark`);
  }

  for (const element of elements.filter((candidate) => hasClass(candidate, 'table-wrap'))) {
    if (
      attributeValue(element, 'role') !== 'region'
      || attributeValue(element, 'tabindex') !== '0'
      || !hasAccessibleName(element, elementsById, elements)
    ) {
      errors.push(
        `${displayPath}: focusable table scroll region requires role="region" and an accessible name`,
      );
    }
  }

  for (const element of elements.filter(
    (candidate) => candidate.tagName === 'input' && attributeValue(candidate, 'type') === 'range',
  )) {
    if (!hasAccessibleName(element, elementsById, elements, true)) {
      const id = attributeValue(element, 'id');
      errors.push(`${displayPath}: range input${id ? ` #${id}` : ''} requires an accessible name`);
    }
  }

  return errors;
}

export async function verifyBuiltAccessibility(root) {
  const errors = [];

  for (const readerFile of READER_FILES) {
    let html;
    try {
      html = await readFile(join(root, readerFile), 'utf8');
    } catch {
      errors.push(`${readerFile}: reader page is missing from the build`);
      continue;
    }
    errors.push(...verifyAccessibilityMarkup(html, readerFile));
  }

  return errors;
}

function builtRootForModule(moduleUrl) {
  return join(dirname(fileURLToPath(moduleUrl)), '..', 'dist');
}

async function run() {
  const root = process.argv[2] ?? builtRootForModule(import.meta.url);
  const errors = await verifyBuiltAccessibility(root);

  if (errors.length) {
    console.error(`Built accessibility verification failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Built accessibility verification passed (${READER_FILES.length} reader pages).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
