import { expect, test } from '@playwright/test';
import {
  buildTriagePrompt,
  reconcile,
  redact,
  renderMarkdown,
  sanitizeError,
  TriageResultSchema,
  type FailureRecord,
  type TriageResult,
} from '../../src/ai/triage';
import { parseMoney, roundCents, sum } from '../../src/utils/money';

/**
 * The AI integration is only as trustworthy as the deterministic code around it:
 * redaction (what leaves the runner), prompt construction, and reconciling the
 * model's answer with reality. Those are tested here without any network calls.
 */

const failure = (over: Partial<FailureRecord> = {}): FailureRecord => ({
  id: 't1',
  title: 'Checkout › order totals are correct',
  file: 'tests/ui/checkout.spec.ts:20',
  project: 'chromium',
  status: 'failed',
  retries: 2,
  durationMs: 4200,
  error: 'Expected: 9.12\nReceived: 9.11',
  knownDefects: [],
  ...over,
});

test.describe('redaction', { tag: '@unit' }, () => {
  const cases: [string, string, RegExp][] = [
    ['JWT', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.abc-DEF_123', /\[REDACTED_JWT\]/],
    ['Anthropic key', 'key=sk-ant-api03-AbCdEf123456', /\[REDACTED/],
    ['GitHub token', 'token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', /\[REDACTED/],
    ['password field', '{"password": "secret_sauce"}', /"password": "\[REDACTED\]"/],
    ['email', 'user emily.johnson@x.dummyjson.com not found', /\[REDACTED_EMAIL\]/],
  ];
  for (const [name, input, expected] of cases) {
    test(`redacts ${name}`, () => {
      const out = redact(input);
      expect(out).toMatch(expected);
      expect(out).not.toContain(input.match(/(eyJ\S+|sk-ant\S+|ghp_\S+|secret_sauce|emily\S+@\S+)/)![1]);
    });
  }

  test('leaves ordinary assertion output intact', () => {
    const text = 'expect(received).toBe(expected)\nExpected: 401\nReceived: 500';
    expect(redact(text)).toBe(text);
  });
});

test.describe('prompt construction', { tag: '@unit' }, () => {
  test('strips ANSI colour codes and marks truncation explicitly', () => {
    const out = sanitizeError('\u001b[31mred\u001b[39m ' + 'x'.repeat(5000));
    expect(out).not.toContain('\u001b');
    expect(out).toMatch(/…\[truncated \d+ chars\]$/);
  });

  test('includes every failure id and known-defect annotations', () => {
    const prompt = buildTriagePrompt([
      failure(),
      failure({ id: 't2', knownDefects: ['SD-01: float totals'] }),
    ]);
    expect(prompt).toContain('<failure id="t1">');
    expect(prompt).toContain('<failure id="t2">');
    expect(prompt).toContain('known_defects: SD-01: float totals');
  });

  test('never sends secrets found in error messages', () => {
    const prompt = buildTriagePrompt([failure({ error: 'login failed for password=secret_sauce' })]);
    expect(prompt).not.toContain('secret_sauce');
  });
});

test.describe('reconciling model output', { tag: '@unit' }, () => {
  const result: TriageResult = {
    overall_summary: 'One product bug.',
    failures: [
      {
        id: 't1',
        category: 'product_defect',
        confidence: 'high',
        root_cause_hypothesis: 'Tax rounding',
        suggested_next_step: 'File bug',
        related_ids: ['t2', 'hallucinated'],
      },
      {
        id: 'hallucinated',
        category: 'flaky',
        confidence: 'low',
        root_cause_hypothesis: '?',
        suggested_next_step: '?',
        related_ids: [],
      },
    ],
  };

  test('drops ids the model invented and back-fills ids it skipped', () => {
    const out = reconcile([failure(), failure({ id: 't2' })], result);
    expect(out.failures.map((f) => f.id)).toEqual(['t1', 't2']);
    expect(out.failures[0]!.related_ids).toEqual(['t2']);
    expect(out.failures[1]).toMatchObject({ id: 't2', category: 'unknown', confidence: 'low' });
  });

  test('schema rejects categories outside the taxonomy', () => {
    const bad = { ...result, failures: [{ ...result.failures[0], category: 'cosmic_rays' }] };
    expect(TriageResultSchema.safeParse(bad).success).toBe(false);
  });

  test('markdown escapes table-breaking characters and orders product defects first', () => {
    const md = renderMarkdown(
      [failure({ title: 'a | b' }), failure({ id: 't2', title: 'flaky one' })],
      reconcile([failure({ title: 'a | b' }), failure({ id: 't2', title: 'flaky one' })], {
        overall_summary: 's',
        failures: [
          { ...result.failures[0]!, id: 't2', category: 'flaky', related_ids: [] },
          { ...result.failures[0]!, related_ids: [] },
        ],
      }),
    );
    expect(md).toContain('a \\| b');
    expect(md.indexOf('product_defect |')).toBeLessThan(md.indexOf('flaky |'));
  });

  test('falls back to a plain table when AI is unavailable', () => {
    const md = renderMarkdown([failure()], null, 'AI triage skipped');
    expect(md).toContain('> AI triage skipped');
    expect(md).toContain('| Checkout › order totals are correct | failed | chromium |');
  });
});

test.describe('money utilities', { tag: '@unit' }, () => {
  test('parses UI currency strings, including unrounded floats', () => {
    expect(parseMoney('$29.99')).toBe(29.99);
    expect(parseMoney('Item total: $113.94999999999999')).toBeCloseTo(113.95, 10);
    expect(() => parseMoney('free')).toThrow();
  });

  test('rounds half-up at the cent boundary', () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(sum([7.99, 49.99, 15.99, 9.99, 29.99])).toBe(113.95);
  });
});
