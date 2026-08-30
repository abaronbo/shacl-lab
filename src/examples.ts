// Example library. The core-constraint examples are taken from the SHACL 1.2
// Core specification (W3C Working Draft, 2026-08-28), lightly merged per
// constraint family and restricted to features pySHACL 0.40.1 implements.
// Every example is verified against the real engine by tests/examples.spec.ts.
import { DEFAULT_OPTIONS, type Format, type Options } from './options';

export type Example = {
  name: string;
  group: string;
  description: string;
  shapes: string;
  shapesFormat: Format;
  data: string;
  dataFormat: Format;
  options: Options;
};

const PREFIXES = `@prefix ex: <http://example.org/ns#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

`;

const W3C_CORE_SHAPES = `${PREFIXES}ex:PersonShape
    a sh:NodeShape ;
    sh:targetClass ex:Person ;
    sh:property [
        sh:path ex:ssn ;
        sh:maxCount 1 ;
        sh:datatype xsd:string ;
        sh:pattern "^\\\\d{3}-\\\\d{2}-\\\\d{4}$" ;
    ] ;
    sh:property [
        sh:path ex:worksFor ;
        sh:class ex:Company ;
        sh:nodeKind sh:IRI ;
    ] ;
    sh:closed true ;
    sh:ignoredProperties ( rdf:type ) .
`;

const W3C_CORE_DATA = `${PREFIXES}ex:Alice
    a ex:Person ;
    ex:ssn "987-65-432A" .

ex:Bob
    a ex:Person ;
    ex:ssn "123-45-6789" ;
    ex:ssn "124-35-6789" .

ex:Calvin
    a ex:Person ;
    ex:birthDate "1971-07-07"^^xsd:date ;
    ex:worksFor ex:UntypedCompany .
`;

const CLASS_SHAPES = `${PREFIXES}ex:ClassExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Bob, ex:Alice, ex:Carol ;
    sh:property ex:ClassExampleShape-address .

ex:ClassExampleShape-address
    a sh:PropertyShape ;
    sh:path ex:address ;
    sh:class ex:PostalAddress .
`;

const CLASS_DATA = `${PREFIXES}ex:Alice a ex:Person .
ex:Bob ex:address [ a ex:PostalAddress ; ex:city ex:Berlin ] .
ex:Carol ex:address [ ex:city ex:Cairo ] .
`;

const DATATYPE_SHAPES = `${PREFIXES}ex:DatatypeExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Alice, ex:Bob, ex:Carol ;
    sh:property ex:DatatypeExampleShape-age .

ex:DatatypeExampleShape-age
    a sh:PropertyShape ;
    sh:path ex:age ;
    sh:datatype xsd:integer .
`;

const DATATYPE_DATA = `${PREFIXES}ex:Alice ex:age "23"^^xsd:integer .
ex:Bob ex:age "twenty two" .
ex:Carol ex:age "23"^^xsd:int .
`;

const NODEKIND_SHAPES = `${PREFIXES}ex:NodeKindExampleShape
    a sh:NodeShape ;
    sh:targetObjectsOf ex:knows ;
    sh:nodeKind sh:IRI .
`;

const NODEKIND_DATA = `${PREFIXES}ex:Bob ex:knows ex:Alice .
ex:Alice ex:knows "Bob" .
`;

const CARDINALITY_SHAPES = `${PREFIXES}ex:MinCountExampleShape
    a sh:PropertyShape ;
    sh:targetNode ex:Alice, ex:Bob ;
    sh:path ex:name ;
    sh:minCount 1 .

ex:MaxCountExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Bob ;
    sh:property ex:MaxCountExampleShape-birthDate .

ex:MaxCountExampleShape-birthDate
    a sh:PropertyShape ;
    sh:path ex:birthDate ;
    sh:maxCount 1 .
`;

const CARDINALITY_DATA = `${PREFIXES}ex:Alice ex:name "Alice" .
ex:Bob ex:givenName "Bob"@en .
ex:Bob ex:birthDate "May 5th 1990" .
`;

const RANGE_SHAPES = `${PREFIXES}ex:NumericRangeExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Bob, ex:Alice, ex:Ted ;
    sh:property ex:NumericRangeExampleShape-age .

ex:NumericRangeExampleShape-age
    a sh:PropertyShape ;
    sh:path ex:age ;
    sh:minInclusive 0 ;
    sh:maxInclusive 150 .
`;

const RANGE_DATA = `${PREFIXES}ex:Bob ex:age 23 .
ex:Alice ex:age 220 .
ex:Ted ex:age "twenty one"@en .
`;

const STRING_SHAPES = `${PREFIXES}ex:PasswordExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Bob, ex:Alice ;
    sh:property ex:PasswordExampleShape-password .

ex:PasswordExampleShape-password
    a sh:PropertyShape ;
    sh:path ex:password ;
    sh:minLength 8 ;
    sh:maxLength 10 .

ex:PatternExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Bob, ex:Alice, ex:Carol ;
    sh:property ex:PatternExampleShape-bCode .

ex:PatternExampleShape-bCode
    a sh:PropertyShape ;
    sh:path ex:bCode ;
    sh:pattern "^B" ;    # starts with 'B'
    sh:flags "i" .       # Ignore case
`;

const STRING_DATA = `${PREFIXES}ex:Bob ex:password "123456789" .
ex:Alice ex:password "1234567890ABC" .

ex:Bob ex:bCode "b101" .
ex:Alice ex:bCode "B102" .
ex:Carol ex:bCode "C103" .
`;

const LANGUAGE_SHAPES = `${PREFIXES}ex:NewZealandLanguagesShape
    a sh:NodeShape ;
    sh:targetNode ex:Mountain, ex:Berg ;
    sh:property ex:NewZealandLanguagesShape-prefLabel .

ex:NewZealandLanguagesShape-prefLabel
    a sh:PropertyShape ;
    sh:path ex:prefLabel ;
    sh:languageIn ( "en" "mi" ) .

ex:UniqueLangExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Alice, ex:Bob ;
    sh:property ex:UniqueLangExampleShape-label .

ex:UniqueLangExampleShape-label
    a sh:PropertyShape ;
    sh:path ex:label ;
    sh:uniqueLang true .
`;

const LANGUAGE_DATA = `${PREFIXES}ex:Mountain
    ex:prefLabel "Mountain"@en ;
    ex:prefLabel "Hill"@en-nz ;
    ex:prefLabel "Maunga"@mi .

ex:Berg
    ex:prefLabel "Berg" ;
    ex:prefLabel "Berg"@de ;
    ex:prefLabel ex:BergLabel .

ex:Alice
    ex:label "Alice" ;
    ex:label "Alice"@en ;
    ex:label "Alice"@fr .

ex:Bob
    ex:label "Bob"@en ;
    ex:label "Bobby"@en .
`;

const PAIRS_SHAPES = `${PREFIXES}ex:EqualExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Bob ;
    sh:property ex:EqualExampleShape-firstName .

ex:EqualExampleShape-firstName
    a sh:PropertyShape ;
    sh:path ex:firstName ;
    sh:equals ex:givenName .

ex:DisjointExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:USA, ex:Germany ;
    sh:property ex:DisjointExampleShape-prefLabel .

ex:DisjointExampleShape-prefLabel
    a sh:PropertyShape ;
    sh:path ex:prefLabel ;
    sh:disjoint ex:altLabel .
`;

const PAIRS_DATA = `${PREFIXES}ex:Bob
    ex:firstName "Bob" ;
    ex:givenName "Bob" .

ex:USA
    ex:prefLabel "USA" ;
    ex:altLabel "United States" .

ex:Germany
    ex:prefLabel "Germany" ;
    ex:altLabel "Germany" .
`;

const LOGICAL_SHAPES = `${PREFIXES}ex:NotExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:InvalidInstance1 ;
    sh:not [
        a sh:PropertyShape ;
        sh:path ex:property ;
        sh:minCount 1 ;
    ] .

ex:SuperShape
    a sh:NodeShape ;
    sh:property [
        sh:path ex:property ;
        sh:minCount 1 ;
    ] .

ex:ExampleAndShape
    a sh:NodeShape ;
    sh:targetNode ex:ValidInstance, ex:InvalidInstance ;
    sh:and (
        ex:SuperShape
        [
            sh:path ex:property ;
            sh:maxCount 1 ;
        ]
    ) .

ex:OrConstraintExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Bob ;
    sh:or (
        [
            sh:path ex:firstName ;
            sh:minCount 1 ;
        ]
        [
            sh:path ex:givenName ;
            sh:minCount 1 ;
        ]
    ) .

ex:XoneConstraintExampleShape
    a sh:NodeShape ;
    sh:targetClass ex:Person ;
    sh:xone (
        [
            sh:property [
                sh:path ex:fullName ;
                sh:minCount 1 ;
            ]
        ]
        [
            sh:property [
                sh:path ex:firstName ;
                sh:minCount 1 ;
            ] ;
            sh:property [
                sh:path ex:lastName ;
                sh:minCount 1 ;
            ]
        ]
    ) .
`;

const LOGICAL_DATA = `${PREFIXES}ex:InvalidInstance1 ex:property "Some value" .

ex:ValidInstance
    ex:property "One" .

# Invalid: more than one property
ex:InvalidInstance
    ex:property "One" ;
    ex:property "Two" .

ex:Bob a ex:Person ;
    ex:firstName "Robert" ;
    ex:lastName "Coin" .

ex:Carla a ex:Person ;
    ex:fullName "Carla Miller" .

ex:Dory a ex:Person ;
    ex:firstName "Dory" ;
    ex:lastName "Dunce" ;
    ex:fullName "Dory Dunce" .
`;

const NODE_SHAPES = `${PREFIXES}ex:AddressShape
    a sh:NodeShape ;
    sh:property ex:AddressShape-postalCode .

ex:AddressShape-postalCode
    a sh:PropertyShape ;
    sh:path ex:postalCode ;
    sh:datatype xsd:string ;
    sh:maxCount 1 .

ex:PersonShape
    a sh:NodeShape ;
    sh:targetClass ex:Person ;
    sh:property ex:PersonShape-address .

ex:PersonShape-address
    a sh:PropertyShape ;
    sh:path ex:address ;
    sh:minCount 1 ;
    sh:node ex:AddressShape .
`;

const NODE_DATA = `${PREFIXES}ex:Bob a ex:Person ;
    ex:address ex:BobsAddress .

ex:BobsAddress
    ex:postalCode "1234" .

ex:Reto a ex:Person ;
    ex:address ex:RetosAddress .

ex:RetosAddress
    ex:postalCode 5678 .
`;

const QUALIFIED_SHAPES = `${PREFIXES}ex:QualifiedValueShapeExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:QualifiedValueShapeExampleValidResource ;
    sh:property ex:QualifiedValueShapeExampleShape-parent .

ex:QualifiedValueShapeExampleShape-parent
    a sh:PropertyShape ;
    sh:path ex:parent ;
    sh:minCount 2 ;
    sh:maxCount 2 ;
    sh:qualifiedValueShape [
        sh:path ex:gender ;
        sh:hasValue ex:female ;
    ] ;
    sh:qualifiedMinCount 1 .
`;

const QUALIFIED_DATA = `${PREFIXES}ex:QualifiedValueShapeExampleValidResource
    ex:parent ex:John ;
    ex:parent ex:Jane .

ex:John
    ex:gender ex:male .

ex:Jane
    ex:gender ex:female .
`;

const CLOSED_SHAPES = `${PREFIXES}ex:ClosedShapeExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:Alice, ex:Bob ;
    sh:closed true ;
    sh:ignoredProperties (rdf:type) ;
    sh:property [
        sh:path ex:firstName ;
    ] ;
    sh:property [
        sh:path ex:lastName ;
    ] .
`;

const CLOSED_DATA = `${PREFIXES}ex:Alice
    ex:firstName "Alice" .

ex:Bob
    ex:firstName "Bob" ;
    ex:middleInitial "J" .
`;

const HASVALUE_IN_SHAPES = `${PREFIXES}ex:StanfordGraduate
    a sh:NodeShape ;
    sh:targetNode ex:Alice ;
    sh:property ex:StanfordGraduate-alumniOf .

ex:StanfordGraduate-alumniOf
    a sh:PropertyShape ;
    sh:path ex:alumniOf ;
    sh:hasValue ex:Stanford .

ex:InExampleShape
    a sh:NodeShape ;
    sh:targetNode ex:RainbowPony ;
    sh:property ex:InExampleShape-color .

ex:InExampleShape-color
    a sh:PropertyShape ;
    sh:path ex:color ;
    sh:in ( ex:Pink ex:Purple ) .
`;

const HASVALUE_IN_DATA = `${PREFIXES}ex:Alice
    ex:alumniOf ex:Harvard ;
    ex:alumniOf ex:Stanford .

ex:RainbowPony ex:color ex:Pink .
`;

const SEVERITY_SHAPES = `${PREFIXES}ex:MyShape
    a sh:NodeShape ;
    sh:targetNode ex:MyInstance ;
    sh:property ex:MyShape-myProperty1 ;
    sh:property ex:MyShape-myProperty2 .

ex:MyShape-myProperty1
    # Violations of sh:minCount and sh:datatype are produced as warnings
    a sh:PropertyShape ;
    sh:path ex:myProperty ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
    sh:severity sh:Warning .

ex:MyShape-myProperty2
    # The default severity here is sh:Violation
    a sh:PropertyShape ;
    sh:path ex:myProperty ;
    sh:maxLength 10 ;
    sh:message "Too many characters"@en ;
    sh:message "Zu viele Zeichen"@de .
`;

const SEVERITY_DATA = `${PREFIXES}ex:MyInstance
    ex:myProperty "http://toomanycharacters"^^xsd:anyURI .
`;

const PATHS_SHAPES = `${PREFIXES}# Path syntax from the spec's property-paths section:
# [ sh:inversePath ex:parent ] is SPARQL's ^ex:parent.
ex:ParentShape
    a sh:NodeShape ;
    sh:targetNode ex:Alice, ex:Bob ;
    sh:property [
        sh:path [ sh:inversePath ex:parent ] ;
        sh:minCount 1 ;
        sh:name "children" ;
    ] .
`;

const PATHS_DATA = `${PREFIXES}ex:Carol ex:parent ex:Alice .
ex:Dave ex:parent ex:Alice .

# Nobody has ex:parent ex:Bob, so Bob violates minCount 1.
`;

// The sh:sparql example from the SHACL 1.2 SPARQL Extensions spec, with the
// abbreviated prefix declaration written out in full.
const SPARQL_CONSTRAINT_SHAPES = `${PREFIXES}ex:
    sh:declare [
        sh:prefix "ex" ;
        sh:namespace "http://example.org/ns#"^^xsd:anyURI ;
    ] .

ex:LanguageExampleShape
    a sh:NodeShape ;
    sh:targetClass ex:Country ;
    sh:sparql [
        a sh:SPARQLConstraint ;   # This triple is optional
        sh:message "Values are literals with German language tag." ;
        sh:prefixes ex: ;
        sh:select """
            SELECT $this (ex:germanLabel AS ?path) ?value
            WHERE {
                $this ex:germanLabel ?value .
                FILTER (!isLiteral(?value) || !langMatches(lang(?value), "de"))
            }
            """ ;
    ] .
`;

const SPARQL_CONSTRAINT_DATA = `${PREFIXES}ex:ValidCountry a ex:Country ;
    ex:germanLabel "Spanien"@de .

ex:InvalidCountry a ex:Country ;
    ex:germanLabel "Spain"@en .
`;

// The spec re-implements sh:pattern as a SPARQL-based constraint component;
// renamed into the ex: namespace so it does not clash with the built-in.
const SPARQL_COMPONENT_SHAPES = `${PREFIXES}ex:PatternConstraintComponent
    a sh:ConstraintComponent ;
    sh:parameter [
        sh:path ex:pattern ;
    ] ;
    sh:parameter [
        sh:path ex:flags ;
        sh:optional true ;
    ] ;
    sh:validator ex:hasPattern .

ex:hasPattern
    a sh:SPARQLAskValidator ;
    sh:message "Value does not match pattern {$pattern}" ;
    sh:ask """
        ASK {
            FILTER (!isBlank($value) &&
                IF(bound($flags), regex(str($value), $pattern, $flags), regex(str($value), $pattern)))
        }""" .

ex:CaseInsensitiveSearch
    a sh:NodeShape ;
    sh:targetClass ex:Record ;
    sh:property [
        sh:path ex:code ;
        ex:pattern "^[A-Z]{3}[0-9]{2}$" ;
        ex:flags "i" ;   # case-insensitive match
    ] .
`;

const SPARQL_COMPONENT_DATA = `${PREFIXES}ex:GoodRecord a ex:Record ;
    ex:code "abc12" .

ex:BadRecord a ex:Record ;
    ex:code "12345" .
`;

// The sh:TripleRule example from the SHACL-AF note, which is the rules
// vocabulary pySHACL implements.
const TRIPLE_RULE_SHAPES = `${PREFIXES}@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Rectangle
    a rdfs:Class, sh:NodeShape ;
    rdfs:label "Rectangle" ;
    sh:property [
        sh:path ex:height ;
        sh:datatype xsd:integer ;
        sh:maxCount 1 ;
        sh:minCount 1 ;
        sh:name "height" ;
    ] ;
    sh:property [
        sh:path ex:width ;
        sh:datatype xsd:integer ;
        sh:maxCount 1 ;
        sh:minCount 1 ;
        sh:name "width" ;
    ] ;
    sh:rule [
        a sh:TripleRule ;
        sh:subject sh:this ;
        sh:predicate rdf:type ;
        sh:object ex:Square ;
        sh:condition ex:Rectangle ;
        sh:condition [
            sh:property [
                sh:path ex:width ;
                sh:equals ex:height ;
            ] ;
        ] ;
    ] .
`;

const TRIPLE_RULE_DATA = `${PREFIXES}ex:ExampleRectangle
    a ex:Rectangle ;
    ex:width 4 ;
    ex:height 4 .

ex:NonSquare
    a ex:Rectangle ;
    ex:width 2 ;
    ex:height 3 .
`;

// The sh:SPARQLFunction example from the SHACL-AF note: ex:multiply is
// declared as a SPARQL function and used by a rule to compute areas.
const SPARQL_FUNCTION_SHAPES = `${PREFIXES}@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:multiply
    a sh:SPARQLFunction ;
    rdfs:comment "Multiplies its two arguments $op1 and $op2." ;
    sh:parameter [
        sh:path ex:op1 ;
        sh:datatype xsd:integer ;
        sh:description "The first operand" ;
    ] ;
    sh:parameter [
        sh:path ex:op2 ;
        sh:datatype xsd:integer ;
        sh:description "The second operand" ;
    ] ;
    sh:returnType xsd:integer ;
    sh:prefixes ex: ;
    sh:select """
        SELECT ($op1 * $op2 AS ?result)
        WHERE {
        }
        """ .

ex:
    sh:declare [
        sh:prefix "ex" ;
        sh:namespace "http://example.org/ns#"^^xsd:anyURI ;
    ] .

ex:RectangleRulesShape
    a sh:NodeShape ;
    sh:targetClass ex:Rectangle ;
    sh:rule [
        a sh:SPARQLRule ;
        sh:prefixes ex: ;
        sh:construct """
            CONSTRUCT { $this ex:area ?area . }
            WHERE {
                $this ex:width ?width .
                $this ex:height ?height .
                BIND (ex:multiply(?width, ?height) AS ?area) .
            }
            """ ;
    ] .
`;

const SPARQL_FUNCTION_DATA = `${PREFIXES}ex:ExampleRectangle
    a ex:Rectangle ;
    ex:width 4 ;
    ex:height 5 .
`;

const SPARQL_TARGET_SHAPES = `@prefix ex: <http://example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

ex:ManagerShape
  a sh:NodeShape ;
  sh:target [
    a sh:SPARQLTarget ;
    sh:select """
      SELECT ?this
      WHERE {
        ?this <http://example.org/role> "manager" .
      }
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

function example(
  name: string,
  group: string,
  description: string,
  shapes: string,
  data: string,
  options: Options = withOptions({}),
): Example {
  return { name, group, description, shapes, shapesFormat: 'turtle', data, dataFormat: 'turtle', options };
}

export const EXAMPLES: Example[] = [
  example(
    'W3C core example',
    'Getting started',
    'The introductory example from the SHACL spec: a person shape combining datatype, pattern, cardinality, class and closedness. Alice, Bob and Calvin all have problems, four violations in total.',
    W3C_CORE_SHAPES,
    W3C_CORE_DATA,
    withOptions({ advanced: false }),
  ),
  example(
    'sh:class',
    'Core constraints',
    "Values of ex:address must be instances of ex:PostalAddress. Carol's address has no rdf:type, so it violates. From the spec's value type section.",
    CLASS_SHAPES,
    CLASS_DATA,
  ),
  example(
    'sh:datatype',
    'Core constraints',
    'Ages must be xsd:integer literals. Bob has a plain string and Carol an xsd:int, which is a different datatype. Try changing xsd:int to xsd:integer.',
    DATATYPE_SHAPES,
    DATATYPE_DATA,
  ),
  example(
    'sh:nodeKind',
    'Core constraints',
    'Everything someone knows must be an IRI. Alice knows the literal "Bob", so it violates. sh:targetObjectsOf targets the objects of ex:knows triples.',
    NODEKIND_SHAPES,
    NODEKIND_DATA,
  ),
  example(
    'Cardinality',
    'Core constraints',
    'sh:minCount requires a name for Alice and Bob; Bob only has ex:givenName. sh:maxCount 1 on birth dates is satisfied. Add a second birthDate to Bob to break it.',
    CARDINALITY_SHAPES,
    CARDINALITY_DATA,
  ),
  example(
    'Value ranges',
    'Core constraints',
    'Ages must be between 0 and 150 inclusive. Alice is 220 and Ted has a string age that cannot be compared, so both violate.',
    RANGE_SHAPES,
    RANGE_DATA,
  ),
  example(
    'String length and sh:pattern',
    'Core constraints',
    "Passwords must be 8 to 10 characters (Alice's is too long) and bCodes must start with B, case-insensitively via sh:flags (Carol's starts with C).",
    STRING_SHAPES,
    STRING_DATA,
  ),
  example(
    'Language tags',
    'Core constraints',
    'sh:languageIn restricts labels to English and Maori: all three of ex:Berg\'s labels violate. sh:uniqueLang forbids two labels in the same language: Bob has two @en labels.',
    LANGUAGE_SHAPES,
    LANGUAGE_DATA,
  ),
  example(
    'Property pairs',
    'Core constraints',
    'sh:equals demands firstName and givenName agree (Bob conforms). sh:disjoint forbids sharing values between prefLabel and altLabel, which Germany violates.',
    PAIRS_SHAPES,
    PAIRS_DATA,
  ),
  example(
    'Logical operators',
    'Core constraints',
    'sh:not, sh:and, sh:or and sh:xone from the spec. InvalidInstance1 fails the negation, InvalidInstance fails the conjunction, and Dory has both fullName and first/last name, failing exactly-one.',
    LOGICAL_SHAPES,
    LOGICAL_DATA,
  ),
  example(
    'sh:node',
    'Core constraints',
    "Person addresses must conform to a reusable address shape. Reto's postal code is a number instead of a string, so his address fails the referenced shape.",
    NODE_SHAPES,
    NODE_DATA,
  ),
  example(
    'Qualified cardinality',
    'Core constraints',
    'Exactly two parents, at least one of whom is female. The data conforms. Change ex:Jane\'s gender to ex:male and the qualified minimum fails.',
    QUALIFIED_SHAPES,
    QUALIFIED_DATA,
  ),
  example(
    'Closed shapes',
    'Core constraints',
    'sh:closed only allows the declared properties (plus rdf:type). Bob carries an undeclared ex:middleInitial, which violates.',
    CLOSED_SHAPES,
    CLOSED_DATA,
  ),
  example(
    'sh:hasValue and sh:in',
    'Core constraints',
    "Alice must be a Stanford alum (she is, among others) and the pony must be pink or purple (it is pink). Conforms as given: change ex:Pink to ex:Green in the data to break sh:in, or remove Alice's Stanford triple to break sh:hasValue.",
    HASVALUE_IN_SHAPES,
    HASVALUE_IN_DATA,
  ),
  example(
    'Severities',
    'Core constraints',
    'The same value triggers a Warning (wrong datatype, sh:severity sh:Warning) and a Violation (too long). With allow_warnings on, warnings alone would not break conformance; delete the maxLength shape and toggle it to see the report flip.',
    SEVERITY_SHAPES,
    SEVERITY_DATA,
  ),
  example(
    'Property paths',
    'Core constraints',
    'An inverse path counts children: [ sh:inversePath ex:parent ] follows ex:parent triples backwards. Alice has two children, Bob has none and violates minCount.',
    PATHS_SHAPES,
    PATHS_DATA,
  ),
  example(
    'sh:sparql constraint',
    'SPARQL-based',
    'The spec\'s SPARQL constraint example: labels must be German-language literals, checked by a SELECT query with declared prefixes. "Spain"@en violates.',
    SPARQL_CONSTRAINT_SHAPES,
    SPARQL_CONSTRAINT_DATA,
    withOptions({ advanced: true }),
  ),
  example(
    'SPARQL constraint component',
    'SPARQL-based',
    'A reusable constraint component with parameters and an ASK validator, re-implementing sh:pattern. ex:BadRecord\'s code fails the case-insensitive pattern.',
    SPARQL_COMPONENT_SHAPES,
    SPARQL_COMPONENT_DATA,
    withOptions({ advanced: true }),
  ),
  example(
    'sh:TripleRule',
    'SPARQL-based',
    'The SHACL-AF triple rule: rectangles whose width equals their height are inferred to be squares. Check the Inferred triples tab: only ex:ExampleRectangle becomes a square.',
    TRIPLE_RULE_SHAPES,
    TRIPLE_RULE_DATA,
    withOptions({ advanced: true }),
  ),
  example(
    'sh:SPARQLFunction',
    'SPARQL-based',
    'The SHACL-AF ex:multiply function, declared in SPARQL and called from a rule that computes rectangle areas. The Inferred triples tab shows ex:area 20.',
    SPARQL_FUNCTION_SHAPES,
    SPARQL_FUNCTION_DATA,
    withOptions({ advanced: true }),
  ),
  example(
    'SPARQL-based target',
    'SPARQL-based',
    'The target set itself comes from a SPARQL query: every node with role "manager". Bob manages nobody and violates. Requires the advanced setting.',
    SPARQL_TARGET_SHAPES,
    SPARQL_TARGET_DATA,
    withOptions({ advanced: true }),
  ),
  example(
    'sh:SPARQLRule',
    'SPARQL-based',
    'A CONSTRUCT rule infers ex:isAdult for people 18 or older, then a plain constraint checks it. See the Inferred triples tab for what the rule derived. Kid is 10 and violates.',
    SPARQL_RULE_SHAPES,
    SPARQL_RULE_DATA,
    withOptions({ advanced: true }),
  ),
];
