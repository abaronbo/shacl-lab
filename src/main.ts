import { SHAPES_TTL, DATA_CONFORMING_TTL, DATA_VIOLATING_TTL } from './fixtures';
import type { InferenceResult, ValidationResult } from './worker';
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
import { el, setText, clear, text } from './dom';
import { specLinkFor } from './spec-links';
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
  // No fragment: start with an empty canvas.
  if (!fragment) return { initial: emptyState(), fromFragment: false, fragmentError: null };

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

// Textual spellings under which an IRI may appear in an editor document: a
// prefixed name per the document's own @prefix declarations, or the full
// <iri>. Blank node labels match neither and simply won't be found.
function spellingsFor(iri: string, documentText: string): string[] {
  const spellings: string[] = [];
  const prefixRe = /@prefix\s+([A-Za-z][\w.-]*)?:\s*<([^>]*)>/g;
  for (const match of documentText.matchAll(prefixRe)) {
    const prefix = match[1] ?? '';
    const ns = match[2];
    if (ns && iri.startsWith(ns) && iri.length > ns.length) {
      spellings.push(`${prefix}:${iri.slice(ns.length)}`);
    }
  }
  spellings.push(`<${iri}>`);
  return spellings;
}

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
  const exampleDesc = document.querySelector<HTMLDivElement>('#example-desc')!;
  const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!;
  const validateBtn = document.querySelector<HTMLButtonElement>('#validate-btn')!;
  const shareBtn = document.querySelector<HTMLButtonElement>('#share-btn')!;
  const shareStatus = document.querySelector<HTMLSpanElement>('#share-status')!;
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-button'));
  const tabValidation = document.querySelector<HTMLDivElement>('#tab-validation')!;
  const tabInferred = document.querySelector<HTMLDivElement>('#tab-inferred')!;
  const reportViewSelect = document.querySelector<HTMLSelectElement>('#report-view')!;
  const tabCards = document.querySelector<HTMLDivElement>('#tab-cards')!;
  const tabText = document.querySelector<HTMLDivElement>('#tab-text')!;
  const tabGraph = document.querySelector<HTMLDivElement>('#tab-graph')!;
  const reportTextEl = document.querySelector<HTMLPreElement>('#report-text')!;
  const reportGraphEl = document.querySelector<HTMLPreElement>('#report-graph')!;
  const inferredStatusEl = document.querySelector<HTMLDivElement>('#inferred-status')!;
  const inferredGraphEl = document.querySelector<HTMLPreElement>('#inferred-graph')!;

  const state = {
    shapesFormat: initial.shapesFormat,
    dataFormat: initial.dataFormat,
    options: initial.options,
    reportFormat: initial.reportFormat,
    autoValidateEnabled: !fromFragment,
    stale: false,
    // Whether a validation result has ever been rendered; the stale tag is
    // meaningless (and misleading) before the first one.
    hasResult: false,
  };

  shapesFormatSelect.value = state.shapesFormat;
  dataFormatSelect.value = state.dataFormat;
  reportFormatSelect.value = state.reportFormat;
  inferenceSelect.value = state.options.inference;
  advancedCheckbox.checked = state.options.advanced;
  metaShaclCheckbox.checked = state.options.metaShacl;
  allowInfosCheckbox.checked = state.options.allowInfos;
  allowWarningsCheckbox.checked = state.options.allowWarnings;

  const exampleGroups = new Map<string, HTMLOptGroupElement>();
  for (const [i, example] of EXAMPLES.entries()) {
    let groupEl = exampleGroups.get(example.group);
    if (!groupEl) {
      groupEl = el('optgroup', { label: example.group });
      exampleGroups.set(example.group, groupEl);
      examplesSelect.appendChild(groupEl);
    }
    groupEl.appendChild(el('option', { value: String(i) }, [example.name]));
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
    if (state.stale && state.hasResult) {
      if (!staleEl) {
        conformsBanner.appendChild(el('span', { class: 'stale' }, ['(stale — showing last valid result)']));
      }
    } else if (staleEl) {
      staleEl.remove();
    }
  }

  function renderResult(result: ValidationResult): void {
    state.stale = false;
    state.hasResult = true;
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
      const card = el('div', {
        class: 'result-card',
        title: 'Click to locate the focus node and source shape in the editors',
      });
      card.addEventListener('click', (event) => {
        // Leave clicks on the spec link alone.
        if (event.target instanceof Element && event.target.closest('a')) return;
        if (r.focusNode) dataEditor.locate(spellingsFor(r.focusNode, dataEditor.getValue()));
        if (r.sourceShape) {
          shapesEditor.locate(spellingsFor(r.sourceShape, shapesEditor.getValue()));
        }
      });
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
      dl.appendChild(el('dt', {}, ['Source constraint']));
      // Static allowlist lookup — report content itself never becomes a href.
      const specUrl = r.sourceConstraintComponent
        ? specLinkFor(r.sourceConstraintComponent)
        : null;
      const constraintValue =
        specUrl && r.sourceConstraintComponent
          ? el(
              'a',
              { href: specUrl, target: '_blank', rel: 'noreferrer noopener', class: 'spec-link' },
              [r.sourceConstraintComponent],
            )
          : text(r.sourceConstraintComponent ?? '—');
      dl.appendChild(el('dd', {}, [constraintValue]));
      field('Value', r.value);
      card.appendChild(dl);
      tabCards.appendChild(card);
    }

    setText(reportTextEl, result.text);
    setText(reportGraphEl, result.reportGraph);
    renderInferencePart(result.inference);
  }

  function renderInferencePart(inference: InferenceResult | undefined): void {
    if (!inference) {
      markInferredStale();
      return;
    }
    if ('error' in inference) {
      setText(inferredStatusEl, `Inference error: ${inference.error}`);
      setText(inferredGraphEl, '');
    } else {
      setText(
        inferredStatusEl,
        inference.inferredCount === 0
          ? 'No new triples were inferred.'
          : `${inference.inferredCount} new triple${inference.inferredCount === 1 ? '' : 's'} inferred — data graph now has ${inference.totalCount} triples in total.`,
      );
      setText(inferredGraphEl, inference.inferredGraph);
    }
  }

  const INFERRED_STALE_PREFIX = '(stale — showing the previous run) ';

  function markInferredStale(): void {
    const current = inferredStatusEl.textContent ?? '';
    if (!current.startsWith(INFERRED_STALE_PREFIX)) {
      setText(inferredStatusEl, `${INFERRED_STALE_PREFIX}${current}`);
    }
  }

  function renderRunError(message: string, inference?: InferenceResult): void {
    markStale();
    runStatus.hidden = false;
    setText(runStatus, `Validation error: ${message}`);
    renderInferencePart(inference);
  }

  function renderTimeout(): void {
    markStale();
    markInferredStale();
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

  // Bumped by Clear so parse results that were in flight for discarded
  // content never repaint the reset panes.
  let inputEpoch = 0;

  // Byte caps + per-pane parse checks; returns the editor texts only when
  // both panes are parseable.
  async function checkInputs(): Promise<{ shapesText: string; dataText: string } | null> {
    const epoch = inputEpoch;
    const shapesText = shapesEditor.getValue();
    const dataText = dataEditor.getValue();

    if (byteLength(shapesText) > MAX_INPUT_BYTES) {
      showPaneError(shapesErrorEl, 'Shapes input exceeds the 2MB limit.');
      markStale();
      return null;
    }
    if (byteLength(dataText) > MAX_INPUT_BYTES) {
      showPaneError(dataErrorEl, 'Data input exceeds the 2MB limit.');
      markStale();
      return null;
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
      return null;
    }
    if (epoch !== inputEpoch) return null;

    showPaneError(shapesErrorEl, shapesParse.ok ? null : shapesParse.error);
    showPaneError(dataErrorEl, dataParse.ok ? null : dataParse.error);

    if (!shapesParse.ok || !dataParse.ok) {
      markStale();
      return null;
    }

    return { shapesText, dataText };
  }

  async function runPipeline(forceValidate: boolean): Promise<void> {
    const inputs = await checkInputs();
    if (!inputs) return;

    if (!forceValidate && !state.autoValidateEnabled) return;

    state.options = currentOptions();
    window.__lastRunOptions = state.options;
    validateRunner.run<ValidationResult>({
      request: {
        type: 'validate',
        data: inputs.dataText,
        dataFormat: state.dataFormat,
        shapes: inputs.shapesText,
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
    setText(exampleDesc, example.description);
    exampleDesc.hidden = false;
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

  function activateTab(name: string): void {
    for (const b of tabButtons) b.classList.toggle('active', b.dataset.tab === name);
    tabValidation.hidden = name !== 'validation';
    tabInferred.hidden = name !== 'inferred';
  }
  for (const button of tabButtons) {
    button.addEventListener('click', () => activateTab(button.dataset.tab!));
  }

  function applyReportView(): void {
    const view = reportViewSelect.value;
    tabCards.hidden = view !== 'cards';
    tabText.hidden = view !== 'text';
    tabGraph.hidden = view !== 'graph';
    reportFormatSelect.hidden = view !== 'graph';
  }
  reportViewSelect.addEventListener('change', applyReportView);
  applyReportView();

  function resetReportPane(): void {
    conformsBanner.className = 'conforms-banner';
    setText(conformsBanner, 'Not yet validated.');
    runStatus.hidden = true;
    setText(runStatus, '');
    clear(tabCards);
    setText(reportTextEl, '');
    setText(reportGraphEl, '');
    setText(inferredStatusEl, '');
    setText(inferredGraphEl, '');
    showPaneError(shapesErrorEl, null);
    showPaneError(dataErrorEl, null);
  }

  clearBtn.addEventListener('click', () => {
    shapesEditor.setValue('');
    dataEditor.setValue('');
    examplesSelect.value = '';
    exampleDesc.hidden = true;
    setText(exampleDesc, '');
    state.options = Object.assign(Object.create(null), DEFAULT_OPTIONS);
    inferenceSelect.value = state.options.inference;
    advancedCheckbox.checked = state.options.advanced;
    metaShaclCheckbox.checked = state.options.metaShacl;
    allowInfosCheckbox.checked = state.options.allowInfos;
    allowWarningsCheckbox.checked = state.options.allowWarnings;
    state.autoValidateEnabled = true;
    state.stale = false;
    state.hasResult = false;
    // setValue('') schedules a debounced auto-run on an empty canvas; cancel
    // it, discard any in-flight run and stale parse checks, and present the
    // untouched initial state.
    window.clearTimeout(debounceHandle);
    validateRunner.cancel();
    inputEpoch++;
    resetReportPane();
  });

  resetReportPane();

  // An empty canvas stays quiet until the user types, picks an example, or
  // clicks Validate; anything pre-filled (a shared link) still gets its
  // parse checks.
  if (shapesEditor.getValue() !== '' || dataEditor.getValue() !== '') {
    void runPipeline(false);
  }
}
