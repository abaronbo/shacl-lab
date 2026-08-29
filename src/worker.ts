/// <reference lib="webworker" />
// Validation worker: boots self-hosted Pyodide, installs the vendored wheel
// set, locks down its own network globals, then serves validate/parse
// requests.
import { sanitizeOptions, sanitizeFormat, sanitizeReportFormat } from './options';

export type ValidateRequest = {
  type: 'validate';
  id: number;
  data: string;
  dataFormat: string;
  shapes: string;
  shapesFormat: string;
  reportFormat: string;
  options: {
    inference: 'none' | 'rdfs' | 'owlrl' | 'both';
    advanced: boolean;
    metaShacl: boolean;
    allowInfos: boolean;
    allowWarnings: boolean;
  };
};

export type ParseRequest = {
  type: 'parse';
  id: number;
  text: string;
  format: string;
};

export type WorkerRequest = ValidateRequest | ParseRequest;

export type ValidationResult = {
  conforms: boolean;
  results: Array<{
    severity: string | null;
    focusNode: string | null;
    resultPath: string | null;
    message: string | null;
    sourceShape: string | null;
    sourceConstraintComponent: string | null;
    value: string | null;
  }>;
  text: string;
  reportGraph: string;
};

const WHEELS = [
  'pyshacl-0.40.1-py3-none-any.whl',
  'rdflib-7.6.0-py3-none-any.whl',
  'owlrl-7.6.2-py3-none-any.whl',
  'html5rdf-1.2.1-py2.py3-none-any.whl',
  'prettytable-3.18.0-py3-none-any.whl',
  'wcwidth-0.8.3-py3-none-any.whl',
  'packaging-26.3-py3-none-any.whl',
  'pyparsing-3.3.2-py3-none-any.whl',
];

const PY_GLUE = `
import json
from rdflib import Graph
from rdflib.namespace import RDF, SH
from pyshacl import validate

def check_parse(text, fmt):
    try:
        Graph().parse(data=text, format=fmt)
        return json.dumps({"ok": True, "error": None})
    except Exception as e:
        return json.dumps({"ok": False, "error": str(e)})

def run_validation(data_text, data_format, shapes_text, shapes_format, report_format, options):
    options = options.to_py() if hasattr(options, "to_py") else options
    data_g = Graph().parse(data=data_text, format=data_format)
    shapes_g = Graph().parse(data=shapes_text, format=shapes_format)
    inference = options.get("inference", "none")
    conforms, rgraph, rtext = validate(
        data_g,
        shacl_graph=shapes_g,
        inference=inference if inference != "none" else None,
        advanced=bool(options.get("advanced", False)),
        meta_shacl=bool(options.get("metaShacl", False)),
        allow_infos=bool(options.get("allowInfos", False)),
        allow_warnings=bool(options.get("allowWarnings", False)),
    )
    results = []
    for r in rgraph.subjects(RDF.type, SH.ValidationResult):
        def term(p):
            v = rgraph.value(r, p)
            return str(v) if v is not None else None
        results.append({
            "severity": term(SH.resultSeverity),
            "focusNode": term(SH.focusNode),
            "resultPath": term(SH.resultPath),
            "message": term(SH.resultMessage),
            "sourceShape": term(SH.sourceShape),
            "sourceConstraintComponent": term(SH.sourceConstraintComponent),
            "value": term(SH.value),
        })
    results.sort(key=lambda x: (x["focusNode"] or "", x["sourceConstraintComponent"] or ""))
    report_graph = rgraph.serialize(format=report_format)
    return json.dumps({
        "conforms": bool(conforms),
        "results": results,
        "text": rtext,
        "reportGraph": report_graph,
    })
`;

function lockdownNetwork() {
  const deny = () => {
    throw new Error('Network access is disabled in the validation worker');
  };
  const g = self as unknown as Record<string, unknown>;
  g.fetch = deny;
  g.XMLHttpRequest = deny;
  g.WebSocket = deny;
  g.EventSource = deny;
}

async function boot() {
  const base = new URL(import.meta.env.BASE_URL, self.location.origin).href;
  const { loadPyodide } = await import(
    /* @vite-ignore */ new URL('pyodide/pyodide.mjs', base).href
  );
  const pyodide = await loadPyodide({
    indexURL: new URL('pyodide/', base).href,
  });
  // Direct same-origin wheel URLs — no micropip, no PyPI, no resolution.
  await pyodide.loadPackage(
    WHEELS.map((w) => new URL(`wheels/${w}`, base).href),
    { messageCallback: () => {} },
  );
  lockdownNetwork();
  await pyodide.runPythonAsync(PY_GLUE);
  return pyodide;
}

const pyodideReady = boot();

pyodideReady.then(
  () => self.postMessage({ type: 'ready' }),
  (err) => self.postMessage({ type: 'boot-error', error: String(err) }),
);

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    const pyodide = await pyodideReady;
    if (msg.type === 'parse') {
      const format = sanitizeFormat(msg.format);
      const fn = pyodide.globals.get('check_parse');
      try {
        const json = fn(msg.text, format);
        const parsed = JSON.parse(json);
        self.postMessage({ type: 'parse-result', id: msg.id, ok: parsed.ok, error: parsed.error });
      } finally {
        fn.destroy?.();
      }
      return;
    }
    if (msg.type === 'validate') {
      // Security #4: never trust the posted options/formats — the worker
      // independently re-validates against the same allowlist before this
      // reaches pySHACL, regardless of what the UI thread already checked.
      const options = sanitizeOptions(msg.options);
      const dataFormat = sanitizeFormat(msg.dataFormat);
      const shapesFormat = sanitizeFormat(msg.shapesFormat);
      const reportFormat = sanitizeReportFormat(msg.reportFormat);
      const run = pyodide.globals.get('run_validation');
      try {
        const json = run(
          msg.data,
          dataFormat,
          msg.shapes,
          shapesFormat,
          reportFormat,
          options,
        );
        self.postMessage({ type: 'result', id: msg.id, result: JSON.parse(json) });
      } finally {
        run.destroy?.();
      }
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: (msg as { id?: number }).id, error: String(err) });
  }
};
