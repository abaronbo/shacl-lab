// Slice 1 spike page: boots the validation worker, runs the two fixtures,
// exposes the outcome on window.__spikeResult for the Playwright harness,
// and renders it as plain text (textContent only — see Security #5).
import { SHAPES_TTL, DATA_VIOLATING_TTL, DATA_CONFORMING_TTL } from './fixtures';
import type { ValidationResult } from './worker';

declare global {
  interface Window {
    __spikeResult?: {
      status: 'booting' | 'ready' | 'done' | 'failed';
      bootMs?: number;
      validateMs?: number;
      error?: string;
      violating?: ValidationResult;
      conforming?: ValidationResult;
    };
  }
}

// CSP sets `require-trusted-types-for 'script'`, which gates even
// `new Worker(url)`. This default policy admits only same-origin script URLs
// (and no HTML at all), so the Trusted Types guarantee stays meaningful.
const tt = (window as any).trustedTypes;
if (tt?.createPolicy) {
  tt.createPolicy('default', {
    createScriptURL: (url: string) => {
      if (new URL(url, location.href).origin !== location.origin) {
        throw new TypeError(`Blocked cross-origin script URL: ${url}`);
      }
      return url;
    },
  });
}

const out = document.querySelector<HTMLPreElement>('#out')!;
const show = () => {
  out.textContent = JSON.stringify(window.__spikeResult, null, 2);
};

window.__spikeResult = { status: 'booting' };
show();

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const t0 = performance.now();

let nextId = 1;
function validate(data: string): Promise<ValidationResult> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const onMessage = (ev: MessageEvent) => {
      if (ev.data.id !== id) return;
      worker.removeEventListener('message', onMessage);
      if (ev.data.type === 'result') resolve(ev.data.result);
      else reject(new Error(ev.data.error));
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({
      type: 'validate',
      id,
      data,
      dataFormat: 'turtle',
      shapes: SHAPES_TTL,
      shapesFormat: 'turtle',
      options: {
        inference: 'none',
        advanced: true,
        metaShacl: false,
        allowInfos: false,
        allowWarnings: false,
      },
    });
  });
}

worker.addEventListener('message', async (ev: MessageEvent) => {
  if (ev.data.type === 'boot-error') {
    window.__spikeResult = { status: 'failed', error: ev.data.error };
    show();
    return;
  }
  if (ev.data.type !== 'ready') return;
  const bootMs = Math.round(performance.now() - t0);
  window.__spikeResult = { status: 'ready', bootMs };
  show();
  try {
    const t1 = performance.now();
    const violating = await validate(DATA_VIOLATING_TTL);
    const validateMs = Math.round(performance.now() - t1);
    const conforming = await validate(DATA_CONFORMING_TTL);
    window.__spikeResult = { status: 'done', bootMs, validateMs, violating, conforming };
  } catch (err) {
    window.__spikeResult = { status: 'failed', bootMs, error: String(err) };
  }
  show();
});
