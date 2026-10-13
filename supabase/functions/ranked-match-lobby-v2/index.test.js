import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('ranked match lobby Edge Function boundary', () => {
  it('derives the actor from verified authentication', () => {
    expect(source).toContain('authClient.auth.getUser(token)');
    expect(source).toContain('actorId: user.id');
    expect(source).not.toMatch(/actorId:\s*body/);
  });

  it('keeps service credentials and errors private', () => {
    expect(source).toContain("secret('SUPABASE_SERVICE_ROLE_KEY')");
    expect(source).toContain("'Cache-Control': 'no-store'");
    expect(source).toContain("console.error('ranked-match-lobby-v2 failed'");
  });
});
