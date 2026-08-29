import { SHAPES_TTL, DATA_CONFORMING_TTL, DATA_VIOLATING_TTL } from './fixtures';
import type { ValidationResult } from './worker';
import {
  DEFAULT_OPTIONS,
  sanitizeFormat,
  sanitizeOptions,
  sanitizeReportFormat,
  type Format,
  type Options,
  type ReportFormat,
} from './options';
import { decodeFragment, encodeState, type PermalinkState } from './permalink';
import { EXAMPLES } from './examples';
import { createEditor, type PaneEditor } from './editor';
import { el, setText, clear } from './dom';
import { WorkerClient } from './worker-client';
import { ValidateRunner } from './validate-runner';

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
    __lastRunOptions?: Options;
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

if (new URLSearchParams(location.search).has('spike')) {
  runSpikeMode();
} else {
  void runApp();
}

// Slice 1 spike mode, preserved behind ?spike for tests/spike.spec.ts: boots
// the worker, runs the two fixtures, exposes the outcome on
// window.__spikeResult, and renders it as plain text (textContent only).
function runSpikeMode(): void {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  clear(app);
  const out = el('pre', { id: 'out' });
  app.appendChild(out);
  const show = () => setText(out, JSON.stringify(window.__spikeResult, null, 2));

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
        reportFormat: 'turtle',
        options: DEFAULT_OPTIONS,
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
}

type InitialState = {
  shapes: string;
  data: string;
  shapesFormat: Format;
  dataFormat: Format;
  options: Options;
  reportFormat: ReportFormat;
};

function fixtureState(): InitialState {
  return {
    shapes: SHAPES_TTL,
    data: DATA_CONFORMING_TTL,
    shapesFormat: 'turtle',
    dataFormat: 'turtle',
    options: DEFAULT_OPTIONS,
    reportFormat: 'turtle',
  };
}

function emptyState(): InitialState {
  return {
    shapes: '',
    data: '',
    shapesFormat: 'turtle',
    dataFormat: 'turtle',
    options: DEFAULT_OPTIONS,
    reportFormat: 'turtle',
  };
}

async function resolveInitialState(): Promise<{
  initial: InitialState;
  fromFragment: boolean;
  fragmentError: string | null;
}> {
  const fragment = location.hash.slice(1);
  if (!fragment) return { initial: fixtureState(), fromFragment: false, fragmentError: null };

  const decoded = await decodeFragment(fragment);
  if (!decoded.ok) {
    return { initial: emptyState(), fromFragment: false, fragmentError: decoded.error };
  }
  const state = decoded.state;
  return {
    initial: {
      shapes: state.shapes,
      data: state.data,
      shapesFormat: state.shapesFormat,
      dataFormat: state.dataFormat,
      options: state.options,
      reportFormat: 'turtle',
    },
    fromFragment: true,
    fragmentError: null,
  };
}

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const DEBOUNCE_MS = 600;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

async function runApp(): Promise<void> {
  // Clear a stale hash before it's ever re-derived from typing — Share only
  // ever writes it back explicitly (Security #13).
  const { initial, fromFragment, fragmentError } = await resolveInitialState();

  const bootBanner = document.querySelector<HTMLDivElement>('#boot-banner')!;
  const noticeBanner = document.querySelector<HTMLDivElement>('#notice-banner')!;
  const noticeText = document.querySelector<HTMLSpanElement>('#notice-text')!;
  const noticeDismiss = document.querySelector<HTMLButtonElement>('#notice-dismiss')!;
  const runStatus = document.querySelector<HTMLDivElement>('#run-status')!;
  const conformsBanner = document.querySelector<HTMLDivElement>('#conforms-banner')!;
  const shapesErrorEl = document.querySelector<HTMLDivElement>('#shapes-error')!;
  const dataErrorEl = document.querySelector<HTMLDivElement>('#data-error')!;
  const shapesFormatSelect = document.querySelector<HTMLSelectElement>('#shapes-format')!;
  const dataFormatSelect = document.querySelector<HTMLSelectElement>('#data-format')!;
  const reportFormatSelect = document.querySelector<HTMLSelectElement>('#report-format')!;
  const settingsBtn = document.querySelector<HTMLButtonElement>('#settings-btn')!;
  const settingsMenu = document.querySelector<HTMLDivElement>('#settings-menu')!;
  const inferenceSelect = document.querySelector<HTMLSelectElement>('#opt-inference')!;
  const advancedCheckbox = document.querySelector<HTMLInputElement>('#opt-advanced')!;
  const metaShaclCheckbox = document.querySelector<HTMLInputElement>('#opt-meta-shacl')!;
  const allowInfosCheckbox = document.querySelector<HTMLInputElement>('#opt-allow-infos')!;
  const allowWarningsCheckbox = document.querySelector<HTMLInputElement>('#opt-allow-warnings')!;
  const examplesSelect = document.querySelector<HTMLSelectElement>('#examples-select')!;
  const validateBtn = document.querySelector<HTMLButtonElement>('#validate-btn')!;
  const shareBtn = document.querySelector<HTMLButtonElement>('#share-btn')!;
  const shareStatus = document.querySelector<HTMLSpanElement>('#share-status')!;
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-button'));
  const tabCards = document.querySelector<HTMLDivElement>('#tab-cards')!;
  const tabText = document.querySelector<HTMLDivElement>('#tab-text')!;
  const tabGraph = document.querySelector<HTMLDivElement>('#tab-graph')!;
  const reportTextEl = document.querySelector<HTMLPreElement>('#report-text')!;
  const reportGraphEl = document.querySelector<HTMLPreElement>('#report-graph')!;

  const state = {
    shapesFormat: initial.shapesFormat,
    dataFormat: initial.dataFormat,
    options: initial.options,
    reportFormat: initial.reportFormat,
    autoValidateEnabled: !fromFragment,
    stale: false,
  };

  shapesFormatSelect.value = state.shapesFormat;
  dataFormatSelect.value = state.dataFormat;
  reportFormatSelect.value = state.reportFormat;
  inferenceSelect.value = state.options.inference;
  advancedCheckbox.checked = state.options.advanced;
  metaShaclCheckbox.checked = state.options.metaShacl;
  allowInfosCheckbox.checked = state.options.allowInfos;
  allowWarningsCheckbox.checked = state.options.allowWarnings;

  for (const [i, example] of EXAMPLES.entries()) {
    const opt = el('option', { value: String(i) }, [example.name]);
    examplesSelect.appendChild(opt);
  }

  function setSettingsOpen(open: boolean): void {
    settingsMenu.hidden = !open;
    settingsBtn.setAttribute('aria-expanded', String(open));
  }
  settingsBtn.addEventListener('click', () => setSettingsOpen(Boolean(settingsMenu.hidden)));
  document.addEventListener('pointerdown', (event) => {
    if (settingsMenu.hidden) return;
    const target = event.target;
    if (target instanceof Node && !settingsMenu.contains(target) && !settingsBtn.contains(target)) {
      setSettingsOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !settingsMenu.hidden) {
      setSettingsOpen(false);
      settingsBtn.focus();
    }
  });

  function showNotice(message: string): void {
    setText(noticeText, message);
    noticeBanner.hidden = false;
  }
  noticeDismiss.addEventListener('click', () => {
    noticeBanner.hidden = true;
  });

  if (fragmentError) {
    showNotice(fragmentError);
  }

  function currentOptions(): Options {
    return sanitizeOptions({
      inference: inferenceSelect.value,
      advanced: advancedCheckbox.checked,
      metaShacl: metaShaclCheckbox.checked,
      allowInfos: allowInfosCheckbox.checked,
      allowWarnings: allowWarningsCheckbox.checked,
    });
  }

  function showPaneError(target: HTMLDivElement, message: string | null): void {
    if (message) {
      setText(target, message);
      target.hidden = false;
    } else {
      target.hidden = true;
      setText(target, '');
    }
  }

  function markStale(): void {
    state.stale = true;
    renderStaleIndicator();
  }

  function renderStaleIndicator(): void {
    const staleEl = conformsBanner.querySelector('.stale');
    if (state.stale) {
      if (!staleEl) {
        conformsBanner.appendChild(el('span', { class: 'stale' }, ['(stale — showing last valid result)']));
      }
    } else if (staleEl) {
      staleEl.remove();
    }
  }

  function renderResult(result: ValidationResult): void {
    state.stale = false;
    runStatus.hidden = true;
    setText(runStatus, '');

    conformsBanner.className = `conforms-banner ${result.conforms ? 'ok' : 'violation'}`;
    setText(
      conformsBanner,
      result.conforms
        ? 'Conforms'
        : `Does not conform — ${result.results.length} violation${result.results.length === 1 ? '' : 's'}`,
    );
    renderStaleIndicator();

    clear(tabCards);
    if (result.results.length === 0) {
      tabCards.appendChild(el('p', {}, ['No validation results.']));
    }
    for (const r of result.results) {
      const card = el('div', { class: 'result-card' });
      card.appendChild(el('div', { class: 'severity' }, [r.severity ?? 'unknown']));
      const dl = el('dl');
      const field = (label: string, value: string | null) => {
        dl.appendChild(el('dt', {}, [label]));
        dl.appendChild(el('dd', {}, [value ?? '—']));
      };
      field('Focus node', r.focusNode);
      field('Result path', r.resultPath);
      field('Message', r.message);
      field('Source shape', r.sourceShape);
      field('Source constraint', r.sourceConstraintComponent);
      field('Value', r.value);
      card.appendChild(dl);
      tabCards.appendChild(card);
    }

    setText(reportTextEl, result.text);
    setText(reportGraphEl, result.reportGraph);
  }

  function renderRunError(message: string): void {
    markStale();
    runStatus.hidden = false;
    setText(runStatus, `Validation error: ${message}`);
  }

  function renderTimeout(): void {
    markStale();
    runStatus.hidden = false;
    setText(runStatus, 'validation exceeded the time limit and was stopped');
  }

  const client = new WorkerClient(
    (ready) => {
      bootBanner.hidden = ready;
      if (!ready) {
        setText(bootBanner, 'Loading Python runtime (~10 MB, cached after first visit)…');
      }
    },
    (message) => {
      bootBanner.hidden = false;
      setText(bootBanner, `Failed to start the validation runtime: ${message}`);
    },
  );
  const validateRunner = new ValidateRunner(client);

  let debounceHandle: number | undefined;
  function scheduleAutoRun(): void {
    window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(() => {
      void runPipeline(false);
    }, DEBOUNCE_MS);
  }

  async function runPipeline(forceValidate: boolean): Promise<void> {
    const shapesText = shapesEditor.getValue();
    const dataText = dataEditor.getValue();

    if (byteLength(shapesText) > MAX_INPUT_BYTES) {
      showPaneError(shapesErrorEl, 'Shapes input exceeds the 2MB limit.');
      markStale();
      return;
    }
    if (byteLength(dataText) > MAX_INPUT_BYTES) {
      showPaneError(dataErrorEl, 'Data input exceeds the 2MB limit.');
      markStale();
      return;
    }

    let shapesParse: { ok: boolean; error: string | null };
    let dataParse: { ok: boolean; error: string | null };
    try {
      [shapesParse, dataParse] = await Promise.all([
        client.send<{ ok: boolean; error: string | null }>({
          type: 'parse',
          text: shapesText,
          format: state.shapesFormat,
        }),
        client.send<{ ok: boolean; error: string | null }>({
          type: 'parse',
          text: dataText,
          format: state.dataFormat,
        }),
      ]);
    } catch {
      // Worker was terminated mid-check (hard-cap breach elsewhere); the
      // next edit or Validate click retries against the respawned worker.
      return;
    }

    showPaneError(shapesErrorEl, shapesParse.ok ? null : shapesParse.error);
    showPaneError(dataErrorEl, dataParse.ok ? null : dataParse.error);

    if (!shapesParse.ok || !dataParse.ok) {
      markStale();
      return;
    }

    if (!forceValidate && !state.autoValidateEnabled) return;

    state.options = currentOptions();
    window.__lastRunOptions = state.options;
    validateRunner.run({
      request: {
        data: dataText,
        dataFormat: state.dataFormat,
        shapes: shapesText,
        shapesFormat: state.shapesFormat,
        reportFormat: state.reportFormat,
        options: state.options,
      },
      onResult: renderResult,
      onError: renderRunError,
      onTimeout: renderTimeout,
    });
  }

  const shapesEditor: PaneEditor = createEditor(
    document.querySelector('#shapes-editor-host')!,
    initial.shapes,
    initial.shapesFormat,
    () => scheduleAutoRun(),
  );
  const dataEditor: PaneEditor = createEditor(
    document.querySelector('#data-editor-host')!,
    initial.data,
    initial.dataFormat,
    () => scheduleAutoRun(),
  );

  shapesFormatSelect.addEventListener('change', () => {
    state.shapesFormat = sanitizeFormat(shapesFormatSelect.value);
    shapesEditor.setFormat(state.shapesFormat);
    void runPipeline(false);
  });
  dataFormatSelect.addEventListener('change', () => {
    state.dataFormat = sanitizeFormat(dataFormatSelect.value);
    dataEditor.setFormat(state.dataFormat);
    void runPipeline(false);
  });
  reportFormatSelect.addEventListener('change', () => {
    state.reportFormat = sanitizeReportFormat(reportFormatSelect.value);
    void runPipeline(false);
  });
  for (const control of [
    inferenceSelect,
    advancedCheckbox,
    metaShaclCheckbox,
    allowInfosCheckbox,
    allowWarningsCheckbox,
  ]) {
    control.addEventListener('change', () => void runPipeline(false));
  }

  validateBtn.addEventListener('click', () => {
    state.autoValidateEnabled = true;
    void runPipeline(true);
  });

  shareBtn.addEventListener('click', () => void handleShare());
  async function handleShare(): Promise<void> {
    const permalinkState: PermalinkState = {
      shapes: shapesEditor.getValue(),
      data: dataEditor.getValue(),
      shapesFormat: state.shapesFormat,
      dataFormat: state.dataFormat,
      options: currentOptions(),
    };
    const fragment = await encodeState(permalinkState);
    const url = new URL(location.href);
    url.hash = fragment;
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      setText(shareStatus, 'Copied to clipboard');
    } catch {
      setText(shareStatus, 'Link updated — copy it from the address bar');
    }
    window.setTimeout(() => setText(shareStatus, ''), 4000);
  }

  examplesSelect.addEventListener('change', () => {
    const idx = examplesSelect.value;
    if (idx === '') return;
    const example = EXAMPLES[Number(idx)];
    if (!example) return;

    noticeBanner.hidden = true;
    state.shapesFormat = example.shapesFormat;
    state.dataFormat = example.dataFormat;
    state.options = example.options;
    state.autoValidateEnabled = true;

    shapesFormatSelect.value = state.shapesFormat;
    dataFormatSelect.value = state.dataFormat;
    inferenceSelect.value = state.options.inference;
    advancedCheckbox.checked = state.options.advanced;
    metaShaclCheckbox.checked = state.options.metaShacl;
    allowInfosCheckbox.checked = state.options.allowInfos;
    allowWarningsCheckbox.checked = state.options.allowWarnings;

    shapesEditor.setFormat(state.shapesFormat);
    dataEditor.setFormat(state.dataFormat);
    shapesEditor.setValue(example.shapes);
    dataEditor.setValue(example.data);

    void runPipeline(true);
  });

  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      for (const b of tabButtons) b.classList.toggle('active', b === button);
      tabCards.hidden = button.dataset.tab !== 'cards';
      tabText.hidden = button.dataset.tab !== 'text';
      tabGraph.hidden = button.dataset.tab !== 'graph';
    });
  }

  conformsBanner.className = 'conforms-banner';
  setText(conformsBanner, 'Not yet validated.');

  void runPipeline(false);
}
