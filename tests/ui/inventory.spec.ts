import { expect, test } from '../../src/fixtures/test';
import { CATALOG } from '../../src/data/catalog';
import type { RenderedProduct, SortOption } from '../../src/pages/InventoryPage';

test.describe('Inventory — data validation', { tag: '@inventory' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('rendered catalog matches the golden dataset @smoke', async ({ inventoryPage }) => {
    const rendered = await inventoryPage.readProducts();
    const actual = rendered
      .map(({ name, price }) => ({ name, price }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const expected = CATALOG.map(({ name, price }) => ({ name, price })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    expect(actual).toEqual(expected);
  });

  test('every product has a unique, real image and a description', async ({ inventoryPage }) => {
    const rendered = await inventoryPage.readProducts();
    const images = rendered.map((p) => p.imageSrc);
    expect(new Set(images).size, 'images should be unique per product').toBe(images.length);
    for (const p of rendered) {
      expect.soft(p.imageSrc, `${p.name} image`).not.toMatch(/404/);
      expect.soft(p.description.length, `${p.name} description`).toBeGreaterThan(20);
    }
  });

  // Expected order is *computed* from the scraped data, not hard-coded,
  // so the test stays correct if the catalog changes.
  // `key` is the field the order is defined on; ties in other fields have no specified order.
  const sorts: {
    option: SortOption;
    key: 'name' | 'price';
    compare: (a: RenderedProduct, b: RenderedProduct) => number;
  }[] = [
    { option: 'az', key: 'name', compare: (a, b) => a.name.localeCompare(b.name) },
    { option: 'za', key: 'name', compare: (a, b) => b.name.localeCompare(a.name) },
    { option: 'lohi', key: 'price', compare: (a, b) => a.price - b.price },
    { option: 'hilo', key: 'price', compare: (a, b) => b.price - a.price },
  ];

  for (const { option, key, compare } of sorts) {
    test(`sort "${option}" orders products by ${key}`, async ({ inventoryPage }) => {
      const before = await inventoryPage.readProducts();
      await inventoryPage.sortBy(option);
      const after = await inventoryPage.readProducts();

      expect(after.map((p) => p[key])).toEqual([...before].sort(compare).map((p) => p[key]));
      // Sorting must not change the dataset itself.
      expect(new Set(after.map((p) => p.name))).toEqual(new Set(before.map((p) => p.name)));
    });
  }
});

test.describe('Cart state', { tag: '@cart' }, () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.goto();
  });

  test('add and remove items keeps badge and buttons in sync @smoke', async ({ inventoryPage }) => {
    const { header } = inventoryPage;
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.addToCart('Sauce Labs Bike Light');
    await header.expectCartCount(2);
    await expect(inventoryPage.cartButton('Sauce Labs Backpack')).toHaveText('Remove');
    await expect(inventoryPage.cartButton('Sauce Labs Onesie')).toHaveText('Add to cart');

    await inventoryPage.removeFromCart('Sauce Labs Backpack');
    await header.expectCartCount(1);
    await inventoryPage.removeFromCart('Sauce Labs Bike Light');
    await header.expectCartCount(0);
  });

  test('cart survives a page reload', async ({ page, inventoryPage, cartPage }) => {
    await inventoryPage.addToCart('Sauce Labs Onesie');
    await page.reload();
    await inventoryPage.header.expectCartCount(1);
    await cartPage.goto();
    await cartPage.expectItems(['Sauce Labs Onesie']);
  });

  test('product detail page agrees with the grid', async ({ page, inventoryPage }) => {
    const [first] = await inventoryPage.readProducts();
    await page.getByTestId('inventory-item-name').getByText(first!.name, { exact: true }).click();
    await expect(page).toHaveURL(/inventory-item\.html\?id=\d+/);
    // SPA route change: the URL updates before the grid unmounts, so wait for the
    // detail view to be the *only* item card before asserting on it.
    await expect(page.getByTestId('back-to-products')).toBeVisible();
    const details = page.getByTestId('inventory-item');
    await expect(details).toHaveCount(1);
    await expect(details.getByTestId('inventory-item-name')).toHaveText(first!.name);
    await expect(details.getByTestId('inventory-item-price')).toHaveText(`$${first!.price}`);
    await expect(details.getByTestId('inventory-item-desc')).toHaveText(first!.description);
  });

  test('page stays usable when product images fail to load', async ({ page, inventoryPage }) => {
    await page.route(/\.(jpg|png|webp)$/, (route) => route.abort());
    await page.reload();
    await inventoryPage.addToCart('Sauce Labs Fleece Jacket');
    await inventoryPage.header.expectCartCount(1);
  });
});
