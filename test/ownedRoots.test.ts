// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { isBugDropOwnedNode, withBugDropOwnedRootsHidden } from '../src/widget/owned-roots';

describe('BugDrop-owned roots', () => {
  beforeEach(() => document.body.replaceChildren());

  it('recognizes legacy, variant, and open-shadow descendants without claiming host content', () => {
    const legacy = document.createElement('div');
    legacy.id = 'bugdrop-host';
    const variant = document.createElement('div');
    variant.dataset.bugdropOwned = '';
    const shadowChild = document.createElement('button');
    variant.attachShadow({ mode: 'open' }).appendChild(shadowChild);
    const hostContent = document.createElement('button');
    document.body.append(legacy, variant, hostContent);

    expect(isBugDropOwnedNode(legacy)).toBe(true);
    expect(isBugDropOwnedNode(variant)).toBe(true);
    expect(isBugDropOwnedNode(shadowChild)).toBe(true);
    expect(isBugDropOwnedNode(hostContent)).toBe(false);
  });

  it('restores exact visibility styles after successful and failed viewport work', async () => {
    const first = document.createElement('div');
    first.id = 'bugdrop-host';
    first.style.setProperty('visibility', 'visible', 'important');
    const second = document.createElement('div');
    second.dataset.bugdropOwned = '';
    document.body.append(first, second);

    await expect(
      withBugDropOwnedRootsHidden(async () => {
        expect(getComputedStyle(first).visibility).toBe('hidden');
        expect(getComputedStyle(second).visibility).toBe('hidden');
        throw new Error('capture failed');
      })
    ).rejects.toThrow('capture failed');
    expect(first.style.getPropertyValue('visibility')).toBe('visible');
    expect(first.style.getPropertyPriority('visibility')).toBe('important');
    expect(second.style.getPropertyValue('visibility')).toBe('');
  });
});
