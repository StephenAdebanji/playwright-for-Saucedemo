import { expect, test } from '../../src/fixtures/api';
import { ErrorSchema } from '../../src/api/schemas';

test.describe('Products API — contract', { tag: ['@api', '@contract'] }, () => {
  test('single product conforms to schema @smoke', async ({ api }) => {
    const product = await api.getProduct(1);
    expect(product.id).toBe(1);
  });

  test('unknown product returns 404 with an error body', async ({ api }) => {
    const res = await api.getProductRaw(999_999);
    const body = await api.parse(res, ErrorSchema, 404);
    expect(body.message).toContain('999999');
  });

  test('non-numeric id is rejected, not coerced', async ({ api }) => {
    const res = await api.getProductRaw('abc');
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('`select` returns only the requested fields', async ({ request }) => {
    const res = await request.get('/products', { params: { limit: 5, select: 'title,price' } });
    expect(res.ok()).toBeTruthy();
    const { products } = await res.json();
    for (const p of products) {
      expect(Object.keys(p).sort()).toEqual(['id', 'price', 'title']);
    }
  });

  test('response time is within budget', async ({ request }) => {
    const started = performance.now();
    const res = await request.get('/products', { params: { limit: 30 } });
    const elapsed = performance.now() - started;
    expect(res.ok()).toBeTruthy();
    expect(elapsed, `GET /products took ${elapsed.toFixed(0)}ms`).toBeLessThan(3_000);
  });
});

test.describe('Products API — pagination invariants', { tag: ['@api'] }, () => {
  test('pages are disjoint, ordered, and their union equals the full set', async ({ api }) => {
    const pageSize = 50;
    const first = await api.listProducts({ limit: pageSize, skip: 0 });
    const pages = Math.ceil(first.total / pageSize);

    const ids: number[] = [];
    for (let i = 0; i < pages; i++) {
      const page = await api.listProducts({ limit: pageSize, skip: i * pageSize });
      expect(page.skip).toBe(i * pageSize);
      expect(page.total).toBe(first.total); // total must be stable across pages
      expect(page.products).toHaveLength(Math.min(pageSize, first.total - i * pageSize));
      ids.push(...page.products.map((p) => p.id));
    }

    expect(new Set(ids).size, 'duplicate ids across pages').toBe(ids.length);
    expect(ids).toHaveLength(first.total);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  test('skip beyond total returns an empty page, not an error', async ({ api }) => {
    const { total } = await api.listProducts({ limit: 1 });
    const page = await api.listProducts({ limit: 10, skip: total + 10 });
    expect(page.products).toEqual([]);
  });
});

test.describe('Products API — query semantics', { tag: ['@api'] }, () => {
  for (const order of ['asc', 'desc'] as const) {
    test(`sortBy=price&order=${order} is correctly ordered`, async ({ api }) => {
      const { products } = await api.listProducts({ sortBy: 'price', order, limit: 0 });
      const prices = products.map((p) => p.price);
      const expected = [...prices].sort((a, b) => (order === 'asc' ? a - b : b - a));
      expect(prices).toEqual(expected);
    });
  }

  for (const term of ['phone', 'Laptop', 'mascara']) {
    test(`search "${term}" only returns relevant products`, async ({ api }) => {
      const { products, total } = await api.searchProducts(term, { limit: 0 });
      expect(total).toBeGreaterThan(0);
      for (const p of products) {
        const haystack = `${p.title} ${p.description}`.toLowerCase();
        expect.soft(haystack, `product ${p.id} "${p.title}"`).toContain(term.toLowerCase());
      }
    });
  }

  test('search with no match returns an empty, well-formed page', async ({ api }) => {
    const res = await api.searchProducts('zzzz-no-such-product-zzzz');
    expect(res).toMatchObject({ products: [], total: 0 });
  });
});
