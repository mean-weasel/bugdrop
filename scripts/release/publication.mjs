import { createHash } from 'node:crypto';
import { canonicalHash, canonicalize, compareUtf8 } from './canonical-json.mjs';
import { buildPublicationMarker } from './plan.mjs';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const TAG_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const ASSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const CORE_ASSETS = [
  'checksums.sha256',
  'final-release-plan.json',
  'release-content.json',
  'request-plan.json',
];
const RECOVERY = Object.freeze({
  automaticGitHubCleanup: false,
  automaticProductionCommandAuthorized: false,
  preservePublicationState: true,
  production: 'restore-prior-baseline',
});
export class PublicationError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, details, name: 'PublicationError' });
  }
}
function fail(code, message, details) {
  throw new PublicationError(code, message, details);
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function exactBuffer(value, field) {
  if (!Buffer.isBuffer(value)) fail('INVALID_BUNDLE', `${field} must be bytes`);
  return value;
}
function without(object, key) {
  const copy = { ...object };
  delete copy[key];
  return copy;
}
const same = (left, right) => canonicalize(left) === canonicalize(right);
function expectedChecksumBytes(hashes) {
  return Buffer.from(
    `${Object.entries(hashes)
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([name, digest]) => `${digest}  ${name}`)
      .join('\n')}\n`
  );
}
export function validatePublicationBundle(input) {
  const { requestPlan, releaseContent, finalPlan } = input ?? {};
  if (![requestPlan, releaseContent, finalPlan].every(value => value?.constructor === Object)) {
    fail('INVALID_BUNDLE', 'request, content, and final plan records are required');
  }
  const validIdentity =
    requestPlan.requestIdentity ===
      (requestPlan.protocol === 'release-plan/v2'
        ? canonicalHash({
            schema: requestPlan.schema,
            protocol: requestPlan.protocol,
            request: requestPlan.request,
            source: requestPlan.source,
            attestation: requestPlan.attestation,
            inventory: requestPlan.inventory,
            retention: requestPlan.retention,
          })
        : canonicalHash({ schema: requestPlan.schema, request: requestPlan.request })) &&
    releaseContent.contentIdentity === canonicalHash(without(releaseContent, 'contentIdentity')) &&
    finalPlan.planIdentity === canonicalHash(without(finalPlan, 'planIdentity')) &&
    finalPlan.requestPlanHash === canonicalHash(requestPlan) &&
    releaseContent.requestIdentity === requestPlan.requestIdentity &&
    finalPlan.requestIdentity === requestPlan.requestIdentity &&
    finalPlan.contentIdentity === releaseContent.contentIdentity;
  if (!validIdentity) fail('INVALID_BUNDLE', 'release identity records do not authenticate');
  if (
    !['release-plan/v1', 'release-plan/v2'].includes(requestPlan.protocol) ||
    finalPlan.protocol !== requestPlan.protocol ||
    !TAG_PATTERN.test(finalPlan.tag ?? '') ||
    !SHA_PATTERN.test(finalPlan.targetSha ?? '') ||
    finalPlan.tag !== requestPlan.request?.nextTag ||
    finalPlan.targetSha !== requestPlan.request?.targetSha ||
    finalPlan.repository !== requestPlan.request?.repository ||
    releaseContent.verification?.result !== 'passed'
  ) {
    fail('INVALID_BUNDLE', 'release plan is inconsistent or not verified');
  }
  const required = finalPlan.requiredAssets;
  if (!Array.isArray(required) || required.length === 0) {
    fail('INVALID_BUNDLE', 'requiredAssets must be non-empty');
  }
  required.forEach(name => {
    if (!ASSET_PATTERN.test(name)) fail('INVALID_BUNDLE', `invalid asset name ${name}`);
  });
  const plannedRequired = [
    ...new Set([...(requestPlan.attestation?.expectedAssetNames ?? []), ...CORE_ASSETS]),
  ].sort(compareUtf8);
  if (!same(required, plannedRequired)) {
    fail('INVALID_BUNDLE', 'requiredAssets must exactly match the request attestation');
  }
  const assets = input.assets;
  if (
    !assets ||
    assets.constructor !== Object ||
    !same(Object.keys(assets).sort(compareUtf8), required)
  ) {
    fail('INVALID_BUNDLE', 'asset names do not exactly match the final plan');
  }
  const expectedBytes = {
    'request-plan.json': Buffer.from(`${canonicalize(requestPlan)}\n`),
    'release-content.json': Buffer.from(`${canonicalize(releaseContent)}\n`),
    'final-release-plan.json': Buffer.from(`${canonicalize(finalPlan)}\n`),
  };
  const hashes = {};
  for (const name of required.filter(name => name !== 'checksums.sha256')) {
    const bytes = exactBuffer(assets[name], name);
    if (expectedBytes[name] && !bytes.equals(expectedBytes[name])) {
      fail('INVALID_BUNDLE', `${name} bytes are not canonical`);
    }
    const digest = sha256(bytes);
    const declared = (releaseContent.publicationAssetHashes ?? releaseContent.artifactHashes)?.[
      name
    ];
    if (!expectedBytes[name] && declared !== digest) {
      fail('INVALID_BUNDLE', `${name} does not match release content`);
    }
    hashes[name] = digest;
  }
  const checksumBytes = exactBuffer(assets['checksums.sha256'], 'checksums.sha256');
  if (!checksumBytes.equals(expectedChecksumBytes(hashes))) {
    fail('INVALID_BUNDLE', 'checksums do not bind every published asset');
  }
  hashes['checksums.sha256'] = sha256(checksumBytes);
  const marker = buildPublicationMarker(finalPlan);
  const encodedMarker = Buffer.from(canonicalize(marker)).toString('base64url');
  const bodyMarker = `<!-- bugdrop-publication ${encodedMarker} -->`;
  return {
    assets,
    body: [requestPlan.releaseNotes, bodyMarker].filter(Boolean).join('\n\n'),
    bodyMarker,
    expectedHashes: hashes,
    marker,
    name: `BugDrop ${finalPlan.tag.slice(1)}`,
    planIdentity: finalPlan.planIdentity,
    protocol: finalPlan.protocol,
    requiredAssets: required,
    ...(finalPlan.staticPackageIdentity
      ? { staticPackageIdentity: finalPlan.staticPackageIdentity }
      : {}),
    tag: finalPlan.tag,
    tagAnnotation: `BugDrop ${finalPlan.tag}\n\n${canonicalize(marker)}`,
    targetSha: finalPlan.targetSha,
  };
}
const conflict = reason => ({ status: 'conflict', reason });
const unknown = reason => ({ status: 'unknown-critical', reason });
function releaseState(expected, release) {
  if (
    release.targetSha !== expected.targetSha ||
    release.prerelease !== false ||
    !same(release.marker, expected.marker) ||
    release.body !== expected.body ||
    release.bodyMarker !== expected.bodyMarker
  ) {
    return conflict('release-identity-mismatch');
  }
  const validStatus =
    (release.draft === true && release.published === false) ||
    (release.draft === false && release.published === true);
  if (!validStatus) return conflict('release-status-invalid');
  if (typeof release.id !== 'string' || !release.id) return unknown('release-id-missing');
  if (!Array.isArray(release.assets)) return unknown('asset-inspection-incomplete');
  const names = release.assets.map(asset => asset?.name);
  if (new Set(names).size !== names.length) return conflict('duplicate-asset-name');
  if (names.some(name => !expected.requiredAssets.includes(name))) {
    return conflict('unexpected-asset');
  }
  for (const asset of release.assets) {
    if (!Buffer.isBuffer(asset.bytes)) return unknown(`asset-bytes-missing:${asset.name}`);
    if (sha256(asset.bytes) !== expected.expectedHashes[asset.name]) {
      return conflict(`asset-content-mismatch:${asset.name}`);
    }
  }
  const missing = expected.requiredAssets.filter(name => !names.includes(name));
  if (release.published) {
    return missing.length ? conflict('published-assets-incomplete') : { status: 'exact-published' };
  }
  return missing.length
    ? {
        status: 'partial-resumable',
        nextAction: {
          kind: 'upload-asset',
          releaseId: release.id,
          name: missing[0],
          bytes: expected.assets[missing[0]],
        },
      }
    : {
        status: 'partial-resumable',
        nextAction: { kind: 'publish-draft', releaseId: release.id },
      };
}
export function classifyPublicationState(expected, observation) {
  if (
    observation?.complete !== true ||
    !Object.hasOwn(observation, 'tagRef') ||
    !Object.hasOwn(observation, 'tagObject') ||
    !Array.isArray(observation.releases)
  ) {
    return unknown('inspection-incomplete');
  }
  const releases = observation.releases.filter(release => release?.tag === expected.tag);
  if (releases.length > 1) return conflict('duplicate-release');
  const tagRef = observation.tagRef;
  const tagObject = observation.tagObject;
  if (Boolean(tagRef) !== Boolean(tagObject)) return conflict('tag-ref-object-mismatch');
  if (tagRef) {
    if (
      !SHA_PATTERN.test(tagRef.objectSha ?? '') ||
      tagObject.kind !== 'annotated' ||
      tagObject.targetType !== 'commit' ||
      tagObject.objectSha !== tagRef.objectSha ||
      tagObject.targetSha !== expected.targetSha ||
      tagObject.annotation !== expected.tagAnnotation
    ) {
      return conflict('tag-identity-mismatch');
    }
  }
  if (!tagRef && releases.length) return conflict('release-without-tag');
  if (releases.length) return releaseState(expected, releases[0]);
  if (tagRef) {
    return {
      status: 'partial-resumable',
      nextAction: {
        kind: 'create-draft',
        tag: expected.tag,
        targetSha: expected.targetSha,
        name: expected.name,
        body: expected.body,
        marker: expected.marker,
        bodyMarker: expected.bodyMarker,
      },
    };
  }
  return {
    status: 'partial-resumable',
    nextAction: {
      kind: 'create-tag',
      tag: expected.tag,
      targetSha: expected.targetSha,
      annotation: expected.tagAnnotation,
    },
  };
}
const actionKey = action => (action ? `${action.kind}:${action.name ?? ''}` : 'complete');
function publicAction(action) {
  if (!action) return null;
  const { bytes: _bytes, body: _body, marker: _marker, ...safe } = action;
  return safe;
}
async function mutate(adapter, action) {
  if (action.kind === 'create-tag') return adapter.createAnnotatedTag(action);
  if (action.kind === 'create-draft') return adapter.createDraft(action);
  if (action.kind === 'upload-asset') return adapter.uploadAsset(action);
  if (action.kind === 'publish-draft') return adapter.publishDraft(action);
  fail('INVALID_ACTION', `unsupported action ${action.kind}`);
}
function stopped(expected, state, details = {}) {
  return {
    ...state,
    ...details,
    planIdentity: expected.planIdentity,
    recovery: RECOVERY,
    tag: expected.tag,
    ...(state.nextAction ? { nextAction: publicAction(state.nextAction) } : {}),
  };
}
export async function executePublication({ adapter, bundle }) {
  const expected = validatePublicationBundle(bundle);
  const history = [];
  let mutated = false;
  const inspect = async () => {
    try {
      return classifyPublicationState(expected, await adapter.inspect(expected.tag));
    } catch (error) {
      return unknown(error instanceof Error ? error.message : String(error));
    }
  };
  for (let attempt = 0; attempt < expected.requiredAssets.length + 4; attempt += 1) {
    const state = await inspect();
    if (state.status === 'exact-published') {
      return {
        status: mutated ? 'published' : 'already-published',
        history,
        planIdentity: expected.planIdentity,
        tag: expected.tag,
      };
    }
    if (state.status !== 'partial-resumable') return stopped(expected, state, { history });
    const action = state.nextAction;
    try {
      await mutate(adapter, action);
      mutated = true;
      history.push({ action: publicAction(action), result: 'applied' });
    } catch (error) {
      const after = await inspect();
      const message = error instanceof Error ? error.message : String(error);
      if (after.status === 'conflict' || after.status === 'unknown-critical') {
        return stopped(expected, after, { history, mutationError: message });
      }
      if (after.status === 'exact-published' || actionKey(after.nextAction) !== actionKey(action)) {
        mutated = true;
        history.push({ action: publicAction(action), result: 'confirmed-after-lost-response' });
        if (after.status === 'exact-published') {
          return {
            status: 'published',
            history,
            planIdentity: expected.planIdentity,
            tag: expected.tag,
          };
        }
        continue;
      }
      return stopped(expected, after, { history, mutationError: message });
    }
  }
  return stopped(expected, unknown('transition-limit-exceeded'), { history });
}
