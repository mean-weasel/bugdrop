import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FLOW_CAPABILITIES } from '../docs/website/flow-capabilities';
import { syncWebsiteDocs } from '../scripts/sync-website-docs.mjs';

const temporaryRoots: string[] = [];

async function temporaryWebsite(name = 'bugdrop-web') {
  const root = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), 'bugdrop-doc-sync-'))
  );
  temporaryRoots.push(root);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name }));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true })));
});

describe('website documentation sync', () => {
  it('binds documented field limits and MIME values to the released validator source', async () => {
    const source = await readFile('src/widget/flows/field-validation.ts', 'utf8');
    const numericSource = source.replaceAll('_', '');
    const constraints = FLOW_CAPABILITIES.fields.constraints;

    expect(numericSource).toContain(
      `const minimum = field.minLength ?? ${constraints.text.minLength.default}`
    );
    expect(numericSource).toContain(
      `const maximum = field.maxLength ?? (field.type === 'shortText' ? ${constraints.text.maxLength.defaults.shortText} : ${constraints.text.maxLength.defaults.longText})`
    );
    expect(numericSource).toContain(
      `boundedInteger(minimum, ${constraints.text.minLength.minimum}, ${constraints.text.minLength.maximum})`
    );
    expect(numericSource).toContain(
      `boundedInteger(maximum, ${constraints.text.maxLength.minimum}, ${constraints.text.maxLength.maximum})`
    );
    expect(numericSource).toContain(
      `boundedInteger(field.rows, ${constraints.text.longTextRows.minimum}, ${constraints.text.longTextRows.maximum})`
    );
    expect(numericSource).toContain(
      `field.options.length < ${constraints.singleChoiceOptions.minimum} || field.options.length > ${constraints.singleChoiceOptions.maximum}`
    );
    expect(numericSource).toContain(
      `boundedInteger(field.maxFiles, ${constraints.attachments.maxFiles.minimum}, ${constraints.attachments.maxFiles.maximum})`
    );
    expect(numericSource).toContain(
      `field.maxFiles ?? ${constraints.attachments.maxFiles.default}`
    );
    expect(constraints.attachments.maxFileSizeBytes.maximum).toBe(5 * 1024 * 1024);
    expect(constraints.attachments.maxFileSizeBytes.default).toBe(5 * 1024 * 1024);
    expect(numericSource).toContain(
      `boundedInteger(field.maxFileSize, ${constraints.attachments.maxFileSizeBytes.minimum}, 5 * 1024 * 1024)`
    );
    expect(numericSource).toContain('field.maxFileSize ?? 5 * 1024 * 1024');
    expect(constraints.attachments.acceptCount.minimum).toBe(1);
    expect(numericSource).toContain('field.accept.length === 0');
    expect(numericSource).toContain(
      `field.accept.length > ${constraints.attachments.acceptCount.maximum}`
    );

    const allowedTypes = source.match(/const ALLOWED_ATTACHMENT_TYPES = new Set\(\[([\s\S]*?)\]\)/);
    expect(allowedTypes).not.toBeNull();
    expect([...allowedTypes![1].matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual(
      constraints.attachments.acceptedMimeTypes
    );
  });

  it('stages both documentation and the canonical capability manifest', async () => {
    const workflow = await readFile('.github/workflows/sync-docs.yml', 'utf8');
    expect(workflow).toContain('git add src/content/docs/ src/lib/flow-capabilities.ts');
  });

  it('copies every canonical page and capability manifest with content hashes', async () => {
    const target = await temporaryWebsite();
    const manifest = await syncWebsiteDocs(target, 'source-revision');

    expect(manifest.sourceRepository).toBe('mean-weasel/bugdrop');
    expect(manifest.files).toContainEqual(
      expect.objectContaining({
        source: 'docs/website/flow-capabilities.ts',
        target: 'src/lib/flow-capabilities.ts',
      })
    );
    for (const entry of manifest.files) {
      expect(await readFile(path.join(target, entry.target), 'utf8')).toBe(
        await readFile(path.resolve(entry.source), 'utf8')
      );
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('removes only retired files previously owned by the manifest', async () => {
    const target = await temporaryWebsite();
    await syncWebsiteDocs(target, 'first');
    const retired = 'src/content/docs/retired-flow.mdx';
    const unrelated = 'src/content/docs/website-only.mdx';
    await writeFile(path.join(target, retired), 'retired');
    await writeFile(path.join(target, unrelated), 'website only');
    const manifestPath = path.join(target, 'src/content/docs/.widget-docs-source.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.files.push({
      source: 'docs/website/retired-flow.mdx',
      target: retired,
      sha256: '0'.repeat(64),
    });
    await writeFile(manifestPath, JSON.stringify(manifest));

    await syncWebsiteDocs(target, 'second');

    await expect(readFile(path.join(target, retired), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(path.join(target, unrelated), 'utf8')).resolves.toBe('website only');
  });

  it('rejects a target that is not the website repository', async () => {
    const target = await temporaryWebsite('another-project');
    await expect(syncWebsiteDocs(target, 'source-revision')).rejects.toThrow('bugdrop-web');
  });
});
