import { expect, test } from '../../src/fixtures/api';
import { expectKnownDefect } from '../../src/data/known-defects';

test.describe('Auth API', { tag: ['@api', '@security'] }, () => {
  test('login issues a token that identifies the same user @smoke', async ({ api }) => {
    const session = await api.login('emilys', 'emilyspass');
    const me = await api.me(session.accessToken);
    expect(me).toMatchObject({ id: session.id, username: 'emilys', email: session.email });
  });

  test('token payload carries no secrets', async ({ api }) => {
    const { accessToken } = await api.login('emilys', 'emilyspass');
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString());
    expect(payload).not.toHaveProperty('password');
    expect(payload.exp, 'token must expire').toBeGreaterThan(payload.iat);
  });

  const invalid = [
    { name: 'wrong password', username: 'emilys', password: 'not-the-password' },
    { name: 'unknown user', username: 'no_such_user_123', password: 'emilyspass' },
  ];
  for (const c of invalid) {
    test(`rejects ${c.name} without leaking which field was wrong`, async ({ api }) => {
      const err = await api.loginExpectingError(c.username, c.password, 400);
      expect(err.message).toBe('Invalid credentials');
    });
  }

  test('protected endpoint rejects a tampered token with 401, not a server error', async ({
    api,
    request,
  }) => {
    expectKnownDefect('SEC-01');
    const { accessToken } = await api.login('emilys', 'emilyspass');
    const tampered = accessToken.slice(0, -4) + 'AAAA';
    const res = await request.get('/auth/me', { headers: { Authorization: `Bearer ${tampered}` } });
    expect(res.status()).toBe(401);
  });

  test('protected endpoint rejects a missing token', async ({ request }) => {
    const res = await request.get('/auth/me');
    expect(res.status()).toBe(401);
  });
});
