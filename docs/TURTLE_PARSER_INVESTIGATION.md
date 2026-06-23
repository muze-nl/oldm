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

## Ohm.js recognizer experiment

There is also an experimental Ohm.js recognizer in:

```text
packages/oldm-turtle/experimental/turtle.ohm
```

This is not part of the published `@muze-labs/oldm-turtle` package. It exists to answer a narrow question: has the newer Ohm.js WebAssembly backend become fast enough to make an Ohm-based Turtle parser worth considering?

The experiment deliberately benchmarks Ohm in **recognition-only** mode. It checks whether a document matches the grammar, but it does not yet walk the CST or build OLDM quads. This isolates the parser-engine cost. A real Ohm backend would still need CST walking, IRI resolution, prefix handling, blank-node/list construction, literal metadata, and useful error mapping.

### Scripts

Compile the Ohm v18 WebAssembly grammar:

```sh
npm run build:turtle-ohm
```

Run the Ohm comparison benchmark:

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

### Initial interpretation

Ohm.js 18 changes the performance picture dramatically compared with Ohm.js 17. In this recognition-only benchmark it is roughly in the same broad range as OLDM parsing for these small Solid-style files, while Ohm.js 17 remains much too slow.

However, this does **not** yet mean that OLDM should switch to Ohm. The handwritten parser already parses to quads, while the Ohm rows only recognize syntax. The next useful experiment is to add a CST walker for the Ohm v18 recognizer and measure end-to-end parse-to-quads performance and code size.

A reasonable decision rule:

```text
Keep the handwritten parser unless an Ohm v18 backend:
- passes the same Turtle subset tests,
- builds the same quads,
- stays within roughly 2x of handwritten parse-to-quads time on 1-50 kB Solid files,
- keeps shipped runtime + wasm size acceptable,
- and makes the grammar/implementation clearly easier to maintain.
```
