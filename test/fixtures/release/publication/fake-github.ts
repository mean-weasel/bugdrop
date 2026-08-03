type LossPoint = 'create-tag' | 'create-draft' | 'upload-asset' | 'publish-draft';

type StoredAsset = { name: string; bytes: Buffer };
type StoredRelease = {
  id: string;
  tag: string;
  targetSha: string;
  draft: boolean;
  published: boolean;
  prerelease: boolean;
  marker: Record<string, unknown>;
  body: string;
  bodyMarker: string;
  assets: StoredAsset[];
};
type PublicationState = {
  complete?: boolean;
  tagRef?: null | { objectSha: string };
  tagObject?: null | {
    kind: string;
    objectSha: string;
    targetType: string;
    targetSha: unknown;
    annotation: unknown;
  };
  releases?: StoredRelease[];
};
type FakeOptions = {
  failInspectAfterApplied?: boolean;
  loseAfter?: LossPoint[];
  loseBefore?: LossPoint[];
  state?: PublicationState;
  inspectFails?: boolean;
};

export function clonePublicationState<T>(value: T): T {
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map(clonePublicationState) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clonePublicationState(item)])
    ) as T;
  }
  return value;
}

export class FakeGitHubPublicationAdapter {
  state: PublicationState;
  log: string[] = [];
  applied: string[] = [];
  inspectFails: boolean;
  private failInspectAfterApplied: boolean;
  private loseAfter: Set<LossPoint>;
  private loseBefore: Set<LossPoint>;

  constructor(options: FakeOptions = {}) {
    this.state = clonePublicationState(
      options.state ?? { complete: true, tagRef: null, tagObject: null, releases: [] }
    );
    this.inspectFails = options.inspectFails ?? false;
    this.failInspectAfterApplied = options.failInspectAfterApplied ?? false;
    this.loseAfter = new Set(options.loseAfter ?? []);
    this.loseBefore = new Set(options.loseBefore ?? []);
  }

  async inspect() {
    this.log.push('inspect');
    if (this.inspectFails || (this.failInspectAfterApplied && this.applied.length)) {
      throw new Error('inspection unavailable');
    }
    return clonePublicationState(this.state);
  }

  private lose(point: LossPoint, phase: 'before' | 'after') {
    const set = phase === 'before' ? this.loseBefore : this.loseAfter;
    if (!set.delete(point)) return;
    throw new Error(`lost ${point} response ${phase} apply`);
  }

  async createAnnotatedTag(input: Record<string, unknown>) {
    const point = 'create-tag';
    this.log.push(point);
    this.lose(point, 'before');
    if (this.state.tagRef || this.state.tagObject) throw new Error('tag overwrite attempted');
    const objectSha = '7'.repeat(40);
    this.state.tagRef = { objectSha };
    this.state.tagObject = {
      kind: 'annotated',
      objectSha,
      targetType: 'commit',
      targetSha: input.targetSha,
      annotation: input.annotation,
    };
    this.applied.push(point);
    this.lose(point, 'after');
  }

  async createDraft(input: Record<string, unknown>) {
    const point = 'create-draft';
    this.log.push(point);
    this.lose(point, 'before');
    if (this.state.releases?.length) throw new Error('duplicate Release attempted');
    this.state.releases = [
      {
        id: 'release-1',
        tag: input.tag,
        targetSha: input.targetSha,
        draft: true,
        published: false,
        prerelease: false,
        marker: input.marker as Record<string, unknown>,
        body: input.body as string,
        bodyMarker: input.bodyMarker as string,
        assets: [],
      },
    ];
    this.applied.push(point);
    this.lose(point, 'after');
  }

  async uploadAsset(input: { releaseId: string; name: string; bytes: Buffer }) {
    const point = 'upload-asset';
    this.log.push(`${point}:${input.name}`);
    this.lose(point, 'before');
    const release = this.state.releases?.find(item => item.id === input.releaseId);
    if (!release) throw new Error('missing draft');
    if (release.assets.some(asset => asset.name === input.name)) {
      throw new Error('asset overwrite attempted');
    }
    release.assets.push({ name: input.name, bytes: Buffer.from(input.bytes) });
    this.applied.push(`${point}:${input.name}`);
    this.lose(point, 'after');
  }

  async publishDraft(input: { releaseId: string }) {
    const point = 'publish-draft';
    this.log.push(point);
    this.lose(point, 'before');
    const release = this.state.releases?.find(item => item.id === input.releaseId);
    if (!release || !release.draft) throw new Error('non-draft publish attempted');
    release.draft = false;
    release.published = true;
    this.applied.push(point);
    this.lose(point, 'after');
  }
}
