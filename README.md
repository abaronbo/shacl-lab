# SHACL Lab

A SHACL playground that runs in the browser. Write shapes on the left, data on the right, and get a validation report as you type. Validation is done by [pySHACL](https://github.com/RDFLib/pySHACL) running on [Pyodide](https://pyodide.org/).

Try it: **https://abaronbo.github.io/shacl-lab/**

## Features

- Uses pySHACL (0.40.1) with [rdflib](https://github.com/RDFLib/rdflib), compiled to WebAssembly and loaded once at startup
- Two editors with Turtle syntax highlighting, each accepting turtle, json-ld, nt, xml or trig
- Validation runs automatically on edit, or on demand with the Validate button
- SHACL-SPARQL and SHACL-AF support, as implemented by pySHACL: SPARQL constraints (sh:sparql), SPARQL-based targets (sh:SPARQLTarget, sh:SPARQLTargetType), SHACL rules (sh:TripleRule, sh:SPARQLRule), SPARQL-based constraint components (sh:SPARQLSelectValidator, sh:SPARQLAskValidator) and SHACL functions (sh:SPARQLFunction)
- Every validation also runs the rules from the shapes graph; the derived triples show up in the Inferred triples tab with a count
- Validation report shown as result cards, pySHACL's human readable text, or the raw report graph (turtle, json-ld, nt or xml)
- Each result card links its constraint to the section of the [SHACL 1.2 spec](https://www.w3.org/TR/shacl12-core/) that defines it
- 22 built-in examples, one per core constraint family plus the SPARQL features, mostly taken straight from the spec
- Share button that packs the whole session (editors, formats, settings) into the URL, so a link reproduces it exactly
- Parse errors are reported per pane without losing the last good report
- Runaway validations (a catastrophic sh:pattern regex, for example) are killed after 10 seconds and the app keeps working

## Settings

The Settings menu maps directly to pySHACL options, so the [pySHACL docs](https://github.com/RDFLib/pySHACL#full-cli-usage) apply:

- **inference**: run rdflib inferencing on the data graph before validation. `none` (default), `rdfs`, `owlrl` or `both`.
- **advanced**: enables SHACL Advanced Features such as SPARQL-based targets and SHACL rules during validation. On by default. The Inferred triples tab always applies the rules, regardless of this setting.
- **meta_shacl**: validates the shapes graph itself against the SHACL-SHACL shapes first, to catch mistakes in the shapes.
- **allow_infos**: results with severity sh:Info do not make the report non-conforming.
- **allow_warnings**: same, but also for sh:Warning.

## Running locally

```
npm install
npm run dev
```

`npm test` runs the Playwright suite.

## License

[MIT](LICENSE)
