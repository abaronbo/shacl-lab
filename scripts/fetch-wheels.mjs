// Downloads the pinned pure-Python wheel set into public/wheels/ and writes
// wheels-manifest.json (filename, version, sha256 as published by PyPI).
// verify-wheels.mjs re-checks the directory against the manifest in CI.
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const PINS = {
  pyshacl: '0.40.1',
  rdflib: '7.6.0',
  owlrl: '7.6.2',
  html5rdf: '1.2.1',
  prettytable: '3.18.0',
  wcwidth: '0.8.3',
  packaging: '26.3',
  pyparsing: '3.3.2',
};

const outDir = new URL('../public/wheels/', import.meta.url).pathname;
await mkdir(outDir, { recursive: true });

const manifest = [];
for (const [name, version] of Object.entries(PINS)) {
  const meta = await (await fetch(`https://pypi.org/pypi/${name}/${version}/json`)).json();
  const wheel = meta.urls.find(
    (u) => u.packagetype === 'bdist_wheel' && /none-any\.whl$/.test(u.filename),
  );
  if (!wheel) throw new Error(`${name}==${version}: no universal wheel on PyPI`);
  const buf = Buffer.from(await (await fetch(wheel.url)).arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  if (sha256 !== wheel.digests.sha256) {
    throw new Error(`${wheel.filename}: sha256 mismatch vs PyPI metadata`);
  }
  await writeFile(path.join(outDir, wheel.filename), buf);
  manifest.push({ name, version, filename: wheel.filename, sha256 });
  console.log(`${wheel.filename}  ${(buf.length / 1024).toFixed(0)} KB  ok`);
}

manifest.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  new URL('../wheels-manifest.json', import.meta.url).pathname,
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(`\n${manifest.length} wheels written, manifest updated`);
