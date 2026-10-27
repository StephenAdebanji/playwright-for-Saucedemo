import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { z } from 'zod';
import { AuthTokenSchema, CartSchema, ErrorSchema, paginated, ProductSchema, UserSchema } from './schemas';

type Query = Record<string, string | number>;

/**
 * Thin, typed client. Every response is validated against its contract schema
 * at the boundary, so tests work with trusted, typed data — and a contract break
 * fails with a precise zod path (e.g. `products[12].price: expected number`).
 */
export class DummyJsonClient {
  constructor(private readonly request: APIRequestContext) {}

  async parse<T extends z.ZodType>(
    response: APIResponse,
    schema: T,
    expectedStatus = 200,
  ): Promise<z.infer<T>> {
    expect(response.status(), `${response.url()} → unexpected status`).toBe(expectedStatus);
    expect(response.headers()['content-type']).toContain('application/json');
    const result = schema.safeParse(await response.json());
    if (!result.success) {
      throw new Error(
        `Contract violation for ${response.url()}:\n${result.error.issues
          .slice(0, 20)
          .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      );
    }
    return result.data;
  }

  async listProducts(query: Query = {}) {
    return this.parse(
      await this.request.get('/products', { params: query }),
      paginated('products', ProductSchema),
    );
  }

  async searchProducts(q: string, query: Query = {}) {
    return this.parse(
      await this.request.get('/products/search', { params: { q, ...query } }),
      paginated('products', ProductSchema),
    );
  }

  async getProduct(id: number) {
    return this.parse(await this.request.get(`/products/${id}`), ProductSchema);
  }

  async getProductRaw(id: number | string) {
    return this.request.get(`/products/${id}`);
  }

  async listCarts(query: Query = {}) {
    return this.parse(await this.request.get('/carts', { params: query }), paginated('carts', CartSchema));
  }

  async listUsers(query: Query = {}) {
    return this.parse(await this.request.get('/users', { params: query }), paginated('users', UserSchema));
  }

  async login(username: string, password: string) {
    return this.parse(
      await this.request.post('/auth/login', { data: { username, password, expiresInMins: 5 } }),
      AuthTokenSchema,
    );
  }

  async loginExpectingError(username: string, password: string, status: number) {
    return this.parse(
      await this.request.post('/auth/login', { data: { username, password } }),
      ErrorSchema,
      status,
    );
  }

  async me(accessToken: string) {
    return this.parse(
      await this.request.get('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } }),
      UserSchema,
    );
  }
}
