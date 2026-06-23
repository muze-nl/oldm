# Turtle parser investigation

OLDM currently uses `@muze-nl/oldm-n3` as the default parser/writer adapter. That remains the production default.

This document records an experimental alternative: `@muze-labs/oldm-turtle`, a small non-streaming Turtle 1.1 parser/writer adapter focused on the small Solid documents OLDM usually reads and writes.

## Goal

Investigate whether OLDM can eventually replace the default N3 adapter with a much smaller Turtle-only adapter, without making common Solid profile, preference, and contacts documents noticeably slower.

## Current package

The experiment lives in:

```text
packages/oldm-turtle/
```

It exports:

```js
import { turtleParser, turtleWriter } from '@muze-labs/oldm-turtle'
```

Usage with core:

```js
import oldm from '@muze-nl/oldm-core'
import { turtleParser, turtleWriter } from '@muze-labs/oldm-turtle'

const context = oldm({
  parser: turtleParser,
  writer: turtleWriter
})
```

## Supported in the current experiment

The parser currently supports the Turtle 1.1 features that are common in small Solid documents:

- `@prefix` / `PREFIX`
- `@base` / `BASE`
- IRI references
- prefixed names
- `a` as `rdf:type`
- string literals
- language tags
- datatype tags
- numeric literals
- boolean literals
- blank node labels
- blank node property lists
- collections
- predicate lists using `;`
- object lists using `,`
- comments
- relative IRI resolution

The writer currently supports serializing OLDM graphs with:

- named subjects
- type values as `a`
- named node object values
- literal values with language/datatype metadata
- blank node object values
- collections
- repeated values

## Known limits

This package is not ready to replace N3 as the default yet.

Known limits:

- no streaming input or output
- no TriG
- no N-Quads
- no N3 logic/rules
- no RDF-star or RDF 1.2 features
- no full W3C Turtle test-suite coverage yet
- prefixed-name validation is intentionally conservative
- escaping support covers common strings and IRIs but needs more conformance tests
- writer output is valid but not optimized for preserving original formatting

## Size comparison

Run:

```sh
npm run compare:turtle
```

Current result on the development machine used for this investigation:

| bundle | minified | gzip |
| --- | ---: | ---: |
| oldm + oldm-n3 ESM | 81.89 kB | 23.75 kB |
| oldm + oldm-turtle ESM | 19.84 kB | 6.08 kB |
| oldm + oldm-n3 IIFE | 81.90 kB | 23.75 kB |
| oldm + oldm-turtle IIFE | 19.85 kB | 6.08 kB |

Approximate reduction if the friendly `@muze-nl/oldm` package used the Turtle adapter instead of N3:

```text
~62 kB minified
~17.7 kB gzip
```

## Small Solid-style benchmark

The same script compares parsing and writing three small representative documents:

- profile document
- preferences document
- contacts document with 20 contacts

Current result:

| adapter | document | input | approx properties | parse | write | output |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| oldm-n3 | profile | 0.64 kB | 11 | 0.15 ms | 0.07 ms | 0.72 kB |
| oldm-n3 | preferences | 0.58 kB | 4 | 0.06 ms | 0.03 ms | 0.63 kB |
| oldm-n3 | 20 contacts | 3.00 kB | 80 | 0.50 ms | 0.19 ms | 3.85 kB |
| oldm-turtle | profile | 0.64 kB | 11 | 0.11 ms | 0.05 ms | 0.76 kB |
| oldm-turtle | preferences | 0.58 kB | 4 | 0.05 ms | 0.03 ms | 0.68 kB |
| oldm-turtle | 20 contacts | 3.00 kB | 80 | 0.47 ms | 0.24 ms | 3.11 kB |

These numbers are not a comprehensive benchmark. They suggest that for small Solid-style files, the custom parser is roughly comparable to N3 and sometimes a little faster or slower depending on the document and whether parsing or writing is measured. The size reduction is the more significant result.

## Recommendation

Keep `@muze-nl/oldm-n3` as the default for now.

Continue developing `@muze-labs/oldm-turtle` until it passes a meaningful subset of the W3C Turtle 1.1 test suite and several real Solid profile/preference/contact documents.

Only then consider switching the friendly `@muze-nl/oldm` package to the Turtle adapter by default.

A good next milestone:

```text
1. Add W3C positive Turtle 1.1 syntax tests that are relevant to OLDM.
2. Add negative syntax tests for clear parser errors.
3. Add real-world Solid document fixtures.
4. Improve writer prefix selection.
5. Decide whether unsupported Turtle features should fail explicitly or remain outside scope.
```

## Ohm.js reference parser experiment

There is also an experimental Ohm.js 18 reference parser, backed by the grammar in:

```text
packages/oldm-turtle/experimental/turtle.ohm
```

This is exported through a separate opt-in path and is not used by the default package entry. Its current purpose is not production use; it is a deliberately large/slower parser oracle that keeps the grammar visible and walks the Ohm CST in straightforward code.

```js
import { turtleReferenceParser, turtleWriter } from '@muze-labs/oldm-turtle/reference'
```

The older `@muze-labs/oldm-turtle/ohm18` path remains as a compatibility alias for the original experiment. The default `@muze-labs/oldm-turtle` export remains the handwritten parser.

### Scripts

Compile the Ohm v18 WebAssembly grammar:

```sh
npm run build:turtle-ohm
```

Run the Ohm/reference comparison benchmark:

```sh
npm run benchmark:turtle:ohm
```

You can increase or decrease the base iteration count:

```sh
TURTLE_BENCH_ITERATIONS=500 npm run benchmark:turtle:ohm
```

The benchmark currently compares:

- handwritten `oldm-turtle` parser, direct parse to quads
- handwritten `oldm-turtle` parser through OLDM core
- `oldm-n3` parser through OLDM core
- Ohm.js 17 recognizer
- Ohm.js 18 beta WebAssembly recognizer
- Ohm.js 18 reference parser, direct parse to quads
- Ohm.js 18 reference parser through OLDM core

### Current local result

On this development container, with the default `TURTLE_BENCH_ITERATIONS=100`, the Ohm setup costs were:

| item | size | gzip | setup |
| --- | ---: | ---: | ---: |
| Ohm v17 grammar source | 2.74 kB | 1.06 kB | 63.63 ms |
| Ohm v18 compiled wasm | 32.41 kB | 7.48 kB | 4.97 ms |

The parser benchmark produced:

| engine | mode | document | input | iterations | mean |
| --- | --- | --- | ---: | ---: | ---: |
| oldm-turtle | parse to quads | profile | 0.64 kB | 100 | 0.13 ms |
| oldm-turtle | OLDM parse | profile | 0.64 kB | 100 | 0.22 ms |
| oldm-n3 | OLDM parse | profile | 0.64 kB | 100 | 0.18 ms |
| ohm-js 17.5.0 | recognize only | profile | 0.64 kB | 100 | 1.74 ms |
| ohm-js 18 beta | recognize only | profile | 0.64 kB | 100 | 0.12 ms |
| oldm-turtle | parse to quads | preferences | 0.58 kB | 100 | 0.04 ms |
| oldm-turtle | OLDM parse | preferences | 0.58 kB | 100 | 0.07 ms |
| oldm-n3 | OLDM parse | preferences | 0.58 kB | 100 | 0.06 ms |
| ohm-js 17.5.0 | recognize only | preferences | 0.58 kB | 100 | 1.28 ms |
| ohm-js 18 beta | recognize only | preferences | 0.58 kB | 100 | 0.08 ms |
| oldm-turtle | parse to quads | 20 contacts | 3.00 kB | 100 | 0.15 ms |
| oldm-turtle | OLDM parse | 20 contacts | 3.00 kB | 100 | 0.47 ms |
| oldm-n3 | OLDM parse | 20 contacts | 3.00 kB | 100 | 0.53 ms |
| ohm-js 17.5.0 | recognize only | 20 contacts | 3.00 kB | 100 | 9.13 ms |
| ohm-js 18 beta | recognize only | 20 contacts | 3.00 kB | 100 | 0.42 ms |
| oldm-turtle | parse to quads | 200 contacts | 29.76 kB | 20 | 1.22 ms |
| oldm-turtle | OLDM parse | 200 contacts | 29.76 kB | 20 | 4.66 ms |
| oldm-n3 | OLDM parse | 200 contacts | 29.76 kB | 20 | 5.00 ms |
| ohm-js 17.5.0 | recognize only | 200 contacts | 29.76 kB | 20 | 130.12 ms |
| ohm-js 18 beta | recognize only | 200 contacts | 29.76 kB | 20 | 4.39 ms |

### Recognizer-only interpretation

Ohm.js 18 changes the performance picture dramatically compared with Ohm.js 17. In the recognition-only rows it is roughly in the same broad range as OLDM parsing for these small Solid-style files, while Ohm.js 17 remains much too slow.

That result made Ohm 18 worth turning into a full reference parser, but not worth switching to by itself. The real decision still depends on CST walking, quad creation, maintained code size, bundle size, and parity with the handwritten parser.

A reasonable decision rule:

```text
Keep the handwritten parser unless an Ohm v18 backend:
- passes the same Turtle subset tests,
- builds the same quads,
- stays within roughly 2x of handwritten parse-to-quads time on 1-50 kB Solid files,
- keeps shipped runtime + wasm size acceptable,
- and makes the grammar/implementation clearly easier to maintain.
```

## Ohm.js 18 reference parser backend

The Ohm experiment now also includes an end-to-end parser backend:

```js
import { turtleReferenceParser, turtleWriter } from '@muze-labs/oldm-turtle/reference'
```

This parser is still experimental and intentionally not optimized. It uses the Ohm v18 WebAssembly grammar to recognize Turtle, then walks the Ohm CST to build the same quad objects as the handwritten parser. Its purpose is to act as a readable reference implementation and test oracle.

Generated files:

```text
packages/oldm-turtle/experimental/turtle-ohm18.wasm
packages/oldm-turtle/src/generated/turtle-ohm18-wasm.mjs
```

These are generated by:

```sh
npm run build:turtle-ohm
```

The maintained source for the experiment is limited to:

```text
packages/oldm-turtle/experimental/turtle.ohm
packages/oldm-turtle/src/oldm-turtle-reference.mjs
```

Run the focused switch evaluation:

```sh
npm run evaluate:turtle:ohm
```

### Maintained code comparison

Current result:

| part | files | lines | non-blank, non-comment | source | gzip |
| --- | --- | ---: | ---: | ---: | ---: |
| handwritten parser source | `src/oldm-turtle.mjs` parser section only | 486 | 438 | 10.32 kB | 2.65 kB |
| Ohm 18 grammar | `experimental/turtle.ohm` | 87 | 68 | 2.74 kB | 1.06 kB |
| Reference parser walker/source | `src/oldm-turtle-reference.mjs` | 317 | 274 | 8.77 kB | 2.51 kB |
| Reference maintained total | grammar + parser walker/source | 404 | 342 | 11.51 kB | 3.43 kB |
| Ohm 18 generated wasm module | `src/generated/turtle-ohm18-wasm.mjs` | 19 | 15 | 43.68 kB | 11.05 kB |

The generated Wasm module is shown separately because it is not maintained by hand, but it is included in the browser bundle comparison below.

### Bundle size if the friendly OLDM bundle switched to Ohm 18

Current result:

| bundle | minified | gzip |
| --- | ---: | ---: |
| oldm + handwritten turtle parser | 19.82 kB | 6.07 kB |
| oldm + reference Turtle parser | 76.66 kB | 22.34 kB |

That means the Ohm 18 parser costs approximately:

```text
+56.85 kB minified
+16.27 kB gzip
```

compared with the handwritten Turtle parser, when the Ohm runtime and generated Wasm bytes are included in the bundle.

This is almost the same size class as the current N3-backed friendly bundle. In the updated `npm run compare:turtle` result:

| bundle | minified | gzip |
| --- | ---: | ---: |
| oldm + oldm-n3 ESM | 81.89 kB | 23.75 kB |
| oldm + oldm-turtle ESM | 19.84 kB | 6.08 kB |
| oldm + oldm-turtle-reference ESM | 76.66 kB | 22.34 kB |

So, if the goal is bundle-size reduction, Ohm 18 gives up most of the win from replacing N3.

### End-to-end parser benchmark

The benchmark now includes reference parse-to-quads and OLDM parse rows, not only recognition-only rows.

Current result:

| engine | mode | document | input | mean |
| --- | --- | --- | ---: | ---: |
| oldm-turtle | parse to quads | profile | 0.64 kB | 0.14 ms |
| oldm-turtle | OLDM parse | profile | 0.64 kB | 0.23 ms |
| oldm-n3 | OLDM parse | profile | 0.64 kB | 0.20 ms |
| Ohm 18 | recognize only | profile | 0.64 kB | 0.11 ms |
| Ohm 18 | parse to quads | profile | 0.64 kB | 0.45 ms |
| Ohm 18 | OLDM parse | profile | 0.64 kB | 0.42 ms |
| oldm-turtle | parse to quads | preferences | 0.58 kB | 0.03 ms |
| oldm-turtle | OLDM parse | preferences | 0.58 kB | 0.07 ms |
| oldm-n3 | OLDM parse | preferences | 0.58 kB | 0.07 ms |
| Ohm 18 | recognize only | preferences | 0.58 kB | 0.07 ms |
| Ohm 18 | parse to quads | preferences | 0.58 kB | 0.20 ms |
| Ohm 18 | OLDM parse | preferences | 0.58 kB | 0.24 ms |
| oldm-turtle | parse to quads | 20 contacts | 3.00 kB | 0.16 ms |
| oldm-turtle | OLDM parse | 20 contacts | 3.00 kB | 0.48 ms |
| oldm-n3 | OLDM parse | 20 contacts | 3.00 kB | 0.54 ms |
| Ohm 18 | recognize only | 20 contacts | 3.00 kB | 0.41 ms |
| Ohm 18 | parse to quads | 20 contacts | 3.00 kB | 1.34 ms |
| Ohm 18 | OLDM parse | 20 contacts | 3.00 kB | 1.67 ms |
| oldm-turtle | parse to quads | 200 contacts | 29.76 kB | 1.31 ms |
| oldm-turtle | OLDM parse | 200 contacts | 29.76 kB | 4.82 ms |
| oldm-n3 | OLDM parse | 200 contacts | 29.76 kB | 5.15 ms |
| Ohm 18 | recognize only | 200 contacts | 29.76 kB | 4.15 ms |
| Ohm 18 | parse to quads | 200 contacts | 29.76 kB | 15.07 ms |
| Ohm 18 | OLDM parse | 200 contacts | 29.76 kB | 18.61 ms |

Recognition-only speed is now good enough to be interesting. The end-to-end parser backend is not: the CST walking and term construction make the Ohm 18 backend several times slower than the handwritten parser on these fixtures.


## Parser parity tests

The useful role for the Ohm parser is now as an oracle for the handwritten parser. The focused reference test command is:

```sh
npm run test:turtle:reference
```

The parity tests parse representative supported Turtle documents with both parsers and compare the returned parser-adapter shape directly:

- prefixes, normalized by key order;
- quads, in parser output order;
- named nodes, blank nodes, literals, datatype terms, and language tags;
- rejection behavior for invalid or unsupported documents.

The current fixture set covers common Solid profile syntax, SPARQL-style directives, comments, relative IRIs, blank node labels, booleans, numbers, blank-node property lists, collections, string escapes, language tags, typed literals, default prefixes, optional directive dots, object lists, and trailing semicolons.

These tests intentionally compare the handwritten parser to the reference parser before OLDM maps quads into objects, so parser differences are not hidden by higher-level mapping behavior.

### Updated recommendation

Do not switch `@muze-labs/oldm-turtle` to Ohm 18 as its default parser backend right now.

The experiment suggests:

- Ohm 18 is dramatically better than Ohm 17 as a recognizer.
- Ohm 18 does make the grammar easier to inspect.
- But the maintained-code reduction is modest: about 438 non-blank/non-comment lines for the handwritten parser versus about 342 for grammar + walker.
- The semantic CST walker remains substantial and is less direct than the handwritten parser.
- The browser bundle would grow by about 56.8 kB minified / 16.3 kB gzip compared with the handwritten Turtle parser.
- The end-to-end Ohm parser is slower on the small Solid-style fixtures.

For Muze/OLDM goals, the handwritten parser is still the better default. Keep the Ohm 18 backend as a separate-branch reference parser/test oracle, but do not treat it as the main path unless Ohm later provides a smaller runtime, a more compact CST/semantic API, or a way to avoid most of the custom walker code.
