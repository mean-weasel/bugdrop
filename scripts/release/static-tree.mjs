import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { canonicalHash, compareUtf8 } from './canonical-json.mjs';

const STATIC_TREE_SCHEMA = 'bugdrop.static-tree/v1';
const DIGEST = /^[0-9a-f]{64}$/;

class StaticTreeError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'StaticTreeError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new StaticTreeError(code, message);
};
const posix = path => path.split(sep).join('/');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function enumerateStaticFiles(root, current = resolve(root)) {
  const base = resolve(root);
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => compareUtf8(a.name, b.name))) {
    const path = join(current, entry.name);
    const details = await lstat(path);
    if (details.isSymbolicLink()) fail('UNSAFE_STATIC_TREE', `symlink ${path}`);
    if (details.isDirectory()) files.push(...(await enumerateStaticFiles(base, path)));
    else if (details.isFile()) files.push(posix(relative(base, path)));
    else fail('UNSAFE_STATIC_TREE', `special file ${path}`);
  }
  return files.sort(compareUtf8);
}

export async function hashStaticTree(root) {
  const fileHashes = {};
  for (const path of await enumerateStaticFiles(root)) {
    fileHashes[path] = digest(await readFile(join(resolve(root), path)));
  }
  const staticPackage = { schema: STATIC_TREE_SCHEMA, fileHashes };
  return { ...staticPackage, contentIdentity: canonicalHash(staticPackage) };
}

export function validateStaticTreeRecord(record) {
  if (record?.schema !== STATIC_TREE_SCHEMA || record.fileHashes?.constructor !== Object) {
    fail('INVALID_STATIC_TREE', 'unsupported static tree record');
  }
  const entries = Object.entries(record.fileHashes);
  if (entries.length === 0) fail('INVALID_STATIC_TREE', 'file map is empty');
  for (const [path, hash] of entries) {
    if (
      !path ||
      path.startsWith('/') ||
      path.includes('..') ||
      path.includes('\\') ||
      !DIGEST.test(hash)
    ) {
      fail('INVALID_STATIC_TREE', `invalid file record ${path}`);
    }
  }
  const ordered = Object.fromEntries(entries.sort(([a], [b]) => compareUtf8(a, b)));
  const payload = { schema: STATIC_TREE_SCHEMA, fileHashes: ordered };
  if (record.contentIdentity !== canonicalHash(payload)) {
    fail('STATIC_TREE_IDENTITY_MISMATCH', 'static tree identity does not match its file map');
  }
  return { ...payload, contentIdentity: record.contentIdentity };
}

export async function assertStaticTree(root, expected) {
  const actual = await hashStaticTree(root);
  const normalized = validateStaticTreeRecord(expected);
  if (actual.contentIdentity !== normalized.contentIdentity) {
    fail('STATIC_TREE_MISMATCH', 'on-disk static tree differs from State 2');
  }
  return actual;
}
