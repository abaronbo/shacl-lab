// Fails (exit 1) if public/wheels/ diverges from wheels-manifest.json:
// missing file, hash mismatch, or a wheel present that the manifest doesn't list.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const dir = new URL('../public/wheels/', import.meta.url).pathname;
const manifest = JSON.parse(
  await readFile(new URL('../wheels-manifest.json', import.meta.url).pathname, 'utf8'),
);

let ok = true;
const listed = new Set(manifest.map((m) => m.filename));

for (const entry of manifest) {
  try {
    const buf = await readFile(path.join(dir, entry.filename));
    const sha256 = createHash('sha256').update(buf).digest('hex');
    if (sha256 !== entry.sha256) {
      console.error(`HASH MISMATCH: ${entry.filename}`);
      ok = false;
    }
  } catch {
    console.error(`MISSING: ${entry.filename}`);
    ok = false;
  }
}

for (const f of await readdir(dir)) {
  if (f.endsWith('.whl') && !listed.has(f)) {
    console.error(`UNLISTED WHEEL: ${f}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log(`wheel manifest ok (${manifest.length} wheels)`);
