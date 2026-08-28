// Copies the Pyodide runtime from the lockfile-pinned npm package into
// public/pyodide/ so it is served same-origin (no CDN in script-src/connect-src).
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

const FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

const src = new URL('../node_modules/pyodide/', import.meta.url).pathname;
const dst = new URL('../public/pyodide/', import.meta.url).pathname;
await mkdir(dst, { recursive: true });
for (const f of FILES) {
  await copyFile(path.join(src, f), path.join(dst, f));
}
console.log(`pyodide runtime vendored (${FILES.length} files)`);
