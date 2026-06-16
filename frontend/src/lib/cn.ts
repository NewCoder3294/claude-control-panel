/** Tiny class-name joiner. Filters falsy values; no dependency needed. */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
