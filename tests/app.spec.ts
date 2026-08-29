import { test, expect, type Page } from '@playwright/test';

async function waitReady(page: Page): Promise<void> {
  await page.waitForSelector('#boot-banner[hidden]', { timeout: 60_000, state: 'attached' });
}

async function waitValidated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('#conforms-banner')?.textContent?.includes('conform'),
    undefined,
    { timeout: 20_000 },
  );
}

test('sh:sparql example produces the expected violation card', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption('1');
  await waitValidated(page);
  const banner = await page.locator('#conforms-banner').textContent();
  expect(banner).toContain('Does not conform');
  const cards = await page.locator('#tab-cards').textContent();
  expect(cards).toContain('Death date must not precede birth date');
  expect(cards).toContain('http://example.org/Alice');
});

test('toggling advanced off removes the SPARQL-target violation', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption('2');
  await waitValidated(page);
  await expect(page.locator('#conforms-banner')).toContainText('Does not conform');

  await page.locator('#opt-advanced').uncheck();
  await page.waitForFunction(
    () => document.querySelector('#conforms-banner')?.textContent?.includes('Conforms'),
    undefined,
    { timeout: 15_000 },
  );
  await expect(page.locator('#conforms-banner')).toContainText('Conforms');
});

test('sh:SPARQLRule example materializes triples a plain shape then reports on', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption('3');
  await waitValidated(page);
  const banner = await page.locator('#conforms-banner').textContent();
  expect(banner).toContain('Does not conform');
  expect(banner).toContain('1 violation');
  const cards = await page.locator('#tab-cards').textContent();
  expect(cards).toContain('http://example.org/Kid');
  expect(cards).not.toContain('http://example.org/Alice');
});

test('bad turtle shows a parse error without crashing the worker', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  const shapes = page.locator('#shapes-editor-host .cm-content');
  await shapes.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('this is not turtle {{{');
  await page.waitForFunction(
    () => (document.querySelector('#shapes-error') as HTMLElement | null)?.hidden === false,
    undefined,
    { timeout: 5_000 },
  );
  const err = await page.locator('#shapes-error').textContent();
  expect(err?.length).toBeGreaterThan(0);

  // App stays usable: loading a known-good example still validates.
  await page.locator('#examples-select').selectOption('1');
  await waitValidated(page);
  await expect(page.locator('#conforms-banner')).toContainText('Does not conform');
});

test('a normal validation run produces zero CSP/Trusted-Types console violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content[- ]Security[- ]Policy|Trusted ?Types?/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption('1');
  await waitValidated(page);
  expect(violations, violations.join('\n')).toEqual([]);
});

async function fragmentFor(page: Page, state: unknown): Promise<string> {
  return page.evaluate(async (input) => {
    const stream = new Blob([JSON.stringify(input)])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }, state);
}

const INFERENCE_SHAPES = `@prefix ex: <http://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
ex:TeacherShape a sh:NodeShape ;
  sh:targetClass ex:Teacher ;
  sh:property [ sh:path ex:qualification ; sh:minCount 1 ] .
`;

const INFERENCE_DATA = `@prefix ex: <http://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
ex:teaches rdfs:domain ex:Teacher .
ex:Bob ex:teaches ex:Math .
`;

test('changing the inference dropdown actually reaches pySHACL', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  const fragment = await fragmentFor(page, {
    shapes: INFERENCE_SHAPES,
    data: INFERENCE_DATA,
    shapesFormat: 'turtle',
    dataFormat: 'turtle',
    options: { inference: 'none', advanced: true, metaShacl: false, allowInfos: false, allowWarnings: false },
  });
  await page.goto(`./#${fragment}`);
  // same-document hash navigation doesn't rerun the app; force a real load
  await page.reload();
  await waitReady(page);
  await page.locator('#validate-btn').click();
  // waitValidated matches lowercase 'conform' only; wait for a fresh
  // conforming banner explicitly.
  await page.waitForFunction(
    () => {
      const text = document.querySelector('#conforms-banner')?.textContent ?? '';
      return text.startsWith('Conforms') && !text.includes('stale');
    },
    undefined,
    { timeout: 20_000 },
  );

  await page.locator('#opt-inference').selectOption('rdfs');
  await page.waitForFunction(
    () => document.querySelector('#conforms-banner')?.textContent?.includes('Does not conform'),
    undefined,
    { timeout: 15_000 },
  );
  const cards = await page.locator('#tab-cards').textContent();
  expect(cards).toContain('http://example.org/Bob');
});

test('meta_shacl failure shows the pySHACL report, not a Python traceback', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  const fragment = await fragmentFor(page, {
    shapes: `@prefix ex: <http://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
ex:PersonShape a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [ sh:path ex:name ; sh:minCount "one" ] .
`,
    data: `@prefix ex: <http://example.org/> .
ex:Alice a ex:Person .
`,
    shapesFormat: 'turtle',
    dataFormat: 'turtle',
    options: { inference: 'none', advanced: false, metaShacl: true, allowInfos: false, allowWarnings: false },
  });
  await page.goto(`./#${fragment}`);
  // same-document hash navigation doesn't rerun the app; force a real load
  await page.reload();
  await waitReady(page);
  await page.locator('#validate-btn').click();
  await page.waitForFunction(
    () => (document.querySelector('#run-status') as HTMLElement | null)?.hidden === false,
    undefined,
    { timeout: 20_000 },
  );
  const status = await page.locator('#run-status').textContent();
  expect(status).toContain('MetaSHACL');
  expect(status).not.toContain('Traceback');
});
