// Security #3/#4/#13: permalink state is attacker-controlled input. Encoding
// only ever happens on an explicit Share click; decoding is bounded (running
// byte counter, hard cap) and every field is re-validated through the same
// allowlist as normal UI input before it touches anything else.
import { sanitizeOptions, sanitizeFormat, type Options, type Format } from './options';

export type PermalinkState = {
  shapes: string;
  data: string;
  shapesFormat: Format;
  dataFormat: Format;
  options: Options;
};

const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_EDITOR_CHARS = 1_000_000;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeState(state: PermalinkState): Promise<string> {
  const json = JSON.stringify({
    shapes: state.shapes,
    data: state.data,
    shapesFormat: state.shapesFormat,
    dataFormat: state.dataFormat,
    options: state.options,
  });
  const input = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const compressed = new Uint8Array(await new Response(input).arrayBuffer());
  return base64UrlEncode(compressed);
}

export type DecodeResult =
  | { ok: true; state: PermalinkState }
  | { ok: false; error: string };

export async function decodeFragment(fragment: string): Promise<DecodeResult> {
  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(fragment);
  } catch {
    return { ok: false, error: 'shared link is malformed' };
  }

  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DECOMPRESSED_BYTES) {
        await reader.cancel();
        return { ok: false, error: 'shared link is too large or malformed' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: 'shared link is malformed' };
  }

  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(concat(chunks, total));
  } catch {
    return { ok: false, error: 'shared link is malformed' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'shared link is malformed' };
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'shared link is malformed' };
  }

  const src = raw as Record<string, unknown>;
  const shapes = typeof src.shapes === 'string' ? src.shapes : '';
  const data = typeof src.data === 'string' ? src.data : '';
  if (shapes.length > MAX_EDITOR_CHARS || data.length > MAX_EDITOR_CHARS) {
    return { ok: false, error: 'shared link is too large or malformed' };
  }

  // Security #4: null-prototype object built field-by-field from the
  // allowlist — decoded content is never spread/merged into anything, so a
  // `__proto__` key in the fragment JSON cannot pollute Object.prototype.
  const state: PermalinkState = Object.assign(Object.create(null), {
    shapes,
    data,
    shapesFormat: sanitizeFormat(src.shapesFormat),
    dataFormat: sanitizeFormat(src.dataFormat),
    options: sanitizeOptions(src.options),
  });
  return { ok: true, state };
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
