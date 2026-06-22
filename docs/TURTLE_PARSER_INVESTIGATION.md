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
