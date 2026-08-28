import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('installation retention configuration', () => {
  it('binds isolated storage, the first-party route, and daily cleanup triggers', () => {
    const config = readFileSync('wrangler.toml', 'utf8');

    expect(config.match(/binding = "INSTALLATION_ANALYTICS"/g)).toHaveLength(3);
    expect(config.match(/crons = \["17 3 \* \* \*"\]/g)).toHaveLength(2);
    expect(config.match(/bugdrop\.dev\/api\/github\/webhook\*/g)).toHaveLength(2);
    expect(config.indexOf('routes = [')).toBeLessThan(config.indexOf('[triggers]'));
    expect(config).toContain('id = "a567f723a2eb4cfab807b0c1d678dc76"');
    expect(config).toContain('id = "c58b33f6a0dc416b8661661ce0d23f7f"');
  });
});
