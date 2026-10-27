import { test as setup } from '../src/fixtures/test';
import { Personas } from '../src/data/users';

/**
 * Log in once and persist the session. UI projects reuse it via `storageState`,
 * so only tests *about* login pay the cost of going through the login form.
 */
setup('authenticate as standard_user', async ({ page, loginAs }) => {
  await loginAs(Personas.standard);
  await page.context().storageState({ path: '.auth/standard_user.json' });
});
