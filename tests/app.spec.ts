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
