import { expect, LOGGED_OUT, test } from '../../src/fixtures/test';
import { env } from '../../src/config/env';
import { CATALOG, catalogItem } from '../../src/data/catalog';
import { expectKnownDefect, type DefectId } from '../../src/data/known-defects';
import { ACTIVE_PERSONAS, type Persona } from '../../src/data/users';

/**
 * One behavioural contract, run against every persona.
 *
 * Instead of a bespoke test per broken user, each persona must satisfy the same
 * checks a real customer relies on. Deviations are declared in the matrix below,
 * so the matrix *is* the defect map — and fixing a bug flips its cell to a failure
 * until the entry is removed.
 */
type Check = 'login-performance' | 'catalog' | 'images' | 'sorting' | 'cart' | 'checkout';

const DEVIATIONS: Partial<Record<Persona, Partial<Record<Check, DefectId>>>> = {
  problem_user: { images: 'SD-02', sorting: 'SD-03', cart: 'SD-04', checkout: 'SD-05' },
  error_user: { sorting: 'SD-03', cart: 'SD-04', checkout: 'SD-06' },
  performance_glitch_user: { 'login-performance': 'SD-07' },
  // visual_user re-randomises displayed prices on every render, so price sorting looks broken too.
  visual_user: { catalog: 'SD-08', images: 'SD-02', sorting: 'SD-08' },
};

const LOGIN_BUDGET_MS = 2_000;

test.use(LOGGED_OUT);

for (const persona of ACTIVE_PERSONAS) {
  test.describe(`Persona contract: ${persona}`, { tag: '@personas' }, () => {
    const declare = (check: Check) => {
      const defect = DEVIATIONS[persona]?.[check];
      if (defect) expectKnownDefect(defect);
    };

    test('logs in within the performance budget', async ({ loginPage, inventoryPage }) => {
      declare('login-performance');
      test.setTimeout(30_000);
      await loginPage.goto();
      const started = Date.now();
      await loginPage.login(persona, env.saucePassword);
      await inventoryPage.expectLoaded();
      expect(Date.now() - started).toBeLessThan(LOGIN_BUDGET_MS);
    });

    test.describe('when logged in', () => {
      test.beforeEach(async ({ loginAs }) => {
        test.slow(persona === 'performance_glitch_user');
        await loginAs(persona);
      });

      test('shows catalog prices', async ({ inventoryPage }) => {
        declare('catalog');
        const rendered = await inventoryPage.readProducts();
        for (const p of rendered) expect.soft(p.price, p.name).toBe(catalogItem(p.name).price);
      });

      test('shows a distinct, real image per product', async ({ inventoryPage }) => {
        declare('images');
        const images = (await inventoryPage.readProducts()).map((p) => p.imageSrc);
        expect(images.filter((src) => /404/.test(src))).toEqual([]);
        expect(new Set(images).size).toBe(images.length);
      });

      test('sorts by price high → low', async ({ inventoryPage }) => {
        declare('sorting');
        await inventoryPage.sortBy('hilo');
        const prices = (await inventoryPage.readProducts()).map((p) => p.price);
        expect(prices).toEqual([...prices].sort((a, b) => b - a));
        expect(prices[0]).toBe(Math.max(...CATALOG.map((i) => i.price)));
      });

      test('can fill and empty the cart', async ({ inventoryPage }) => {
        declare('cart');
        for (const { name } of CATALOG) await inventoryPage.addToCart(name);
        await inventoryPage.header.expectCartCount(CATALOG.length);
        for (const { name } of CATALOG) await inventoryPage.removeFromCart(name);
        await inventoryPage.header.expectCartCount(0);
      });

      test('can complete a purchase', async ({ page, inventoryPage, cartPage, checkoutPage, customer }) => {
        declare('checkout');
        await inventoryPage.addToCart('Sauce Labs Backpack');
        await inventoryPage.header.openCart();
        await cartPage.checkout();
        await checkoutPage.fillInformation(customer);
        // Assert the step transition explicitly: a broken form must fail fast, not time out on "Finish".
        await expect(page).toHaveURL(/checkout-step-two\.html/);
        await checkoutPage.finish();
        await checkoutPage.expectOrderComplete();
      });
    });
  });
}
