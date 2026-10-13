// Text helpers shared by the app's views.

export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A whole-number count with thousands separators (rounds first). */
export const roundedCount = (n: number) => Math.round(n).toLocaleString('en-US');
