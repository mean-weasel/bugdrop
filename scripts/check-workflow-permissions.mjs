import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const workflowRoot = resolve(process.argv[2] ?? '.github/workflows');

const expectedTopLevel = new Map([
  ['benchmark-ci.yml', {}],
  ['ci.yml', {}],
  ['cloudflare-capability.yml', { contents: 'read' }],
  ['codeql.yml', {}],
  ['dependency-review.yml', {}],
  ['deploy.yml', { contents: 'read' }],
  ['discord-release.yml', { contents: 'read' }],
  ['live-tests.yml', {}],
  ['production-heartbeat.yml', { contents: 'read' }],
  ['sync-docs.yml', {}],
]);

const denyByDefaultJobs = new Map([
  ['benchmark-ci.yml:lint', { contents: 'read' }],
  ['ci.yml:check', { checks: 'read', contents: 'read' }],
  ['ci.yml:coverage', { contents: 'read', 'id-token': 'write' }],
  ['ci.yml:deploy-preview', { contents: 'read' }],
  ['ci.yml:e2e', { contents: 'read' }],
  ['ci.yml:live-preview-tests', {}],
  ['ci.yml:radix-e2e', { contents: 'read' }],
  ['ci.yml:test', { contents: 'read' }],
  ['codeql.yml:analyze', { contents: 'read', 'security-events': 'write' }],
  ['dependency-review.yml:dependency-review', { contents: 'read' }],
  ['live-tests.yml:live-tests', { contents: 'read' }],
  ['sync-docs.yml:sync', { contents: 'read' }],
]);

const allowedWrites = new Set([
  'ci.yml:coverage:id-token',
  'codeql.yml:analyze:security-events',
  'deploy.yml:publish-release:contents',
  'production-heartbeat.yml:incident:issues',
]);

const failures = [];
const observedWrites = new Set();
const observedJobs = new Set();
const workflowFiles = (await readdir(workflowRoot)).filter(file => /\.ya?ml$/.test(file)).sort();

const normalized = permissions =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(permissions).sort(([left], [right]) => left.localeCompare(right))
    )
  );
const isPermissionMap = permissions =>
  typeof permissions === 'object' && permissions !== null && !Array.isArray(permissions);

for (const file of workflowFiles) {
  const workflow = parse(await readFile(resolve(workflowRoot, file), 'utf8'));
  const expectedPermissions = expectedTopLevel.get(file);

  if (!expectedPermissions) {
    failures.push(`${file}: add this workflow to the explicit top-level permission policy`);
    continue;
  }
  if (!Object.hasOwn(workflow, 'permissions')) {
    failures.push(`${file}: top-level permissions must be explicitly declared`);
  } else if (!isPermissionMap(workflow.permissions)) {
    failures.push(`${file}: top-level permissions must be an explicit permission map`);
  } else if (normalized(workflow.permissions) !== normalized(expectedPermissions)) {
    failures.push(`${file}: top-level permissions must be ${JSON.stringify(expectedPermissions)}`);
  }

  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    const jobKey = `${file}:${jobName}`;
    observedJobs.add(jobKey);
    const expectedJobPermissions = denyByDefaultJobs.get(jobKey);
    const actualJobPermissions = Object.hasOwn(job, 'permissions')
      ? job.permissions
      : workflow.permissions;

    if (!isPermissionMap(actualJobPermissions)) {
      failures.push(`${jobKey}: permissions must be an explicit permission map`);
      continue;
    }

    if (
      expectedJobPermissions &&
      normalized(actualJobPermissions) !== normalized(expectedJobPermissions)
    ) {
      failures.push(
        `${jobKey}: effective permissions must be ${JSON.stringify(expectedJobPermissions)}`
      );
    }

    for (const [scope, access] of Object.entries(actualJobPermissions)) {
      if (access !== 'write') continue;
      const writeKey = `${jobKey}:${scope}`;
      observedWrites.add(writeKey);
      if (!allowedWrites.has(writeKey)) {
        failures.push(`${jobKey}: ${scope}: write is not an approved grant`);
      }
    }

    if (typeof job.uses === 'string' && job.uses.startsWith('./')) {
      if (actualJobPermissions.contents !== 'read') {
        failures.push(`${jobKey}: local reusable workflow calls require contents: read`);
      }
    }
  }
}

for (const file of expectedTopLevel.keys()) {
  if (!workflowFiles.includes(file)) failures.push(`${file}: expected workflow is missing`);
}
for (const jobKey of denyByDefaultJobs.keys()) {
  if (!observedJobs.has(jobKey)) failures.push(`${jobKey}: expected job is missing`);
}
for (const writeKey of allowedWrites) {
  if (!observedWrites.has(writeKey)) failures.push(`${writeKey}: approved write grant is missing`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(
  `${workflowFiles.length} workflows have explicit boundaries and ${observedWrites.size} approved write grants`
);
