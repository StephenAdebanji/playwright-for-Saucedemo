import { expect, LOGGED_OUT, test } from '../../src/fixtures/test';
import { env } from '../../src/config/env';
import { Personas } from '../../src/data/users';

test.use(LOGGED_OUT);

test.describe('Login', { tag: '@auth' }, () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('standard user can log in and reach the inventory @smoke', async ({ loginPage, inventoryPage }) => {
    await loginPage.login(Personas.standard, env.saucePassword);
    await inventoryPage.expectLoaded();
  });

  const rejected = [
    {
      name: 'locked-out user',
      user: Personas.lockedOut,
      pass: env.saucePassword,
      error: 'Sorry, this user has been locked out.',
    },
    {
      name: 'wrong password',
      user: Personas.standard,
      pass: 'wrong',
      error: 'Username and password do not match any user in this service',
    },
    {
      name: 'unknown user',
      user: 'nobody',
      pass: env.saucePassword,
      error: 'Username and password do not match any user in this service',
    },
    { name: 'empty username', user: '', pass: env.saucePassword, error: 'Username is required' },
    { name: 'empty password', user: Personas.standard, pass: '', error: 'Password is required' },
    {
      name: 'case-sensitive username',
      user: 'STANDARD_USER',
      pass: env.saucePassword,
      error: 'Username and password do not match any user in this service',
    },
  ];

  for (const c of rejected) {
    test(`rejects ${c.name}`, async ({ page, loginPage }) => {
      await loginPage.login(c.user, c.pass);
      await expect(loginPage.error).toHaveText(`Epic sadface: ${c.error}`);
      await expect(page).toHaveURL(env.uiBaseUrl + '/');
      // Both fields are flagged as invalid, not just the error banner.
      await expect(loginPage.username).toHaveClass(/error/);
      await expect(loginPage.password).toHaveClass(/error/);
    });
  }

  test('error banner can be dismissed', async ({ loginPage }) => {
    await loginPage.login('', '');
    await loginPage.error.getByRole('button').click();
    await expect(loginPage.error).toBeHidden();
  });

  test('password field masks input', async ({ loginPage }) => {
    await expect(loginPage.password).toHaveAttribute('type', 'password');
  });
});

test.describe('Access control', { tag: '@auth' }, () => {
  for (const path of [
    '/inventory.html',
    '/cart.html',
    '/checkout-step-one.html',
    '/inventory-item.html?id=4',
  ]) {
    test(`deep link to ${path} without a session is blocked`, async ({ page, loginPage }) => {
      await page.goto(path);
      await expect(loginPage.submit).toBeVisible();
      await expect(loginPage.error).toContainText(
        `You can only access '${path.split('?')[0]}' when you are logged in.`,
      );
    });
  }

  test('logout ends the session; back button does not restore it', async ({
    page,
    loginAs,
    inventoryPage,
    loginPage,
  }) => {
    await loginAs(Personas.standard);
    await inventoryPage.header.logout();
    await expect(loginPage.submit).toBeVisible();

    await page.goBack();
    await expect(loginPage.error).toContainText('when you are logged in');
  });
});
