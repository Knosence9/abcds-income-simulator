import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';

const EXCLUDED_SCHEMES = /^(?:https?:|mailto:|tel:|javascript:|data:)/i;

async function walkHtml(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkHtml(root, path));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(path);
  }

  return files.sort();
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isFileInside(path, realRoot) {
  if (!await isFile(path)) return false;

  try {
    const realTarget = await realpath(path);
    return realTarget.startsWith(`${realRoot}${sep}`);
  } catch {
    return false;
  }
}

function routeFile(root, pathname) {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = !relativePath
    ? join(root, 'index.html')
    : extname(relativePath)
      ? join(root, relativePath)
      : join(root, relativePath, 'index.html');
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);

  if (!resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)) return null;
  return resolvedCandidate;
}

function *elementNodes(node) {
  if (node.tagName) yield node;
  for (const child of node.childNodes ?? []) yield *elementNodes(child);
}

function attributeValue(element, name) {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function localHrefValues(document) {
  return [...elementNodes(document)]
    .filter((element) => element.tagName === 'a')
    .map((element) => attributeValue(element, 'href'))
    .filter((href) => href && !EXCLUDED_SCHEMES.test(href) && !href.startsWith('//'));
}

function fragmentIds(document) {
  const ids = new Set();
  for (const element of elementNodes(document)) {
    const id = attributeValue(element, 'id');
    const name = element.tagName === 'a' ? attributeValue(element, 'name') : undefined;
    if (id !== undefined) ids.add(id);
    if (name !== undefined) ids.add(name);
  }
  return ids;
}

function displayPath(root, path) {
  return relative(root, path).split(sep).join('/');
}

export async function verifyBuiltInternalLinks(root) {
  const errors = [];
  const idsByFile = new Map();
  const realRoot = await realpath(root);
  const documents = new Map();
  const htmlFiles = await walkHtml(root);

  for (const file of htmlFiles) documents.set(file, parse(await readFile(file, 'utf8')));

  for (const sourceFile of htmlFiles) {
    const sourcePath = displayPath(root, sourceFile);
    const sourceUrl = new URL(`https://built.local/${sourcePath}`);

    for (const href of localHrefValues(documents.get(sourceFile))) {
      let targetUrl;
      try {
        targetUrl = new URL(href, sourceUrl);
      } catch {
        errors.push(`${sourcePath}: ${href} is not a valid link`);
        continue;
      }

      if (targetUrl.origin !== sourceUrl.origin) continue;

      let targetFile;
      try {
        targetFile = routeFile(root, targetUrl.pathname);
      } catch {
        errors.push(`${sourcePath}: ${href} has an invalid path encoding`);
        continue;
      }
      if (!targetFile || !await isFileInside(targetFile, realRoot)) {
        errors.push(`${sourcePath}: ${href} does not resolve to a built file`);
        continue;
      }

      if (!targetUrl.hash || targetUrl.hash === '#') continue;
      let targetId;
      try {
        targetId = decodeURIComponent(targetUrl.hash.slice(1));
      } catch {
        errors.push(`${sourcePath}: ${href} has an invalid fragment encoding`);
        continue;
      }

      if (!idsByFile.has(targetFile)) {
        if (!documents.has(targetFile)) {
          documents.set(targetFile, parse(await readFile(targetFile, 'utf8')));
        }
        idsByFile.set(targetFile, fragmentIds(documents.get(targetFile)));
      }
      if (!idsByFile.get(targetFile).has(targetId)) {
        errors.push(
          `${sourcePath}: ${href} targets missing fragment "${targetId}" in ${displayPath(root, targetFile)}`,
        );
      }
    }
  }

  return errors;
}

export function builtRootForModule(moduleUrl) {
  return join(dirname(fileURLToPath(moduleUrl)), '..', 'dist');
}

async function run() {
  const root = process.argv[2] ?? builtRootForModule(import.meta.url);
  const errors = await verifyBuiltInternalLinks(root);

  if (errors.length) {
    console.error(`Internal link verification failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log('Internal link verification passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
