import { expect, test } from '../../src/fixtures/api';
import { expectKnownDefect } from '../../src/data/known-defects';
import { roundCents } from '../../src/utils/money';

/**
 * Data validation over the *entire* dataset, not samples.
 * Each rule is a business invariant; failures list every offending record so the
 * report doubles as a data-quality audit.
 */

const CENT = 0.011; // tolerance for values the API rounds to 2dp

test.describe('Carts — financial integrity', { tag: ['@api', '@data'] }, () => {
  test('line total = price × quantity', async ({ dataset }) => {
    const violations = dataset.carts.flatMap((c) =>
      c.products
        .filter((l) => Math.abs(l.price * l.quantity - l.total) > CENT)
        .map((l) => `cart ${c.id} / product ${l.id}: ${l.price}×${l.quantity} ≠ ${l.total}`),
    );
    expect(violations).toEqual([]);
  });

  test('discountedTotal = total × (1 − discount%)', async ({ dataset }) => {
    const violations = dataset.carts.flatMap((c) =>
      c.products
        .filter((l) => Math.abs(l.total * (1 - l.discountPercentage / 100) - l.discountedTotal) > CENT)
        .map(
          (l) =>
            `cart ${c.id} / product ${l.id}: expected ${roundCents(l.total * (1 - l.discountPercentage / 100))}, got ${l.discountedTotal}`,
        ),
    );
    expect(violations).toEqual([]);
  });

  test('cart header totals reconcile with line items', async ({ dataset }) => {
    for (const c of dataset.carts) {
      const sum = (f: (l: (typeof c.products)[number]) => number) => c.products.reduce((a, l) => a + f(l), 0);
      expect.soft(Math.abs(sum((l) => l.total) - c.total), `cart ${c.id} total`).toBeLessThanOrEqual(CENT);
      expect
        .soft(Math.abs(sum((l) => l.discountedTotal) - c.discountedTotal), `cart ${c.id} discountedTotal`)
        .toBeLessThanOrEqual(CENT);
      expect.soft(c.totalProducts, `cart ${c.id} totalProducts`).toBe(c.products.length);
      expect.soft(c.totalQuantity, `cart ${c.id} totalQuantity`).toBe(sum((l) => l.quantity));
      expect.soft(c.discountedTotal, `cart ${c.id} discount increases price`).toBeLessThanOrEqual(c.total);
    }
  });
});

test.describe('Referential integrity across resources', { tag: ['@api', '@data'] }, () => {
  test('every cart belongs to an existing user', async ({ dataset }) => {
    const userIds = new Set(dataset.users.map((u) => u.id));
    const orphans = dataset.carts
      .filter((c) => !userIds.has(c.userId))
      .map((c) => `cart ${c.id} → user ${c.userId}`);
    expect(orphans).toEqual([]);
  });

  test('cart lines reference real products at the catalog price', async ({ dataset }) => {
    const catalog = new Map(dataset.products.map((p) => [p.id, p]));
    const issues = dataset.carts.flatMap((c) =>
      c.products.flatMap((l) => {
        const p = catalog.get(l.id);
        if (!p) return [`cart ${c.id}: unknown product ${l.id}`];
        if (p.price !== l.price)
          return [`cart ${c.id}: product ${l.id} priced ${l.price}, catalog ${p.price}`];
        if (p.title !== l.title)
          return [`cart ${c.id}: product ${l.id} titled "${l.title}", catalog "${p.title}"`];
        return [];
      }),
    );
    expect(issues).toEqual([]);
  });
});

test.describe('Products — data quality rules', { tag: ['@api', '@data'] }, () => {
  test('ids and SKUs are unique', async ({ dataset }) => {
    const dupes = (values: unknown[]) => values.filter((v, i) => values.indexOf(v) !== i);
    expect(dupes(dataset.products.map((p) => p.id))).toEqual([]);
    expect(dupes(dataset.products.map((p) => p.sku))).toEqual([]);
  });

  test('audit timestamps are ordered (createdAt ≤ updatedAt)', async ({ dataset }) => {
    const bad = dataset.products
      .filter((p) => new Date(p.meta.createdAt) > new Date(p.meta.updatedAt))
      .map((p) => p.id);
    expect(bad).toEqual([]);
  });

  test('"Out of Stock" ⇔ stock is 0', async ({ dataset }) => {
    const bad = dataset.products
      .filter((p) => (p.stock === 0) !== (p.availabilityStatus === 'Out of Stock'))
      .map((p) => `${p.id}: stock=${p.stock}, status=${p.availabilityStatus}`);
    expect(bad).toEqual([]);
  });

  test('availabilityStatus is a deterministic function of stock', async ({ dataset }) => {
    expectKnownDefect('DQ-01');
    const statusByStock = new Map<number, Set<string>>();
    for (const p of dataset.products) {
      statusByStock.set(p.stock, (statusByStock.get(p.stock) ?? new Set()).add(p.availabilityStatus));
    }
    const ambiguous = [...statusByStock]
      .filter(([, s]) => s.size > 1)
      .map(([stock, s]) => `stock=${stock}: ${[...s].join(' / ')}`);
    expect(ambiguous).toEqual([]);
  });

  test('"In Stock" products can satisfy their own minimum order quantity', async ({ dataset }) => {
    expectKnownDefect('DQ-02');
    const unpurchasable = dataset.products
      .filter((p) => p.availabilityStatus === 'In Stock' && p.minimumOrderQuantity > p.stock)
      .map((p) => `${p.id} "${p.title}": MOQ ${p.minimumOrderQuantity} > stock ${p.stock}`);
    expect(unpurchasable).toEqual([]);
  });
});

test.describe('Users — data quality rules', { tag: ['@api', '@data'] }, () => {
  test('ids, usernames and emails are unique (case-insensitive)', async ({ dataset }) => {
    for (const key of ['id', 'username', 'email'] as const) {
      const values = dataset.users.map((u) => String(u[key]).toLowerCase());
      expect.soft(new Set(values).size, `duplicate ${key}`).toBe(values.length);
    }
  });

  test('all users are adults with a valid birth date', async ({ dataset }) => {
    const bad = dataset.users
      .filter((u) => u.age < 18 || Number.isNaN(Date.parse(u.birthDate)))
      .map((u) => `${u.id}: age=${u.age}, birthDate=${u.birthDate}`);
    expect(bad).toEqual([]);
  });
});
