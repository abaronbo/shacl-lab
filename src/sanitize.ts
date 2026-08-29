// Security #5/#6: displayed strings never carry C0/C1 control chars (which
// could forge terminal-like output) or bidi-override chars (which could
// visually reorder text to disguise its meaning). Stripped before any
// textContent set. \n and \t are preserved.
const UNSAFE_CHARS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F' +
    '\\u202A-\\u202E\\u2066-\\u2069]',
  'g',
);

export function sanitizeForDisplay(value: string): string {
  return value.replace(UNSAFE_CHARS, '');
}
