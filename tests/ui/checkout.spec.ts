import { expect, test } from '../../src/fixtures/test';
import { CATALOG, catalogItem, TAX_RATE } from '../../src/data/catalog';
import { expectKnownDefect } from '../../src/data/known-defects';
import { roundCents, sum } from '../../src/utils/money';

const baskets = [
  { name: 'single item', items: ['Sauce Labs Onesie'] },
  { name: 'two items', items: ['Sauce Labs Backpack', 'Sauce Labs Bolt T-Shirt'] },
  { name: 'full catalog', items: CATALOG.map((i) => i.name) },
];

test.describe('Checkout', { tag: '@checkout' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  for (const basket of baskets) {
    test(`order totals are correct — ${basket.name} @smoke`, async ({
      inventoryPage,
      cartPage,
      checkoutPage,
      customer,
    }) => {
      for (const item of basket.items) await inventoryPage.addToCart(item);
      await inventoryPage.header.openCart();
      await cartPage.expectItems(basket.items);
      await cartPage.checkout();
      await checkoutPage.fillInformation(customer);

      const summary = await checkoutPage.readSummary();
      const expectedSubtotal = sum(basket.items.map((n) => catalogItem(n).price));
      const expectedTax = roundCents(expectedSubtotal * TAX_RATE);

      expect
        .soft(summary.itemPrices, 'line prices match catalog')
        .toEqual(basket.items.map((n) => catalogItem(n).price));
      expect.soft(roundCents(summary.subtotal), 'subtotal').toBe(expectedSubtotal);
      expect.soft(summary.tax, 'tax at 8%').toBe(expectedTax);
      expect.soft(summary.total, 'total = subtotal + tax').toBe(roundCents(expectedSubtotal + expectedTax));

      await checkoutPage.finish();
      await checkoutPage.expectOrderComplete();
      await inventoryPage.header.expectCartCount(0);
    });
  }

  test('order summary shows money with exactly two decimals', async ({
    page,
    inventoryPage,
    cartPage,
    checkoutPage,
    customer,
  }) => {
    expectKnownDefect('SD-01');
    // This basket sums to 113.94999… in IEEE-754 and is rendered unrounded.
    for (const item of [
      'Sauce Labs Onesie',
      'Sauce Labs Fleece Jacket',
      'Sauce Labs Bolt T-Shirt',
      'Sauce Labs Bike Light',
      'Sauce Labs Backpack',
    ]) {
      await inventoryPage.addToCart(item);
    }
    await inventoryPage.header.openCart();
    await cartPage.checkout();
    await checkoutPage.fillInformation(customer);
    for (const id of ['subtotal-label', 'tax-label', 'total-label']) {
      await expect(page.getByTestId(id)).toHaveText(/\$\d+\.\d{2}$/);
    }
  });

  const missing = [
    { field: 'firstName', error: 'First Name is required' },
    { field: 'lastName', error: 'Last Name is required' },
    { field: 'postalCode', error: 'Postal Code is required' },
  ] as const;

  for (const m of missing) {
    test(`requires ${m.field}`, async ({ inventoryPage, cartPage, checkoutPage, customer }) => {
      await inventoryPage.addToCart('Sauce Labs Onesie');
      await inventoryPage.header.openCart();
      await cartPage.checkout();
      await checkoutPage.fillInformation({ ...customer, [m.field]: '' });
      await expect(checkoutPage.error).toHaveText(`Error: ${m.error}`);
    });
  }

  test('cancel from overview returns to inventory with the cart intact', async ({
    page,
    inventoryPage,
    cartPage,
    checkoutPage,
    customer,
  }) => {
    await inventoryPage.addToCart('Sauce Labs Bike Light');
    await inventoryPage.header.openCart();
    await cartPage.checkout();
    await checkoutPage.fillInformation(customer);
    await page.getByTestId('cancel').click();
    await inventoryPage.expectLoaded();
    await inventoryPage.header.expectCartCount(1);
  });
});
