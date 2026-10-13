import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('ranked match bootstrap Edge Function boundary', () => {
  it('derives the actor from verified authentication and accepts only a game ID', () => {
    expect(source).toContain('authClient.auth.getUser(token)');
    expect(source).toContain('actorId: user.id');
    expect(source).toContain('const gameId = body?.gameId');
    expect(source).not.toMatch(/body\?\.(canonical|piece|projection|answer)/i);
  });

  it('keeps service credentials server-side and returns safe errors', () => {
    expect(source).toContain("requiredSecret('SUPABASE_SERVICE_ROLE_KEY')");
    expect(source).toContain("'Cache-Control': 'no-store'");
    expect(source).toContain("console.error('ranked-match-bootstrap-v2 failed', { code, name: errorName })");
  });
});
