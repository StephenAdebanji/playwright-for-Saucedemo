/**
 * Single source of truth for environment-driven configuration.
 * Everything has a sensible default so `npx playwright test` works out of the box.
 */
export const env = {
  isCI: !!process.env.CI,
  uiBaseUrl: process.env.UI_BASE_URL ?? 'https://www.saucedemo.com',
  apiBaseUrl: process.env.API_BASE_URL ?? 'https://dummyjson.com',
  saucePassword: process.env.SAUCE_PASSWORD ?? 'secret_sauce',

  /** AI features are opt-in: they only run when a key is present. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  aiModel: process.env.AI_MODEL ?? 'claude-opus-5-5',
} as const;
