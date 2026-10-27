import { expect, type Locator, type Page } from '@playwright/test';
import { parseMoney } from '../utils/money';

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  postalCode: string;
}

export interface OrderSummary {
  itemPrices: number[];
  subtotal: number;
  tax: number;
  total: number;
}

/** Covers the three checkout steps: information → overview → complete. */
export class CheckoutPage {
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly postalCode: Locator;
  readonly continueButton: Locator;
  readonly finishButton: Locator;
  readonly error: Locator;
  readonly completeHeader: Locator;

  constructor(private readonly page: Page) {
    this.firstName = page.getByTestId('firstName');
    this.lastName = page.getByTestId('lastName');
    this.postalCode = page.getByTestId('postalCode');
    this.continueButton = page.getByTestId('continue');
    this.finishButton = page.getByTestId('finish');
    this.error = page.getByTestId('error');
    this.completeHeader = page.getByTestId('complete-header');
  }

  async fillInformation(info: CustomerInfo) {
    await this.firstName.fill(info.firstName);
    await this.lastName.fill(info.lastName);
    await this.postalCode.fill(info.postalCode);
    await this.continueButton.click();
  }

  async readSummary(): Promise<OrderSummary> {
    await expect(this.page).toHaveURL(/checkout-step-two\.html/);
    const itemPrices = (await this.page.getByTestId('inventory-item-price').allTextContents()).map(
      parseMoney,
    );
    return {
      itemPrices,
      subtotal: parseMoney(await this.page.getByTestId('subtotal-label').textContent()),
      tax: parseMoney(await this.page.getByTestId('tax-label').textContent()),
      total: parseMoney(await this.page.getByTestId('total-label').textContent()),
    };
  }

  async finish() {
    await this.finishButton.click();
  }

  async expectOrderComplete() {
    await expect(this.page).toHaveURL(/checkout-complete\.html/);
    await expect(this.completeHeader).toHaveText('Thank you for your order!');
  }
}
