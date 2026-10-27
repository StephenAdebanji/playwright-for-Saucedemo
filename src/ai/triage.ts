import { z } from 'zod';
import { askClaude } from './claude';

/**
 * AI failure triage.
 *
 * Turns a pile of red tests into a ranked, categorised list with root-cause hypotheses,
 * so a human starts from "3 product bugs, 1 flaky locator, 1 env outage" instead of
 * 40 stack traces. Everything except `triageFailures` is pure and unit-tested.
 */

export interface FailureRecord {
  id: string;
  title: string;
  file: string;
  project: string;
  status: 'failed' | 'timedOut' | 'interrupted' | 'flaky';
  retries: number;
  durationMs: number;
  error: string;
  knownDefects: string[];
}

export const TriageCategory = z.enum([
  'product_defect',
  'test_defect',
  'environment',
  'flaky',
  'known_defect',
  'unknown',
]);

export const TriageResultSchema = z.object({
  overall_summary: z.string().describe('2-4 sentences a lead could paste into a standup'),
  failures: z.array(
    z.object({
      id: z.string().describe('The failure id exactly as given'),
      category: TriageCategory,
      confidence: z.enum(['low', 'medium', 'high']),
      root_cause_hypothesis: z.string(),
      suggested_next_step: z.string(),
      related_ids: z.array(z.string()).describe('Other failure ids that likely share this root cause'),
    }),
  ),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export const TRIAGE_SYSTEM_PROMPT = `You are a senior QA engineer triaging automated test failures from a Playwright run.
Classify each failure:
- product_defect: the application behaves incorrectly (wrong data, broken flow, regression).
- test_defect: the test itself is wrong (stale locator, bad assertion, race in test code).
- environment: infrastructure/network/third-party outage, DNS, 5xx from a dependency, rate limiting.
- flaky: passed on retry or shows timing-dependent symptoms without a clear product cause.
- known_defect: the failure matches a known-defect annotation provided with it.
- unknown: not enough evidence.
Ground every hypothesis in the evidence given; say "insufficient evidence" rather than guess.
Group failures that share a root cause via related_ids. Be concise and specific.`;

const MAX_ERROR_CHARS = 4000;

/** Remove secrets and PII before anything leaves the CI runner. */
export function redact(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[REDACTED_JWT]')
    .replace(/\b(sk-ant-[\w-]+|sk-[\w-]{20,}|gh[pousr]_[\w]{20,})/g, '[REDACTED_KEY]')
    .replace(/(authorization|password|secret|token|api[_-]?key)(["'\s:=]+)([^\s"',}]+)/gi, '$1$2[REDACTED]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[REDACTED_EMAIL]');
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

/** Strip colour codes, redact, and bound size (with an explicit marker, never silently). */
export function sanitizeError(raw: string): string {
  const clean = redact(raw.replace(ANSI, ''));
  if (clean.length <= MAX_ERROR_CHARS) return clean;
  return `${clean.slice(0, MAX_ERROR_CHARS)}\n…[truncated ${clean.length - MAX_ERROR_CHARS} chars]`;
}

export function buildTriagePrompt(failures: FailureRecord[]): string {
  const blocks = failures.map((f) =>
    [
      `<failure id="${f.id}">`,
      `title: ${f.title}`,
      `file: ${f.file}`,
      `project: ${f.project}`,
      `status: ${f.status} (retries: ${f.retries}, duration: ${f.durationMs}ms)`,
      f.knownDefects.length ? `known_defects: ${f.knownDefects.join('; ')}` : null,
      `error:\n${sanitizeError(f.error)}`,
      `</failure>`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return `Triage these ${failures.length} test failure(s).\n\n${blocks.join('\n\n')}`;
}

/** Guard against the model inventing or dropping ids. */
export function reconcile(failures: FailureRecord[], result: TriageResult): TriageResult {
  const known = new Set(failures.map((f) => f.id));
  const triaged = result.failures.filter((r) => known.has(r.id));
  const seen = new Set(triaged.map((r) => r.id));
  const missing = failures
    .filter((f) => !seen.has(f.id))
    .map((f) => ({
      id: f.id,
      category: 'unknown' as const,
      confidence: 'low' as const,
      root_cause_hypothesis: 'Not triaged by the model.',
      suggested_next_step: 'Inspect the trace manually.',
      related_ids: [],
    }));
  return {
    overall_summary: result.overall_summary,
    failures: [...triaged, ...missing].map((r) => ({
      ...r,
      related_ids: r.related_ids.filter((id) => known.has(id)),
    })),
  };
}

const ORDER: Record<z.infer<typeof TriageCategory>, number> = {
  product_defect: 0,
  environment: 1,
  test_defect: 2,
  flaky: 3,
  unknown: 4,
  known_defect: 5,
};

export function renderMarkdown(
  failures: FailureRecord[],
  result: TriageResult | null,
  note?: string,
): string {
  const byId = new Map(failures.map((f) => [f.id, f]));
  const lines = ['## 🤖 AI failure triage', ''];
  if (note) lines.push(`> ${note}`, '');
  if (!result) {
    lines.push('| Test | Status | Project |', '|---|---|---|');
    for (const f of failures) lines.push(`| ${f.title} | ${f.status} | ${f.project} |`);
    return lines.join('\n') + '\n';
  }

  const counts = result.failures.reduce<Record<string, number>>(
    (acc, r) => ({ ...acc, [r.category]: (acc[r.category] ?? 0) + 1 }),
    {},
  );
  lines.push(
    result.overall_summary,
    '',
    Object.entries(counts)
      .map(([c, n]) => `**${c}**: ${n}`)
      .join(' · '),
    '',
  );
  lines.push('| Category | Confidence | Test | Hypothesis | Next step |', '|---|---|---|---|---|');
  for (const r of [...result.failures].sort((a, b) => ORDER[a.category] - ORDER[b.category])) {
    const f = byId.get(r.id);
    const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${r.category} | ${r.confidence} | ${cell(f?.title ?? r.id)}<br><sub>${cell(f?.file ?? '')}</sub> | ${cell(r.root_cause_hypothesis)} | ${cell(r.suggested_next_step)} |`,
    );
  }
  return lines.join('\n') + '\n';
}

export async function triageFailures(failures: FailureRecord[]): Promise<TriageResult> {
  const result = await askClaude({
    system: TRIAGE_SYSTEM_PROMPT,
    content: [{ type: 'text', text: buildTriagePrompt(failures) }],
    schema: TriageResultSchema,
    effort: 'medium',
  });
  return reconcile(failures, result);
}
