import { test, expect } from '@playwright/test';

const SH = 'http://www.w3.org/ns/shacl#';
const EX = 'http://example.org/';

// Envelope budgets (plan Slice 1): breach = failure, not a note.
const BUDGET_TRANSFER_BYTES = 25 * 1024 * 1024;
const BUDGET_BOOT_MS = 30_000;
const BUDGET_VALIDATE_MS = 5_000;

test('pySHACL-in-Pyodide spike: SHACL-SPARQL fixtures, budgets, no 404s, no CSP violations', async ({
  page,
}) => {
  const notFound: string[] = [];
  const cspViolations: string[] = [];
  let transferred = 0;

  page.on('response', async (res) => {
    if (res.status() === 404) notFound.push(res.url());
    try {
      transferred += (await res.body()).length;
    } catch {
      // response bodies of redirects/aborted requests aren't retrievable
    }
  });
  page.on('console', (msg) => {
    if (/Content[- ]Security[- ]Policy|Trusted ?Types?/i.test(msg.text())) {
      cspViolations.push(msg.text());
    }
  });

  await page.goto('./?spike');
  await page.waitForFunction(
    () => ['done', 'failed'].includes((window as any).__spikeResult?.status),
    undefined,
    { timeout: 110_000 },
  );
  const spike = await page.evaluate(() => (window as any).__spikeResult);

  expect(spike.status, spike.error ?? '').toBe('done');

  // Fixture (a): exactly 2 results — one from the sh:sparql constraint on
  // ex:Alice, one from the SPARQL-based target (advanced=True) on ex:Bob.
  const v = spike.violating;
  expect(v.conforms).toBe(false);
  expect(v.results).toHaveLength(2);

  const sparqlResult = v.results.find(
    (r: any) => r.sourceConstraintComponent === `${SH}SPARQLConstraintComponent`,
  );
  expect(sparqlResult).toBeTruthy();
  expect(sparqlResult.focusNode).toBe(`${EX}Alice`);
  expect(sparqlResult.message).toBe('Death date must not precede birth date');

  const targetResult = v.results.find(
    (r: any) => r.sourceConstraintComponent === `${SH}MinCountConstraintComponent`,
  );
  expect(targetResult).toBeTruthy();
  expect(targetResult.focusNode).toBe(`${EX}Bob`);
  expect(targetResult.resultPath).toBe(`${EX}reports`);

  // Fixture (b): conforming data.
  expect(spike.conforming.conforms).toBe(true);
  expect(spike.conforming.results).toHaveLength(0);

  // Sub-path build integrity + security preconditions.
  expect(notFound, `404s: ${notFound.join(', ')}`).toHaveLength(0);
  expect(cspViolations, cspViolations.join('\n')).toHaveLength(0);

  // Budgets.
  expect(transferred).toBeLessThanOrEqual(BUDGET_TRANSFER_BYTES);
  expect(spike.bootMs).toBeLessThanOrEqual(BUDGET_BOOT_MS);
  expect(spike.validateMs).toBeLessThanOrEqual(BUDGET_VALIDATE_MS);

  console.log(
    `spike metrics: boot ${spike.bootMs}ms, validate ${spike.validateMs}ms, ` +
      `transfer ${(transferred / 1024 / 1024).toFixed(1)}MB`,
  );
});
