import { z } from 'zod';
import { askClaude } from './claude';

/**
 * AI visual oracle: compares a candidate screenshot against a reference and reports
 * differences a *user* would consider defects, rather than pixel noise.
 *
 * Complements (doesn't replace) pixel snapshots: no baselines to maintain across
 * OS/font rendering, and it explains *what* is wrong in words a ticket can use.
 */
export const VisualVerdictSchema = z.object({
  verdict: z.enum(['match', 'defects_found']),
  defects: z.array(
    z.object({
      element: z.string(),
      description: z.string(),
      severity: z.enum(['minor', 'major', 'critical']),
    }),
  ),
});
export type VisualVerdict = z.infer<typeof VisualVerdictSchema>;

const SYSTEM = `You are a meticulous visual QA reviewer for an e-commerce web app.
You get two screenshots of the same page: REFERENCE (known good) and CANDIDATE.
Report user-visible defects in CANDIDATE relative to REFERENCE: wrong or missing images,
wrong prices or text, misaligned or overlapping elements, broken layout, wrong colours/icons.
Ignore anti-aliasing and sub-pixel rendering differences. If there are no user-visible
defects, return verdict "match" with an empty defects list.`;

export async function compareScreenshots(reference: Buffer, candidate: Buffer): Promise<VisualVerdict> {
  const image = (data: Buffer) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/png' as const, data: data.toString('base64') },
  });
  return askClaude({
    system: SYSTEM,
    schema: VisualVerdictSchema,
    effort: 'high',
    content: [
      { type: 'text', text: 'REFERENCE:' },
      image(reference),
      { type: 'text', text: 'CANDIDATE:' },
      image(candidate),
      { type: 'text', text: 'List the user-visible defects in CANDIDATE.' },
    ],
  });
}
