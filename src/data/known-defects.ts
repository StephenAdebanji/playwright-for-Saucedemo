import { test } from '@playwright/test';

/**
 * Known-defect register.
 *
 * Defects found by this suite are recorded here instead of deleting or skipping
 * the test. `expectKnownDefect()` marks the test as an *expected failure*:
 *   • CI stays green while the defect is open,
 *   • the defect is visible in the report as an annotation with its ID,
 *   • when the bug is fixed the test "unexpectedly passes" and fails the build,
 *     forcing someone to close the defect and remove the entry. No silent rot.
 *
 * Full write-ups live in docs/DEFECTS.md.
 */
export const KNOWN_DEFECTS = {
  'SD-01': 'Order summary renders unrounded float totals (e.g. "Item total: $113.94999999999999")',
  'SD-02': 'problem_user / visual_user: product images replaced by 404 placeholder',
  'SD-03': 'problem_user / error_user: product sorting has no effect',
  'SD-04': 'problem_user / error_user: only 2 of 6 products can be added; "Remove" does nothing',
  'SD-05': 'problem_user: typing Last Name overwrites First Name; error_user: Last Name cannot be entered',
  'SD-06': 'error_user: "Finish" does not complete the order',
  'SD-07': 'performance_glitch_user: login takes ~5s (budget 2s)',
  'SD-08': 'visual_user: inventory prices differ from catalog and from checkout prices',
  'DQ-01':
    'DummyJSON: availabilityStatus is not a function of stock (stock=7 is both "Low Stock" and "In Stock")',
  'SEC-01': 'DummyJSON: /auth/me returns 500 "invalid signature" for a tampered JWT (expected 401)',
  'DQ-02': 'DummyJSON: products marked "In Stock" have minimumOrderQuantity > stock (unpurchasable)',
} as const;

export type DefectId = keyof typeof KNOWN_DEFECTS;

export function expectKnownDefect(id: DefectId) {
  test.info().annotations.push({ type: 'known-defect', description: `${id}: ${KNOWN_DEFECTS[id]}` });
  test.fail();
}
