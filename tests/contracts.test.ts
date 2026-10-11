import { describe, it, expect } from 'vitest';
import { registerSchema, matchCommandSchema } from '../packages/shared/src/contracts';
describe('untrusted contracts', () => {
  it('normalizes identity and rejects weak passwords', () => {
    expect(
      registerSchema.parse({
        email: 'Player@EXAMPLE.COM',
        username: 'Player_1',
        password: 'A long test passphrase',
      }).username,
    ).toBe('player_1');
    expect(
      registerSchema.safeParse({ email: 'x@y.com', username: 'player', password: 'short' }).success,
    ).toBe(false);
  });
  it('rejects injected fields and malformed action envelopes', () => {
    expect(
      registerSchema.safeParse({
        email: 'x@y.com',
        username: 'player',
        password: 'A long test passphrase',
        admin: true,
      }).success,
    ).toBe(false);
    expect(
      matchCommandSchema.safeParse({
        matchId: 'bad',
        actionId: 'bad',
        expectedVersion: -1,
        payload: {},
      }).success,
    ).toBe(false);
  });
});
