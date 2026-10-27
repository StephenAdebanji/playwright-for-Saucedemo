import type { Page } from '@playwright/test';
import { expect, LOGGED_OUT, test } from '../../src/fixtures/test';
import { aiEnabled } from '../../src/ai/claude';
import { compareScreenshots } from '../../src/ai/visual-oracle';
import { Personas } from '../../src/data/users';

/**
 * LLM-as-oracle, designed like any other measurement instrument:
 *  1. a NEGATIVE CONTROL (identical pages) proves it doesn't hallucinate defects,
 *  2. a POSITIVE CONTROL (visual_user, known-broken) proves it can detect them.
 * If either control fails, the oracle is untrustworthy and its other verdicts are void.
 *
 * Non-deterministic and paid, so it runs nightly (@ai), never as a merge gate.
 */
test.use({ ...LOGGED_OUT, viewport: { width: 1280, height: 900 } });
// eslint-disable-next-line playwright/no-skipped-test -- opt-in suite, needs an API key
test.skip(!aiEnabled(), 'Set ANTHROPIC_API_KEY to run AI-assisted checks');

const shoot = async (page: Page) => {
  // Wait for every image to finish decoding so the screenshot is complete.
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  return page.screenshot({ fullPage: true, animations: 'disabled' });
};

test.describe('AI visual oracle', { tag: '@ai' }, () => {
  test('negative control: identical pages are reported as a match', async ({ page, loginAs }) => {
    await loginAs(Personas.standard);
    const reference = await shoot(page);
    await page.reload();
    const candidate = await shoot(page);

    const result = await compareScreenshots(reference, candidate);
    await test
      .info()
      .attach('verdict.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.verdict).toBe('match');
  });

  test('positive control: visual_user defects are detected and described', async ({
    page,
    loginAs,
    inventoryPage,
  }) => {
    await loginAs(Personas.standard);
    const reference = await shoot(page);
    await inventoryPage.header.logout();
    await loginAs(Personas.visual);
    const candidate = await shoot(page);

    const result = await compareScreenshots(reference, candidate);
    await test
      .info()
      .attach('verdict.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    await test.info().attach('candidate.png', { body: candidate, contentType: 'image/png' });

    expect(result.verdict).toBe('defects_found');
    // visual_user's wrong prices and placeholder image are deterministic; the oracle must name them.
    const described = result.defects
      .map((d) => `${d.element} ${d.description}`)
      .join(' ')
      .toLowerCase();
    expect(described).toMatch(/price/);
    expect(described).toMatch(/image|photo|picture/);
  });
});
