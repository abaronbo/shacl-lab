// Slice 1 spike fixtures. Shapes exercise both SHACL-SPARQL surfaces:
// - a sh:sparql (SPARQLConstraintComponent) constraint — works in standard validation
// - a SPARQL-based target (sh:SPARQLTarget) — requires pySHACL advanced=True
// Queries use absolute IRIs to avoid needing sh:prefixes/sh:declare.

export const SHAPES_TTL = `
@prefix ex: <http://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:PersonLifespanShape
  a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:sparql [
    a sh:SPARQLConstraint ;
    sh:message "Death date must not precede birth date" ;
    sh:select """
      SELECT $this ?value
      WHERE {
        $this <http://example.org/birthDate> ?birth ;
              <http://example.org/deathDate> ?value .
        FILTER (?value < ?birth)
      }
    """ ;
  ] .

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
  ] .
`;

// Two expected violations: Alice trips the sh:sparql constraint,
// Bob is selected by the SPARQL target and fails sh:minCount on ex:reports.
export const DATA_VIOLATING_TTL = `
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:Alice a ex:Person ;
  ex:birthDate "1990-04-01"^^xsd:date ;
  ex:deathDate "1985-01-01"^^xsd:date .

ex:Bob ex:role "manager" .
`;

export const DATA_CONFORMING_TTL = `
@prefix ex: <http://example.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:Alice a ex:Person ;
  ex:birthDate "1990-04-01"^^xsd:date ;
  ex:deathDate "2070-01-01"^^xsd:date .

ex:Bob ex:role "manager" ;
  ex:reports ex:Carol .
`;
