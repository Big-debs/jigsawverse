import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./provision-ranked-puzzle.mjs', import.meta.url), 'utf8');

describe('ranked asset provisioning operator entry point', () => {
  it('requires service credentials and explicit puzzle inputs', () => {
    expect(source).toContain("requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY')");
    expect(source).toContain("requiredArgument('game-id')");
    expect(source).toContain("requiredArgument('image-file')");
    expect(source).toContain("positiveIntegerArgument('rows')");
    expect(source).toContain("positiveIntegerArgument('cols')");
  });

  it('prints only the safe aggregate provisioner result', () => {
    expect(source).toContain('JSON.stringify(result)');
    expect(source).not.toContain('pieceCatalog');
    expect(source).not.toContain('assetManifest');
  });
});
