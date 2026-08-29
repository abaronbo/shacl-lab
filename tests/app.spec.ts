import { test, expect, type Page } from '@playwright/test';

async function waitReady(page: Page): Promise<void> {
  await page.waitForSelector('#boot-banner[hidden]', { timeout: 60_000, state: 'attached' });
}

async function waitValidated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('#conforms-banner')?.textContent?.match(/conform/i),
    undefined,
    { timeout: 20_000 },
  );
}

async function replaceEditorText(page: Page, hostSelector: string, text: string): Promise<void> {
  const content = page.locator(`${hostSelector} .cm-content`);
  await content.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text);
}

const SPARQL_SHAPES =
  '@prefix ex: <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . ' +
  'ex:PersonLifespanShape a sh:NodeShape ; sh:targetClass ex:Person ; sh:sparql [ ' +
  'a sh:SPARQLConstraint ; sh:message "Death date must not precede birth date" ; sh:select """' +
  'SELECT $this ?value WHERE { $this <http://example.org/birthDate> ?birth ; ' +
  '<http://example.org/deathDate> ?value . FILTER (?value < ?birth) }""" ] .';

const SPARQL_TARGET_SHAPES =
  '@prefix ex: <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . ' +
  'ex:ManagerShape a sh:NodeShape ; sh:target [ a sh:SPARQLTarget ; sh:select """' +
  'SELECT ?this WHERE { ?this <http://example.org/role> "manager" . }""" ] ; ' +
  'sh:property [ sh:path ex:reports ; sh:minCount 1 ] .';

const VIOLATING_DATA =
  '@prefix ex: <http://example.org/> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> . ' +
  'ex:Alice a ex:Person ; ex:birthDate "1990-04-01"^^xsd:date ; ex:deathDate "1985-01-01"^^xsd:date .';

const MANAGER_DATA = '@prefix ex: <http://example.org/> . ex:Bob ex:role "manager" .';

test('editing either graph auto-revalidates and renders the expected violation card', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await replaceEditorText(page, '#shapes-editor-host', SPARQL_SHAPES);
  await replaceEditorText(page, '#data-editor-host', VIOLATING_DATA);
  await waitValidated(page);
  await expect(page.locator('#conforms-banner')).toContainText('Does not conform');
  const cards = await page.locator('#tab-cards').textContent();
  expect(cards).toContain('Death date must not precede birth date');
});

test('toggling advanced off removes the SPARQL-target violation', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await replaceEditorText(page, '#shapes-editor-host', SPARQL_TARGET_SHAPES);
  await replaceEditorText(page, '#data-editor-host', MANAGER_DATA);
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

test('bad turtle shows a parse error without crashing the worker', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await replaceEditorText(page, '#shapes-editor-host', 'this is not turtle {{{');
  await page.waitForFunction(
    () => (document.querySelector('#shapes-error') as HTMLElement | null)?.hidden === false,
    undefined,
    { timeout: 5_000 },
  );
  const err = await page.locator('#shapes-error').textContent();
  expect(err?.length).toBeGreaterThan(0);

  // App stays usable: fixing the shapes text still validates.
  await replaceEditorText(page, '#shapes-editor-host', SPARQL_SHAPES);
  await waitValidated(page);
  await expect(page.locator('#shapes-error')).toBeHidden();
});

test('a normal validation run produces zero CSP/Trusted-Types console violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content[- ]Security[- ]Policy|Trusted ?Types?/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto('.');
  await waitReady(page);
  await replaceEditorText(page, '#shapes-editor-host', SPARQL_SHAPES);
  await replaceEditorText(page, '#data-editor-host', VIOLATING_DATA);
  await waitValidated(page);
  expect(violations, violations.join('\n')).toEqual([]);
});
