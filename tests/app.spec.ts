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

test('settings menu opens, closes on Escape and outside click', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  const menu = page.locator('#settings-menu');
  await expect(menu).toBeHidden();

  await page.locator('#settings-btn').click();
  await expect(menu).toBeVisible();
  await expect(page.locator('#opt-inference')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.locator('#settings-btn').click();
  await expect(menu).toBeVisible();
  await page.locator('#validate-btn').click();
  await expect(menu).toBeHidden();
});

test('sh:sparql example produces the expected violation card', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'sh:sparql constraint' });
  await waitValidated(page);
  const banner = await page.locator('#conforms-banner').textContent();
  expect(banner).toContain('Does not conform');
  const cards = await page.locator('#tab-cards').textContent();
  expect(cards).toContain('Values are literals with German language tag.');
  expect(cards).toContain('http://example.org/ns#InvalidCountry');
});

test('Clear during an in-flight run discards its late result', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);

  // Selecting an example starts a validation that takes over a second;
  // clearing immediately must win: the late result may not repaint anything.
  await page.locator('#examples-select').selectOption({ label: 'sh:SPARQLRule' });
  await page.locator('#clear-btn').click();

  await page.waitForTimeout(3000);
  await expect(page.locator('#conforms-banner')).toHaveText('Not yet validated.');
  await expect(page.locator('#tab-cards')).toHaveText('');
  await expect(page.locator('#inferred-status')).toHaveText('');
  await expect(page.locator('#run-status')).toBeHidden();
  await expect(page.locator('#shapes-error')).toBeHidden();
});

test('parse error before any result shows no stale tag', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);

  const shapes = page.locator('#shapes-editor-host .cm-content');
  await shapes.click();
  await page.keyboard.type('this is not turtle');
  await page.waitForFunction(
    () => (document.querySelector('#shapes-error') as HTMLElement | null)?.hidden === false,
    undefined,
    { timeout: 20_000 },
  );
  // No validation result ever rendered, so no "(stale — showing last valid
  // result)" nonsense may appear.
  await expect(page.locator('#conforms-banner')).toHaveText('Not yet validated.');
});

test('boots to an empty canvas; Clear returns to it after an example', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);

  await expect(page.locator('#conforms-banner')).toHaveText('Not yet validated.');
  await expect(page.locator('#example-desc')).toBeHidden();
  expect(await page.locator('#shapes-editor-host .cm-content').textContent()).toBe('');
  expect(await page.locator('#data-editor-host .cm-content').textContent()).toBe('');
  // The empty canvas stays quiet: no auto-validation on boot.
  await page.waitForTimeout(1000);
  await expect(page.locator('#conforms-banner')).toHaveText('Not yet validated.');

  await page.locator('#examples-select').selectOption({ label: 'sh:sparql constraint' });
  await waitValidated(page);
  await expect(page.locator('#example-desc')).toBeVisible();

  await page.locator('#clear-btn').click();
  await expect(page.locator('#conforms-banner')).toHaveText('Not yet validated.');
  await expect(page.locator('#example-desc')).toBeHidden();
  await expect(page.locator('#examples-select')).toHaveValue('');
  expect(await page.locator('#shapes-editor-host .cm-content').textContent()).toBe('');
  await expect(page.locator('#tab-cards')).toHaveText('');
  await expect(page.locator('#inferred-status')).toHaveText('');
  // The debounced auto-run from clearing the editors must not fire.
  await page.waitForTimeout(1000);
  await expect(page.locator('#conforms-banner')).toHaveText('Not yet validated.');

  // Typing after Clear validates again (vacuously conforming input).
  const shapes = page.locator('#shapes-editor-host .cm-content');
  await shapes.click();
  await page.keyboard.type('@prefix ex: <http://example.org/> .');
  await expect(page.locator('#conforms-banner')).toContainText('Conforms', { timeout: 20_000 });
});

test('toggling advanced off removes the SPARQL-target violation', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'SPARQL-based target' });
  await waitValidated(page);
  await expect(page.locator('#conforms-banner')).toContainText('Does not conform');

  await page.locator('#settings-btn').click();
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
  await page.locator('#examples-select').selectOption({ label: 'sh:SPARQLRule' });
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
  await page.locator('#examples-select').selectOption({ label: 'sh:sparql constraint' });
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
  await page.locator('#examples-select').selectOption({ label: 'sh:sparql constraint' });
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

  await page.locator('#settings-btn').click();
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
