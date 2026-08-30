import { test, expect, type Page } from '@playwright/test';

async function waitReady(page: Page): Promise<void> {
  await page.waitForSelector('#boot-banner[hidden]', { timeout: 60_000, state: 'attached' });
}

// Expected outcomes verified against pySHACL 0.40.1 through the real app.
const EXPECTED: Array<[label: string, banner: string]> = [
  ['W3C core example', 'Does not conform — 4 violations'],
  ['sh:class', 'Does not conform — 1 violation'],
  ['sh:datatype', 'Does not conform — 2 violations'],
  ['sh:nodeKind', 'Does not conform — 1 violation'],
  ['Cardinality', 'Does not conform — 1 violation'],
  // Ted's uncomparable string age fails both minInclusive and maxInclusive.
  ['Value ranges', 'Does not conform — 3 violations'],
  ['String length and sh:pattern', 'Does not conform — 2 violations'],
  ['Language tags', 'Does not conform — 4 violations'],
  ['Property pairs', 'Does not conform — 1 violation'],
  ['Logical operators', 'Does not conform — 3 violations'],
  // The sh:node failure plus pySHACL's nested detail result.
  ['sh:node', 'Does not conform — 2 violations'],
  ['Qualified cardinality', 'Conforms'],
  ['Closed shapes', 'Does not conform — 1 violation'],
  ['sh:hasValue and sh:in', 'Conforms'],
  ['Severities', 'Does not conform — 2 violations'],
  ['Property paths', 'Does not conform — 1 violation'],
  ['sh:sparql constraint', 'Does not conform — 1 violation'],
  ['SPARQL constraint component', 'Does not conform — 1 violation'],
  ['sh:TripleRule', 'Conforms'],
  ['sh:SPARQLFunction', 'Conforms'],
  ['SPARQL-based target', 'Does not conform — 1 violation'],
  ['sh:SPARQLRule', 'Does not conform — 1 violation'],
];

test('every example validates to its documented outcome', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('.');
  await waitReady(page);

  // The dropdown must offer exactly the expected examples, grouped.
  const labels = await page.$$eval('#examples-select option', (options) =>
    options.map((o) => o.textContent?.trim()).filter((t) => t && !t.startsWith('—')),
  );
  expect(labels).toEqual(EXPECTED.map(([label]) => label));
  const groups = await page.$$eval('#examples-select optgroup', (gs) =>
    gs.map((g) => g.label),
  );
  expect(groups).toEqual(['Getting started', 'Core constraints', 'SPARQL-based']);

  for (const [label, banner] of EXPECTED) {
    // Reset the banner so the wait below detects this example's fresh result
    // even when two consecutive examples produce identical banner text.
    await page.evaluate(() => {
      document.querySelector('#conforms-banner')!.textContent = 'pending';
    });
    await page.locator('#examples-select').selectOption({ label });
    await page.waitForFunction(
      () => /conform/i.test(document.querySelector('#conforms-banner')?.textContent ?? ''),
      undefined,
      { timeout: 30_000 },
    );
    await expect(page.locator('#conforms-banner'), label).toHaveText(banner);
    await expect(page.locator('#run-status'), label).toBeHidden();
    await expect(page.locator('#example-desc'), label).toBeVisible();
    await expect(page.locator('#example-desc'), label).not.toHaveText('');
  }
});
