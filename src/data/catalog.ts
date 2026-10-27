/**
 * Golden dataset: the product catalog as the business defines it.
 * UI tests validate what is rendered against this, independent of the UI's own
 * data, so a pricing/naming regression cannot "agree with itself".
 */
export interface CatalogItem {
  slug: string;
  name: string;
  price: number;
}

export const CATALOG: readonly CatalogItem[] = [
  { slug: 'sauce-labs-backpack', name: 'Sauce Labs Backpack', price: 29.99 },
  { slug: 'sauce-labs-bike-light', name: 'Sauce Labs Bike Light', price: 9.99 },
  { slug: 'sauce-labs-bolt-t-shirt', name: 'Sauce Labs Bolt T-Shirt', price: 15.99 },
  { slug: 'sauce-labs-fleece-jacket', name: 'Sauce Labs Fleece Jacket', price: 49.99 },
  { slug: 'sauce-labs-onesie', name: 'Sauce Labs Onesie', price: 7.99 },
  { slug: 'test.allthethings()-t-shirt-(red)', name: 'Test.allTheThings() T-Shirt (Red)', price: 15.99 },
];

export const TAX_RATE = 0.08;

export function catalogItem(name: string): CatalogItem {
  const item = CATALOG.find((i) => i.name === name);
  if (!item) throw new Error(`"${name}" is not in the golden catalog`);
  return item;
}
