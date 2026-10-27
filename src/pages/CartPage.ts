import { expect, type Locator, type Page } from '@playwright/test';
import { Header } from './components/Header';

export class CartPage {
  readonly header: Header;
  readonly items: Locator;
  readonly checkoutButton: Locator;
  readonly continueShoppingButton: Locator;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
    this.items = page.getByTestId('inventory-item');
    this.checkoutButton = page.getByTestId('checkout');
    this.continueShoppingButton = page.getByTestId('continue-shopping');
  }

  async goto() {
    await this.page.goto('/cart.html');
    await expect(this.page.getByTestId('title')).toHaveText('Your Cart');
  }

  async expectItems(names: string[]) {
    await expect(this.items.getByTestId('inventory-item-name')).toHaveText(names);
  }

  async remove(name: string) {
    await this.items.filter({ hasText: name }).getByRole('button', { name: 'Remove' }).click();
  }

  async checkout() {
    await this.checkoutButton.click();
  }
}
