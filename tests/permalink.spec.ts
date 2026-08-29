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

async function base64UrlOf(page: Page, text: string): Promise<string> {
  return page.evaluate(async (input) => {
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }, text);
}

test('permalink round trip: share, open fresh, no auto-run, then Validate reproduces the result', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption('1');
  await waitValidated(page);
  const originalBanner = await page.locator('#conforms-banner').textContent();
  const originalCards = await page.locator('#tab-cards').textContent();

  await page.locator('#share-btn').click();
  await page.waitForFunction(() => location.hash.length > 1);
  const shapesFormat = await page.locator('#shapes-format').inputValue();
  const dataFormat = await page.locator('#data-format').inputValue();
  const advanced = await page.locator('#opt-advanced').isChecked();
  const url = page.url();

  const page2 = await context.newPage();
  await page2.goto(url);
  await waitReady(page2);

  await expect(page2.locator('#notice-banner')).toBeVisible();
  await expect(page2.locator('#notice-text')).toContainText('shared link');
  await expect(page2.locator('#conforms-banner')).toContainText('Not yet validated');
  expect(await page2.locator('#shapes-format').inputValue()).toBe(shapesFormat);
  expect(await page2.locator('#data-format').inputValue()).toBe(dataFormat);
  expect(await page2.locator('#opt-advanced').isChecked()).toBe(advanced);

  // No validation ran yet — give the debounce window a chance and confirm it stayed idle.
  await page2.waitForTimeout(1000);
  await expect(page2.locator('#conforms-banner')).toContainText('Not yet validated');

  await page2.locator('#validate-btn').click();
  await waitValidated(page2);
  expect(await page2.locator('#conforms-banner').textContent()).toBe(originalBanner);
  // Blank-node labels pyshacl mints for anonymous shapes are random per run,
  // so compare cards with them normalized away rather than verbatim.
  const normalize = (text: string | null) => (text ?? '').replace(/n[0-9a-f]{20,}/g, '<bnode>');
  expect(normalize(await page2.locator('#tab-cards').textContent())).toBe(
    normalize(originalCards),
  );
});

test('garbage fragment falls back to a clean default state with a notice', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('.#not-base64-!!!');
  await waitReady(page);
  await expect(page.locator('#notice-text')).toContainText('malformed');
  await expect(page.locator('#validate-btn')).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test('truncated deflate fragment falls back cleanly with no unhandled rejection', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const full = await base64UrlOf(page, '{"shapes":"a","data":"b"}');
  const truncated = full.slice(0, full.length - 4);
  await page.goto('.#' + truncated);
  await waitReady(page);
  await expect(page.locator('#notice-text')).toContainText('malformed');
  await expect(page.locator('#validate-btn')).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test('oversized decompression fragment is rejected before touching editors', async ({ page, context }) => {
  await page.goto('.');
  const bomb = await page.evaluate(async () => {
    const huge = 'A'.repeat(10_000_000);
    const stream = new Blob([huge]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  const url = new URL(page.url());
  url.hash = bomb;
  const page2 = await context.newPage();
  await page2.goto(url.toString());
  await waitReady(page2);
  await expect(page2.locator('#notice-text')).toContainText('too large');
  await expect(page2.locator('#validate-btn')).toBeEnabled();
});

test('malicious fragment options never reach pySHACL; XSS payloads render as literal text', async ({
  page,
}) => {
  const state = {
    shapes:
      '@prefix ex: <http://example.org/> .\n' +
      '@prefix sh: <http://www.w3.org/ns/shacl#> .\n' +
      'ex:S a sh:NodeShape ; sh:targetNode ex:Evil ; sh:property [ sh:path ex:missing ; sh:minCount 1 ; ' +
      'sh:message "<img src=x onerror=alert(1)>" ] .',
    data:
      '@prefix ex: <http://example.org/> .\n' + '<javascript:alert(1)> a ex:Evil .',
    shapesFormat: 'turtle',
    dataFormat: 'turtle',
    options: {
      inference: 'none',
      advanced: true,
      do_owl_imports: true,
      ont_graph: 'https://attacker.example/x.ttl',
      __proto__: { polluted: true },
    },
  };
  const fragment = await base64UrlOf(page, JSON.stringify(state));
  await page.goto('.#' + fragment);
  await waitReady(page);
  await page.locator('#validate-btn').click();
  await waitValidated(page);

  const lastRunOptions = await page.evaluate(() => (window as any).__lastRunOptions);
  expect(Object.keys(lastRunOptions).sort()).toEqual(
    ['advanced', 'allowInfos', 'allowWarnings', 'inference', 'metaShacl'].sort(),
  );
  expect(lastRunOptions.do_owl_imports).toBeUndefined();
  expect(lastRunOptions.ont_graph).toBeUndefined();

  const pollutionCheck = await page.evaluate(() => (({}) as any).polluted);
  expect(pollutionCheck).toBeUndefined();

  expect(await page.locator('#report-pane img').count()).toBe(0);
  expect(await page.locator('#report-pane a[href^="javascript:"]').count()).toBe(0);
  const cardsText = await page.locator('#tab-cards').textContent();
  expect(cardsText).toContain('<img src=x onerror=alert(1)>');
});

test('ReDoS sh:pattern is terminated at the 10s cap, then the app validates again', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('.');
  await waitReady(page);

  const shapes = page.locator('#shapes-editor-host .cm-content');
  const data = page.locator('#data-editor-host .cm-content');
  await shapes.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type(
    '@prefix ex: <http://example.org/> . @prefix sh: <http://www.w3.org/ns/shacl#> . ' +
      'ex:S a sh:NodeShape ; sh:targetNode ex:X ; sh:property [ sh:path ex:val ; sh:pattern "(a+)+$" ] .',
  );
  await data.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.type(`@prefix ex: <http://example.org/> . ex:X ex:val "${'a'.repeat(40)}b" .`);
  await page.locator('#validate-btn').click();

  await page.waitForFunction(
    () => document.querySelector('#run-status')?.textContent?.includes('stopped'),
    undefined,
    { timeout: 20_000 },
  );
  await expect(page.locator('body')).toBeVisible();

  await page.locator('#examples-select').selectOption('1');
  await waitValidated(page);
  await expect(page.locator('#conforms-banner')).toContainText('Does not conform');
});
