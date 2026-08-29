import { test, expect, type Page } from '@playwright/test';

async function waitReady(page: Page): Promise<void> {
  await page.waitForSelector('#boot-banner[hidden]', { timeout: 60_000, state: 'attached' });
}

async function waitViolations(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('#conforms-banner')?.textContent?.includes('Does not conform'),
    undefined,
    { timeout: 20_000 },
  );
}

test('SPARQL constraint violations link to the SHACL 1.2 SPARQL spec', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption('1');
  await waitViolations(page);

  const link = page.locator('#tab-cards a.spec-link').first();
  await expect(link).toHaveAttribute(
    'href',
    'https://www.w3.org/TR/shacl12-sparql/#sparql-constraints',
  );
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noreferrer noopener');
});

test('core constraint violations link to the SHACL 1.2 Core spec', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption('3');
  await waitViolations(page);

  const link = page.locator('#tab-cards a.spec-link').first();
  await expect(link).toHaveAttribute(
    'href',
    'https://www.w3.org/TR/shacl12-core/#HasValueConstraintComponent',
  );
});

test('an unknown constraint component gets no link', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await waitReady(page);

  // A custom SPARQL-based constraint component: its IRI is user-defined, so
  // it must render as plain text, never as a link.
  const shapes = page.locator('#shapes-editor-host .cm-content');
  await shapes.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(
    '@prefix sh: <http://www.w3.org/ns/shacl#> . ' +
      '@prefix ex: <http://example.org/> . ' +
      'ex:MyComponent a sh:ConstraintComponent ; ' +
      'sh:parameter ex:MyParam ; ' +
      'sh:nodeValidator ex:MyValidator . ' +
      'ex:MyParam sh:path ex:myParam . ' +
      'ex:MyValidator a sh:SPARQLSelectValidator ; ' +
      'sh:select "SELECT $this WHERE { $this a ex:Person }" . ' +
      'ex:S a sh:NodeShape ; sh:targetClass ex:Person ; ex:myParam true .',
  );
  const data = page.locator('#data-editor-host .cm-content');
  await data.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('@prefix ex: <http://example.org/> . ex:Alice a ex:Person .');
  await waitViolations(page);

  const cards = await page.locator('#tab-cards').textContent();
  expect(cards).toContain('Alice');
  await expect(page.locator('#tab-cards a.spec-link')).toHaveCount(0);
});
