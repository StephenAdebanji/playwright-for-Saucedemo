import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { env } from '../config/env';

export function aiEnabled(): boolean {
  return Boolean(env.anthropicApiKey);
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  return (client ??= new Anthropic({ apiKey: env.anthropicApiKey }));
}

export class AiRefusalError extends Error {}

/**
 * One structured call to Claude. The response is constrained to `schema` by the API
 * (structured outputs) *and* re-validated by zod, so callers never handle free text.
 */
export async function askClaude<T extends z.ZodType>(opts: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: T;
  effort?: 'low' | 'medium' | 'high';
}): Promise<z.infer<T>> {
  const response = await getClient().beta.messages.parse({
    model: env.aiModel,
    max_tokens: 16000,
    system: opts.system,
    messages: [{ role: 'user', content: opts.content }],
    output_config: { effort: opts.effort ?? 'medium', format: betaZodOutputFormat(opts.schema) },
    // If the primary model declines, let the API retry on its default fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });

  if (response.stop_reason === 'refusal') {
    throw new AiRefusalError(`Model declined: ${response.stop_details?.category ?? 'unknown category'}`);
  }
  if (response.parsed_output == null) {
    throw new Error(`No structured output (stop_reason=${response.stop_reason})`);
  }
  return response.parsed_output;
}
