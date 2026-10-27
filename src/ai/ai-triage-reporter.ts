import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { aiEnabled } from './claude';
import { redact, renderMarkdown, triageFailures, type FailureRecord } from './triage';

const OUTPUT = path.join('reports', 'ai-triage.md');
const MAX_FAILURES = 40;

/**
 * Playwright reporter that sends the run's failures (and flaky passes) to Claude for
 * categorisation, then writes reports/ai-triage.md and the GitHub job summary.
 *
 * Opt-in and non-blocking: without ANTHROPIC_API_KEY, or if the API errors, it writes
 * a plain failure table and never changes the run's exit code.
 */
export default class AiTriageReporter implements Reporter {
  private readonly failures = new Map<string, FailureRecord>();

  printsToStdio() {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const outcome = test.outcome();
    const isFinalAttempt = result.status === 'passed' || result.retry === test.retries || outcome === 'flaky';
    if (!isFinalAttempt || outcome === 'expected' || outcome === 'skipped') return;

    // titlePath = ['', project, file, ...describe blocks, test title]
    const [, project, , ...titlePath] = test.titlePath();
    this.failures.set(test.id, {
      id: `t${this.failures.size + 1}`,
      // Redact at capture so no output path (table, prompt, job summary) can leak secrets.
      title: redact(titlePath.join(' › ')),
      file: `${path.relative(process.cwd(), test.location.file)}:${test.location.line}`,
      project: project ?? '',
      status: outcome === 'flaky' ? 'flaky' : (result.status as FailureRecord['status']),
      retries: result.retry,
      durationMs: result.duration,
      error:
        result.errors.map((e) => [e.message, e.stack].filter(Boolean).join('\n')).join('\n---\n') ||
        '(no error captured)',
      knownDefects: test.annotations.filter((a) => a.type === 'known-defect').map((a) => a.description ?? ''),
    });
  }

  async onEnd() {
    const failures = [...this.failures.values()];
    if (failures.length === 0) return;

    let markdown: string;
    const sample = failures.slice(0, MAX_FAILURES);
    const overflow =
      failures.length > MAX_FAILURES
        ? `Only the first ${MAX_FAILURES} of ${failures.length} failures were triaged.`
        : undefined;

    if (!aiEnabled()) {
      markdown = renderMarkdown(failures, null, 'AI triage skipped: set ANTHROPIC_API_KEY to enable.');
    } else {
      try {
        markdown = renderMarkdown(sample, await triageFailures(sample), overflow);
      } catch (err) {
        markdown = renderMarkdown(failures, null, `AI triage unavailable (${(err as Error).message}).`);
      }
    }

    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, markdown);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    console.log(`\nAI triage written to ${OUTPUT}`);
  }
}
