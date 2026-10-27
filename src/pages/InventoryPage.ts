import { expect, type Locator, type Page } from '@playwright/test';
import { parseMoney } from '../utils/money';
import { Header } from './components/Header';

export type SortOption = 'az' | 'za' | 'lohi' | 'hilo';

export interface RenderedProduct {
  name: string;
  price: number;
  description: string;
  imageSrc: string;
}

export class InventoryPage {
  readonly header: Header;
  readonly title: Locator;
  readonly items: Locator;
  readonly sortSelect: Locator;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
    this.title = page.getByTestId('title');
    this.items = page.getByTestId('inventory-item');
    this.sortSelect = page.getByTestId('product-sort-container');
  }

  async goto() {
    await this.page.goto('/inventory.html');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/inventory\.html/);
    await expect(this.title).toHaveText('Products');
  }

  item(name: string): Locator {
    return this.items.filter({
      has: this.page.getByTestId('inventory-item-name').getByText(name, { exact: true }),
    });
  }

  /** The Add/Remove toggle (image and title are also role=button links). */
  cartButton(name: string): Locator {
    return this.item(name).getByRole('button', { name: /^(Add to cart|Remove)$/ });
  }

  async addToCart(name: string) {
    await this.item(name).getByRole('button', { name: 'Add to cart' }).click();
  }

  async removeFromCart(name: string) {
    await this.item(name).getByRole('button', { name: 'Remove' }).click();
  }

  async sortBy(option: SortOption) {
    await this.sortSelect.selectOption(option);
  }

  /** Scrape the grid into plain data so tests can validate it as a dataset. */
  async readProducts(): Promise<RenderedProduct[]> {
    await expect(this.items.first()).toBeVisible();
    return this.items
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const text = (sel: string) => n.querySelector(`[data-test="${sel}"]`)?.textContent?.trim() ?? '';
          return {
            name: text('inventory-item-name'),
            priceText: text('inventory-item-price'),
            description: text('inventory-item-desc'),
            imageSrc: n.querySelector('img')?.getAttribute('src') ?? '',
          };
        }),
      )
      .then((rows) => rows.map(({ priceText, ...rest }) => ({ ...rest, price: parseMoney(priceText) })));
  }
}
