import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../../src/fixtures/test';
import baseline from './a11y-baseline.json';

/**
 * WCAG 2.1 A/AA scan of each key page with a *ratchet*:
 *  • violations already in a11y-baseline.json are reported (as annotations) but tolerated,
 *  • any NEW rule violation fails the build,
 *  • a baselined rule that disappears also fails, prompting the baseline to shrink.
 * This lets a team adopt a11y gating on a legacy app without a big-bang fix.
 */
const pages: { name: keyof typeof baseline; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'login',
    open: async (page) => {
      await page.context().clearCookies();
      await page.goto('/');
    },
  },
  {
    name: 'inventory',
    open: async (page) => {
      await page.goto('/inventory.html');
    },
  },
  {
    name: 'cart',
    open: async (page) => {
      await page.goto('/cart.html');
    },
  },
  {
    name: 'checkout-information',
    open: async (page) => {
      await page.goto('/checkout-step-one.html');
    },
  },
];

for (const { name, open } of pages) {
  test(`${name} page has no new WCAG 2.1 AA violations`, { tag: '@a11y' }, async ({ page }) => {
    await open(page);
    await expect(page.locator('#root')).not.toBeEmpty();

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const found = violations.map((v) => v.id).sort();
    const allowed: string[] = baseline[name];

    for (const v of violations) {
      test.info().annotations.push({
        type: `a11y:${v.impact}`,
        description: `${v.id} (${v.nodes.length} nodes) — ${v.help}`,
      });
    }

    expect(
      found.filter((id) => !allowed.includes(id)),
      'new accessibility violations',
    ).toEqual([]);
    expect(
      allowed.filter((id) => !found.includes(id)),
      'fixed violations — remove them from the baseline',
    ).toEqual([]);
  });
}
