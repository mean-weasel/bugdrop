import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isScalar, LineCounter, parseDocument, visit } from 'yaml';

const workflowRoot = resolve(process.argv[2] ?? '.github/workflows');
const workflowFiles = (await readdir(workflowRoot)).filter(file => /\.ya?ml$/.test(file)).sort();

const minimumMajor = new Map([
  ['actions/cache', 5],
  ['actions/cache/restore', 5],
  ['actions/cache/save', 5],
  ['actions/checkout', 5],
  ['actions/download-artifact', 5],
  ['actions/setup-node', 5],
  ['actions/upload-artifact', 5],
]);

const approvedReleases = new Map([
  ['actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9', 'v6.1.0'],
  ['actions/cache/restore@caa296126883cff596d87d8935842f9db880ef25', 'v5.1.0'],
  ['actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9', 'v6.1.0'],
  ['actions/cache/save@caa296126883cff596d87d8935842f9db880ef25', 'v5.1.0'],
  ['actions/cache@caa296126883cff596d87d8935842f9db880ef25', 'v5.1.0'],
  ['actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
  ['actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09', 'v5.1.0'],
  ['actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0', 'v5.0.0'],
  ['actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3', 'v8.0.0'],
  ['actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd', 'v8.0.0'],
  ['actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444', 'v5.0.0'],
  ['actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4', 'v5.0.0'],
  ['actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f', 'v7.0.0'],
  ['codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f', 'v7.0.0'],
]);

const failures = [];
let externalActionCount = 0;

for (const file of workflowFiles) {
  const source = await readFile(resolve(workflowRoot, file), 'utf8');
  const lineCounter = new LineCounter();
  const document = parseDocument(source, { lineCounter });

  document.errors.forEach(error => failures.push(`${file}: ${error.message}`));

  visit(document, {
    Pair(_key, pair) {
      if (!isScalar(pair.key)) {
        const line = lineCounter.linePos(pair.key.range?.[0] ?? 0).line;
        failures.push(`${file}:${line}: workflow mapping keys must be literal strings`);
        return;
      }
      if (pair.key.value !== 'uses') return;

      const location = `${file}:${lineCounter.linePos(pair.key.range[0]).line}`;
      if (!isScalar(pair.value) || typeof pair.value.value !== 'string') {
        failures.push(`${location}: uses must be a literal action reference`);
        return;
      }

      const spec = pair.value.value;
      if (spec.startsWith('./')) return;

      externalActionCount += 1;
      const version = pair.value.comment?.trim();
      const separator = spec.lastIndexOf('@');
      const action = separator === -1 ? spec : spec.slice(0, separator);
      const reference = separator === -1 ? '' : spec.slice(separator + 1);
      const hasFullSha = /^[0-9a-f]{40}$/.test(reference);
      const hasExactVersion = /^v\d+\.\d+\.\d+$/.test(version ?? '');

      if (!hasFullSha) {
        failures.push(`${location}: ${action} is not pinned to a full commit SHA`);
      }
      if (!hasExactVersion) {
        failures.push(`${location}: ${action} needs an exact version comment such as # v5.1.0`);
      }
      if (
        hasFullSha &&
        hasExactVersion &&
        approvedReleases.get(`${action}@${reference}`) !== version
      ) {
        failures.push(`${location}: ${action}@${reference} is not approved as ${version}`);
      }
      if (action === 'cloudflare/wrangler-action') {
        failures.push(`${location}: use the repository-pinned Wrangler CLI, not wrangler-action`);
      }

      const requiredMajor = minimumMajor.get(action);
      const actualMajor = Number(version?.match(/^v(\d+)\./)?.[1]);
      if (requiredMajor && actualMajor < requiredMajor) {
        failures.push(
          `${location}: ${action} v${actualMajor} is below the Node 24-ready v${requiredMajor} floor`
        );
      }
    },
  });
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(
  `${externalActionCount} external GitHub Action references are SHA-pinned and Node 24-ready`
);
