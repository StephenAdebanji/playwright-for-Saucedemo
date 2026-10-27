/** Parse UI currency strings such as "$29.99" or "Item total: $45.98". */
export function parseMoney(text: string | null): number {
  const match = text?.match(/\$\s*(-?\d+(?:\.\d+)?)/);
  if (!match?.[1]) throw new Error(`No currency amount found in "${text}"`);
  return Number(match[1]);
}

/** Round half-up to cents, avoiding binary floating point drift (e.g. 1.005). */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sum(values: number[]): number {
  return roundCents(values.reduce((a, b) => a + b, 0));
}
