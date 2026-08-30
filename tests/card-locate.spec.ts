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

test('clicking a card highlights the focus node and the source shape', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'sh:class' });
  await waitViolations(page);

  await page.locator('.result-card').first().click();

  const dataHighlight = page.locator('#data-editor-host .cm-locate-highlight');
  await expect(dataHighlight).toHaveText('ex:Carol');
  const shapesHighlight = page.locator('#shapes-editor-host .cm-locate-highlight');
  await expect(shapesHighlight).toHaveText('ex:ClassExampleShape-address');
});

test('a blank-node source shape highlights only the focus node', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'W3C core example' });
  await waitViolations(page);

  // First card blames ex:Alice; its property shape is anonymous, so the
  // shapes editor has nothing to highlight.
  await page.locator('.result-card').first().click();
  await expect(page.locator('#data-editor-host .cm-locate-highlight')).toHaveCount(1);
  await expect(page.locator('#shapes-editor-host .cm-locate-highlight')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('ex:Bob is not located inside ex:Bobby', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);

  const shapes = page.locator('#shapes-editor-host .cm-content');
  await shapes.click();
  await page.keyboard.type(
    '@prefix ex: <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . ' +
      'ex:S a sh:NodeShape ; sh:targetNode ex:Bob ; sh:property [ sh:path ex:name ; sh:minCount 1 ] .',
  );
  const data = page.locator('#data-editor-host .cm-content');
  await data.click();
  await page.keyboard.type('@prefix ex: <http://example.org/> .\nex:Bobby ex:age 9 .\nex:Bob ex:age 1 .');
  await waitViolations(page);

  await page.locator('.result-card').first().click();
  const line = await page
    .locator('#data-editor-host .cm-locate-highlight')
    .evaluate((el) => el.closest('.cm-line')?.textContent);
  expect(line).toContain('ex:Bob ex:age 1');
  expect(line).not.toContain('Bobby');
});

test('editing the document clears the highlight', async ({ page }) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'sh:class' });
  await waitViolations(page);

  await page.locator('.result-card').first().click();
  await expect(page.locator('#data-editor-host .cm-locate-highlight')).toHaveCount(1);

  await page.locator('#data-editor-host .cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await expect(page.locator('#data-editor-host .cm-locate-highlight')).toHaveCount(0);
});
