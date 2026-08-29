// Security #4: the single source of truth for the pySHACL options allowlist.
// Both the UI and the worker call sanitizeOptions independently on whatever
// they receive — never trust a decoded/posted object directly. Output is
// always a null-prototype object with exactly these 5 keys.

export type Inference = 'none' | 'rdfs' | 'owlrl' | 'both';

export type Options = {
  inference: Inference;
  advanced: boolean;
  metaShacl: boolean;
  allowInfos: boolean;
  allowWarnings: boolean;
};

const INFERENCE_VALUES: readonly Inference[] = ['none', 'rdfs', 'owlrl', 'both'];

export const DEFAULT_OPTIONS: Options = Object.freeze({
  inference: 'none',
  advanced: true,
  metaShacl: false,
  allowInfos: false,
  allowWarnings: false,
});

export function sanitizeOptions(raw: unknown): Options {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const inference = INFERENCE_VALUES.includes(src.inference as Inference)
    ? (src.inference as Inference)
    : DEFAULT_OPTIONS.inference;
  const out: Options = Object.assign(Object.create(null), {
    inference,
    advanced: Boolean(src.advanced),
    metaShacl: Boolean(src.metaShacl),
    allowInfos: Boolean(src.allowInfos),
    allowWarnings: Boolean(src.allowWarnings),
  });
  return out;
}

export const FORMATS = ['turtle', 'json-ld', 'nt', 'xml', 'trig'] as const;
export type Format = (typeof FORMATS)[number];
export const DEFAULT_FORMAT: Format = 'turtle';

export function sanitizeFormat(raw: unknown): Format {
  return (FORMATS as readonly unknown[]).includes(raw) ? (raw as Format) : DEFAULT_FORMAT;
}

export const REPORT_FORMATS = ['turtle', 'json-ld', 'nt', 'xml'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];
export const DEFAULT_REPORT_FORMAT: ReportFormat = 'turtle';

export function sanitizeReportFormat(raw: unknown): ReportFormat {
  return (REPORT_FORMATS as readonly unknown[]).includes(raw)
    ? (raw as ReportFormat)
    : DEFAULT_REPORT_FORMAT;
}
