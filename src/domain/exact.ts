/** Exact rational arithmetic. No intermediate decimal rounding or external library. */
export type Exact = Readonly<{ n: bigint; d: bigint }>;

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}
export function fraction(n: bigint | number, d: bigint | number = 1n): Exact {
  let numerator = BigInt(n);
  let denominator = BigInt(d);
  if (denominator === 0n) throw new RangeError('Zero denominator');
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ n: numerator / divisor, d: denominator / divisor });
}
export const ZERO = fraction(0);
export const ONE = fraction(1);
export const add = (a: Exact, b: Exact): Exact => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const subtract = (a: Exact, b: Exact): Exact => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
export const multiply = (a: Exact, b: Exact): Exact => fraction(a.n * b.n, a.d * b.d);
export const divide = (a: Exact, b: Exact): Exact => fraction(a.n * b.d, a.d * b.n);
export function compare(a: Exact, b: Exact): -1 | 0 | 1 {
  const delta = a.n * b.d - b.n * a.d;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
export function decimal(input: unknown, places = 2): Exact {
  if (typeof input !== 'string' || input.length > 40) throw new TypeError('Expected decimal text');
  const value = input.trim().replace(',', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(value)) throw new TypeError('Invalid decimal');
  const [whole = '', tail = ''] = value.split('.');
  return fraction(BigInt(whole + tail), 10n ** BigInt(tail.length));
}
export function roundInteger(value: Exact): bigint {
  const sign = value.n < 0n ? -1n : 1n;
  const positive = sign * value.n;
  return sign * ((2n * positive + value.d) / (2n * value.d));
}
export function cents(value: Exact): number {
  const rounded = roundInteger(multiply(value, fraction(100)));
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new RangeError('Money outside safe integer range');
  return result;
}
export const exactKey = (value: Exact): string => `${value.n}/${value.d}`;
export function formatExact(value: Exact, places = 2): string {
  const scale = 10n ** BigInt(places);
  const rounded = roundInteger(multiply(value, fraction(scale)));
  const abs = rounded < 0n ? -rounded : rounded;
  return `${rounded < 0n ? '−' : ''}${abs / scale}${places ? `,${String(abs % scale).padStart(places, '0')}` : ''}`;
}
export const formatMoney = (value: number): string => `${formatExact(fraction(value, 100))} €`;
