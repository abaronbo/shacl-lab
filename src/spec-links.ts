// Maps sh:sourceConstraintComponent IRIs from validation reports to the
// section of the SHACL 1.2 specs that defines them. Static allowlist only —
// report content must never become a link target by itself. Anchors verified
// against the 2026-08-28 Working Drafts.

const SH = 'http://www.w3.org/ns/shacl#';
const CORE = 'https://www.w3.org/TR/shacl12-core/';
const SPARQL = 'https://www.w3.org/TR/shacl12-sparql/';

// Core constraint components share their local name with the spec anchor.
const CORE_COMPONENTS = [
  'ClassConstraintComponent',
  'DatatypeConstraintComponent',
  'NodeKindConstraintComponent',
  'MinCountConstraintComponent',
  'MaxCountConstraintComponent',
  'MinExclusiveConstraintComponent',
  'MinInclusiveConstraintComponent',
  'MaxExclusiveConstraintComponent',
  'MaxInclusiveConstraintComponent',
  'MinLengthConstraintComponent',
  'MaxLengthConstraintComponent',
  'PatternConstraintComponent',
  'LanguageInConstraintComponent',
  'UniqueLangConstraintComponent',
  'EqualsConstraintComponent',
  'DisjointConstraintComponent',
  'LessThanConstraintComponent',
  'LessThanOrEqualsConstraintComponent',
  'NotConstraintComponent',
  'AndConstraintComponent',
  'OrConstraintComponent',
  'XoneConstraintComponent',
  'NodeConstraintComponent',
  'PropertyConstraintComponent',
  'ClosedConstraintComponent',
  'HasValueConstraintComponent',
  'InConstraintComponent',
] as const;

const LINKS: ReadonlyMap<string, string> = new Map([
  ...CORE_COMPONENTS.map((name): [string, string] => [`${SH}${name}`, `${CORE}#${name}`]),
  // The qualified pair is defined together under one section.
  [`${SH}QualifiedMinCountConstraintComponent`, `${CORE}#QualifiedValueShapeConstraintComponent`],
  [`${SH}QualifiedMaxCountConstraintComponent`, `${CORE}#QualifiedValueShapeConstraintComponent`],
  // shacl12-sparql has no per-component anchor; the section defines it.
  [`${SH}SPARQLConstraintComponent`, `${SPARQL}#sparql-constraints`],
]);

export function specLinkFor(componentIri: string): string | null {
  return LINKS.get(componentIri) ?? null;
}
