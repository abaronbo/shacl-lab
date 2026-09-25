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

async function openSessionFile(page: Page, name: string, body: Buffer | string): Promise<void> {
  const buffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  await page.locator('#open-file').setInputFiles({ name, mimeType: 'application/json', buffer });
}

test('session file round trip: download, clear, open, no auto-run, then Validate reproduces the result', async ({
  page,
}) => {
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'sh:sparql constraint' });
  await waitValidated(page);
  const originalBanner = await page.locator('#conforms-banner').textContent();
  const originalCards = await page.locator('#tab-cards').textContent();
  const shapesText = await page.locator('#shapes-editor-host .cm-content').textContent();
  const shapesFormat = await page.locator('#shapes-format').inputValue();
  const dataFormat = await page.locator('#data-format').inputValue();
  const advanced = await page.locator('#opt-advanced').isChecked();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('shacl-session.json');
  await expect(page.locator('#share-status')).toHaveText('Session downloaded');

  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const fileBody = Buffer.concat(chunks);
  const parsed = JSON.parse(fileBody.toString('utf8'));
  expect(parsed.version).toBe(1);
  expect(parsed.shapesFormat).toBe(shapesFormat);
  expect(parsed.dataFormat).toBe(dataFormat);
  expect(parsed.options.advanced).toBe(advanced);
  expect(parsed.shapes).toContain('sh:sparql');

  await page.locator('#clear-btn').click();
  expect(await page.locator('#shapes-editor-host .cm-content').textContent()).toBe('');
  // The setting lives in the settings menu; open it to flip the checkbox.
  await page.locator('#settings-btn').click();
  await page.locator('#opt-advanced').setChecked(!advanced);
  await page.keyboard.press('Escape');

  await openSessionFile(page, 'shacl-session.json', fileBody);
  await expect(page.locator('#share-status')).toHaveText('Session loaded');
  expect(await page.locator('#shapes-editor-host .cm-content').textContent()).toBe(shapesText);
  expect(await page.locator('#shapes-format').inputValue()).toBe(shapesFormat);
  expect(await page.locator('#data-format').inputValue()).toBe(dataFormat);
  expect(await page.locator('#opt-advanced').isChecked()).toBe(advanced);
  await expect(page.locator('#notice-banner')).toBeHidden();
  await expect(page.locator('#examples-select')).toHaveValue('');

  // Like a shared link: parse checks only, no validation until the user asks.
  await page.waitForTimeout(1000);
  await expect(page.locator('#conforms-banner')).toContainText('Not yet validated');

  await page.locator('#validate-btn').click();
  await waitValidated(page);
  expect(await page.locator('#conforms-banner').textContent()).toBe(originalBanner);
  const normalize = (text: string | null) => (text ?? '').replace(/n[0-9a-f]{20,}/g, '<bnode>');
  expect(normalize(await page.locator('#tab-cards').textContent())).toBe(normalize(originalCards));
});

test('malformed session file shows a notice and leaves the editors untouched', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('.');
  await waitReady(page);
  await page.locator('#examples-select').selectOption({ label: 'sh:sparql constraint' });
  await waitValidated(page);
  const shapesText = await page.locator('#shapes-editor-host .cm-content').textContent();

  await openSessionFile(page, 'broken.json', '{"shapes": "unterminated');
  await expect(page.locator('#notice-text')).toContainText('session file is malformed');
  expect(await page.locator('#shapes-editor-host .cm-content').textContent()).toBe(shapesText);

  // A file that is valid JSON but not an object is rejected the same way.
  await openSessionFile(page, 'array.json', '[1, 2, 3]');
  await expect(page.locator('#notice-text')).toContainText('session file is malformed');
  expect(pageErrors).toEqual([]);
});

test('oversized session file is rejected before it is read; hostile fields are sanitized', async ({
  page,
}) => {
  await page.goto('.');
  await waitReady(page);

  const huge = Buffer.alloc(2 * 1024 * 1024 + 1, 0x20);
  await openSessionFile(page, 'huge.json', huge);
  await expect(page.locator('#notice-text')).toContainText('session file is too large');

  // Written as raw text: a `__proto__` key in a JS object literal sets the
  // literal's prototype instead of producing a key, so JSON.stringify would
  // silently drop the very thing this test is about.
  const hostile = `{
    "shapes": "<img src=x onerror=alert(1)>",
    "data": "",
    "shapesFormat": "evil",
    "dataFormat": "json-ld",
    "options": { "inference": "rm -rf /", "advanced": "yes", "__proto__": { "polluted": true } },
    "__proto__": { "polluted": true },
    "constructor": { "prototype": { "polluted": true } }
  }`;
  await openSessionFile(page, 'hostile.json', hostile);
  await expect(page.locator('#share-status')).toHaveText('Session loaded');
  expect(await page.locator('#shapes-format').inputValue()).toBe('turtle');
  expect(await page.locator('#data-format').inputValue()).toBe('json-ld');
  expect(await page.locator('#opt-inference').inputValue()).toBe('none');
  expect(await page.locator('#opt-advanced').isChecked()).toBe(true);
  expect(await page.locator('#shapes-editor-host .cm-content').textContent()).toBe(
    '<img src=x onerror=alert(1)>',
  );
  expect(await page.evaluate(() => (({}) as any).polluted)).toBeUndefined();
});
