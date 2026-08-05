import { describe, expect, it } from 'vitest';

import {
  MAX_HEALTH_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_RETAINED_BYTES,
  MAX_RETAINED_RESPONSE_MULTIPLIER,
  MAX_SNAPSHOT_BYTES,
  MAX_WIDGET_BYTES,
} from '../../scripts/release/limits.mjs';

describe('shared release byte limits', () => {
  it('reserves room for every mandatory current response at the retained boundary', () => {
    expect(
      MAX_RETAINED_RESPONSE_MULTIPLIER * MAX_RETAINED_BYTES +
        MAX_HEALTH_BYTES +
        MAX_MANIFEST_BYTES +
        4 * MAX_WIDGET_BYTES
    ).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
  });
});
