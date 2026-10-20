/** Joins class names, skipping falsy values. Replaced by the design-system helper in Slice 1.2 if needed. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
