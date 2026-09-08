// Compare committed objects, never execute a package manifest or lifecycle hook.
import { execFileSync } from 'node:child_process';

const [base, head, path] = process.argv.slice(2);
try {
  const read = ref => {
    const entry = execFileSync('git', ['ls-tree', ref, '--', path], { encoding: 'utf8' });
    if (!entry.startsWith('100644 blob ')) throw new Error('Expected a regular manifest');
    const value = JSON.parse(execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' }));
    const metadata = path === 'package.json' ? value : value.packages[''];
    if (Object.hasOwn(metadata, 'license') && typeof metadata.license !== 'string') {
      throw new Error('Expected a string license');
    }
    delete metadata.license;
    return value;
  };
  // Conditional exports use object key order to select a matching entry.
  process.exitCode = JSON.stringify(read(base)) === JSON.stringify(read(head)) ? 0 : 1;
} catch {
  // Missing, deleted, malformed, or unsupported manifests require full CI.
  process.exitCode = 1;
}
