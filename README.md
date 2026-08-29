# SHACL Lab

A SHACL playground that runs in the browser. Write shapes on the left, data on the right, and get a validation report as you type. Validation is done by [pySHACL](https://github.com/RDFLib/pySHACL) running on [Pyodide](https://pyodide.org/).

Try it: **https://abaronbo.github.io/shacl-lab/**

## Features

- Uses pySHACL (0.40.1) with [rdflib](https://github.com/RDFLib/rdflib), compiled to WebAssembly and loaded once at startup
- Two editors with Turtle syntax highlighting, each accepting turtle, json-ld, nt, xml or trig
- Validation runs automatically on edit, or on demand with the Validate button
- SHACL-SPARQL support: sh:sparql constraints, SPARQL-based targets and sh:SPARQLRule all work
- Report shown three ways: result cards, pySHACL's human readable text, and the raw report graph (turtle, json-ld, nt or xml)
- Built-in examples, from the W3C core sample to SPARQL rules
- Share button that packs the whole session (editors, formats, settings) into the URL, so a link reproduces it exactly
- Parse errors are reported per pane without losing the last good report
- Runaway validations (a catastrophic sh:pattern regex, for example) are killed after 10 seconds and the app keeps working

## Settings

The Settings menu maps directly to pySHACL options, so the [pySHACL docs](https://github.com/RDFLib/pySHACL#full-cli-usage) apply:

- **inference**: run rdflib inferencing on the data graph before validation. `none` (default), `rdfs`, `owlrl` or `both`.
- **advanced**: enables SHACL Advanced Features such as SPARQL-based targets and SHACL rules. On by default.
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
