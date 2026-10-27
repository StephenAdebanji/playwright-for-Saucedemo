import { test as base, expect, request } from '@playwright/test';
import { env } from '../config/env';
import { DummyJsonClient } from '../api/DummyJsonClient';
import type { Cart, Product, User } from '../api/schemas';

export interface Dataset {
  products: Product[];
  carts: Cart[];
  users: User[];
}

type TestFixtures = { api: DummyJsonClient };
type WorkerFixtures = { dataset: Dataset };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  api: async ({ request }, use) => use(new DummyJsonClient(request)),

  /**
   * Full snapshot of the API's data, fetched once per worker (not per test).
   * Data-integrity suites validate hundreds of records with ~3 requests, which
   * keeps us well inside DummyJSON's 100 req/window rate limit.
   */
  dataset: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const ctx = await request.newContext({ baseURL: env.apiBaseUrl });
      const client = new DummyJsonClient(ctx);
      const [products, carts, users] = await Promise.all([
        client.listProducts({ limit: 0 }),
        client.listCarts({ limit: 0 }),
        client.listUsers({ limit: 0 }),
      ]);
      // Guard: a silently truncated snapshot would make every rule below vacuously pass.
      expect(products.products).toHaveLength(products.total);
      expect(carts.carts).toHaveLength(carts.total);
      expect(users.users).toHaveLength(users.total);
      await use({ products: products.products, carts: carts.carts, users: users.users });
      await ctx.dispose();
    },
    { scope: 'worker' },
  ],
});

export { expect };
