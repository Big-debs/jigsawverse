import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('ranked command Edge Function boundary', () => {
  it('derives actor identity from a verified bearer token', () => {
    expect(source).toContain('authClient.auth.getUser(token)');
    expect(source).toContain('actorId: user.id');
    expect(source).not.toMatch(/actorId:\s*(body|command)/);
  });

  it('keeps service credentials server-side and returns no-store JSON', () => {
    expect(source).toContain("requiredSecret('SUPABASE_SERVICE_ROLE_KEY')");
    expect(source).toContain("'Cache-Control': 'no-store'");
    expect(source).not.toContain('serviceRoleKey, command');
  });
});

