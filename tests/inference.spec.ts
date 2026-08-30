import { test, expect, type Page } from '@playwright/test';

async function waitReady(page: Page): Promise<void> {
  await page.waitForSelector('#boot-banner[hidden]', { timeout: 60_000, state: 'attached' });
}

async function waitValidated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => /conform/i.test(document.querySelector('#conforms-banner')?.textContent ?? ''),
    undefined,
    { timeout: 20_000 },
  );
}

test('validation materializes rule-derived triples in the Inferred tab', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'sh:SPARQLRule' });
  await waitValidated(page);

  await page.locator('.tab-button[data-tab="inferred"]').click();
  await expect(page.locator('#tab-inferred')).toBeVisible();
  await expect(page.locator('#inferred-status')).toContainText('1 new triple inferred');
  const graph = await page.locator('#inferred-graph').textContent();
  expect(graph).toContain('isAdult');
  expect(graph).toContain('Alice');
  expect(graph).not.toContain('Kid');
});

test('shapes without rules report zero inferred triples', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'W3C core example' });
  await waitValidated(page);

  await page.locator('.tab-button[data-tab="inferred"]').click();
  await expect(page.locator('#inferred-status')).toContainText('No new triples were inferred');
  await expect(page.locator('#inferred-graph')).toHaveText('');
});

test('view dropdown switches between cards, text and raw graph', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'W3C core example' });
  await waitValidated(page);

  await expect(page.locator('#tab-cards')).toBeVisible();
  await expect(page.locator('#tab-text')).toBeHidden();
  await expect(page.locator('#report-format')).toBeHidden();

  await page.locator('#report-view').selectOption('text');
  await expect(page.locator('#tab-text')).toBeVisible();
  await expect(page.locator('#tab-cards')).toBeHidden();
  await expect(page.locator('#report-text')).not.toHaveText('');

  await page.locator('#report-view').selectOption('graph');
  await expect(page.locator('#tab-graph')).toBeVisible();
  await expect(page.locator('#report-format')).toBeVisible();
  await expect(page.locator('#report-graph')).toContainText('ValidationReport');
});

test('a broken SHACL rule with advanced on surfaces in both panes', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);

  const shapes = page.locator('#shapes-editor-host .cm-content');
  await shapes.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(
    '@prefix sh: <http://www.w3.org/ns/shacl#> . ' +
      '@prefix ex: <http://example.org/> . ' +
      'ex:R a sh:SPARQLRule ; sh:construct "NOT SPARQL" . ' +
      'ex:S a sh:NodeShape ; sh:targetClass ex:Person ; sh:rule ex:R .',
  );
  const data = page.locator('#data-editor-host .cm-content');
  await data.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('@prefix ex: <http://example.org/> . ex:Alice a ex:Person .');

  // Auto-validate picks the edit up; with advanced on, pySHACL aborts the
  // whole run on the malformed rule. The error must land in the run status
  // AND the Inferred tab must explain itself instead of keeping stale output.
  await expect(page.locator('#run-status')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#run-status')).toContainText('Validation error');

  await page.locator('.tab-button[data-tab="inferred"]').click();
  await expect(page.locator('#inferred-status')).toContainText('Inference error');
  await expect(page.locator('#inferred-graph')).toHaveText('');

  // Fixing the rule recovers both panes without a reload.
  await shapes.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(
    '@prefix sh: <http://www.w3.org/ns/shacl#> . ' +
      '@prefix ex: <http://example.org/> . ' +
      'ex:S a sh:NodeShape ; sh:targetClass ex:Person .',
  );
  await page.waitForFunction(
    () => document.querySelector('#run-status')?.hasAttribute('hidden'),
    undefined,
    { timeout: 20_000 },
  );
  await expect(page.locator('#inferred-status')).toContainText('No new triples were inferred');
});

test('tabs switch between validation results and inferred triples', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'W3C core example' });
  await waitValidated(page);

  await expect(page.locator('#tab-validation')).toBeVisible();
  await expect(page.locator('#tab-inferred')).toBeHidden();

  await page.locator('.tab-button[data-tab="inferred"]').click();
  await expect(page.locator('#tab-inferred')).toBeVisible();
  await expect(page.locator('#tab-validation')).toBeHidden();

  await page.locator('.tab-button[data-tab="validation"]').click();
  await expect(page.locator('#tab-validation')).toBeVisible();
  await expect(page.locator('#tab-inferred')).toBeHidden();
});
