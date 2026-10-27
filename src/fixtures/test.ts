import { test as base, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { env } from '../config/env';
import type { Persona } from '../data/users';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage, type CustomerInfo } from '../pages/CheckoutPage';
import { InventoryPage } from '../pages/InventoryPage';
import { LoginPage } from '../pages/LoginPage';

type Fixtures = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  /** Log in through the UI as a given persona and land on the inventory. */
  loginAs: (persona: Persona) => Promise<void>;
  /** Unique, realistic customer data per test — no shared mutable fixtures. */
  customer: CustomerInfo;
  /** Auto fixture: blocks third-party telemetry so it can't slow or flake tests. */
  blockThirdParty: void;
};

export const test = base.extend<Fixtures>({
  blockThirdParty: [
    async ({ context }, use) => {
      await context.route(/backtrace\.io|google-analytics|googletagmanager/, (route) => route.abort());
      await use();
    },
    { auto: true },
  ],

  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  inventoryPage: async ({ page }, use) => use(new InventoryPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),

  loginAs: async ({ loginPage, inventoryPage }, use) => {
    await use(async (persona) => {
      await loginPage.goto();
      await loginPage.login(persona, env.saucePassword);
      await inventoryPage.expectLoaded();
    });
  },

  // eslint-disable-next-line no-empty-pattern
  customer: async ({}, use, testInfo) => {
    // Seed per test so a failing run is reproducible from the test ID alone.
    faker.seed(hash(testInfo.testId));
    await use({
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      postalCode: faker.location.zipCode(),
    });
  },
});

export { expect };

/** Opt a spec out of the shared logged-in storage state. */
export const LOGGED_OUT = { storageState: { cookies: [], origins: [] } };

function hash(input: string): number {
  let h = 0;
  for (const ch of input) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
