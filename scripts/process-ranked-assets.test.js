import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./process-ranked-assets.mjs', import.meta.url), 'utf8');

describe('ranked asset queue operator entry point', () => {
  it('requires service credentials and bounds each drain run', () => {
    expect(source).toContain("requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY')");
    expect(source).toContain('maximum > 100');
    expect(source).toContain('processNextRankedAssetJob');
  });

  it('prints aggregate counts without protected job fields', () => {
    expect(source).toContain('JSON.stringify(summary)');
    expect(source).not.toContain('source_path');
    expect(source).not.toContain('pieceCatalog');
    expect(source).not.toContain('errorCode');
  });
});
