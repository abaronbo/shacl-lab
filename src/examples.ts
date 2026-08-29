// Same-origin, trusted preset examples — the only content in the app that
// may auto-run without a Run click (contrast: fragment-loaded state, which
// never auto-runs — see Security #1).
import { SHAPES_TTL, DATA_VIOLATING_TTL } from './fixtures';
import { DEFAULT_OPTIONS, type Options } from './options';

export type Example = {
  name: string;
  shapes: string;
  shapesFormat: 'turtle';
  data: string;
  dataFormat: 'turtle';
  options: Options;
};

const W3C_CORE_SHAPES = `@prefix ex: <http://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:PersonShape
  a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
  ] ;
  sh:property [
    sh:path ex:age ;
    sh:datatype xsd:integer ;
  ] .
`;

const W3C_CORE_DATA = `@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:Alice a ex:Person ;
  ex:name "Alice" ;
  ex:age 30 .

ex:Bob a ex:Person ;
  ex:age "not a number" .
`;

const SPARQL_TARGET_SHAPES = `@prefix ex: <http://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:ManagerShape
  a sh:NodeShape ;
  sh:target [
    a sh:SPARQLTarget ;
    sh:select """
      SELECT ?this
      WHERE { ?this <http://example.org/role> "manager" . }
    """ ;
  ] ;
  sh:property [
    sh:path ex:reports ;
    sh:minCount 1 ;
    sh:message "A manager must have at least one report" ;
  ] .
`;

const SPARQL_TARGET_DATA = `@prefix ex: <http://example.org/> .

ex:Bob ex:role "manager" .
ex:Carol ex:role "manager" ;
  ex:reports ex:Dan .
`;

// sh:SPARQLRule: verified against pyshacl 0.40.1 directly (see plan Slice 3)
// that a CONSTRUCT-based rule materializes triples which a plain shape then
// reports on. sh:construct works reliably here; an equivalent sh:SPARQLRule
// using the SHACL-AF triple-pattern rule vocabulary was not needed.
const SPARQL_RULE_SHAPES = `@prefix ex: <http://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:InferAdultShape
  a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:rule [
    a sh:SPARQLRule ;
    sh:construct """
      CONSTRUCT { $this <http://example.org/isAdult> true . }
      WHERE {
        $this <http://example.org/age> ?age .
        FILTER (?age >= 18)
      }
    """ ;
  ] ;
  sh:property [
    sh:path ex:isAdult ;
    sh:hasValue true ;
    sh:message "Person must be inferred as an adult" ;
  ] .
`;

const SPARQL_RULE_DATA = `@prefix ex: <http://example.org/> .

ex:Alice a ex:Person ;
  ex:age 30 .

ex:Kid a ex:Person ;
  ex:age 10 .
`;

function withOptions(overrides: Partial<Options>): Options {
  return Object.assign(Object.create(null), DEFAULT_OPTIONS, overrides);
}

export const EXAMPLES: Example[] = [
  {
    name: 'W3C core example',
    shapes: W3C_CORE_SHAPES,
    shapesFormat: 'turtle',
    data: W3C_CORE_DATA,
    dataFormat: 'turtle',
    options: withOptions({ advanced: false }),
  },
  {
    name: 'sh:sparql constraint',
    shapes: SHAPES_TTL,
    shapesFormat: 'turtle',
    data: DATA_VIOLATING_TTL,
    dataFormat: 'turtle',
    options: withOptions({ advanced: true }),
  },
  {
    name: 'SPARQL-based target (advanced)',
    shapes: SPARQL_TARGET_SHAPES,
    shapesFormat: 'turtle',
    data: SPARQL_TARGET_DATA,
    dataFormat: 'turtle',
    options: withOptions({ advanced: true }),
  },
  {
    name: 'sh:SPARQLRule',
    shapes: SPARQL_RULE_SHAPES,
    shapesFormat: 'turtle',
    data: SPARQL_RULE_DATA,
    dataFormat: 'turtle',
    options: withOptions({ advanced: true }),
  },
];
