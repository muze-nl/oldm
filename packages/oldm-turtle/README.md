# @muze-labs/oldm-turtle

Experimental small Turtle 1.1 parser/writer adapter for OLDM.

This package is intentionally focused on the Turtle features that are common in small Solid documents. It is not meant to be a full replacement for N3 yet.

```js
import oldm from '@muze-nl/oldm-core'
import { turtleParser, turtleWriter } from '@muze-labs/oldm-turtle'

const context = oldm({
  parser: turtleParser,
  writer: turtleWriter
})
```

Currently supported:

- `@prefix` / `PREFIX`
- `@base` / `BASE`
- IRI references
- prefixed names
- `a` as `rdf:type`
- string literals with language and datatype tags
- numeric and boolean literals
- blank node labels
- blank node property lists
- collections
- predicate lists and object lists
- comments
- relative IRI resolution

Known limits in this experimental version:

- no streaming input or output
- no TriG, N-Quads, N3 rules, RDF-star, or RDF 1.2 extensions
- escaping and prefixed-name validation are intentionally conservative

## Ohm.js experiment

The repository also contains an experimental Ohm.js Turtle recognizer in `packages/oldm-turtle/experimental/`.

It is not exported by this package and is not included in the published files. It is only there to benchmark whether Ohm.js 18's WebAssembly backend is fast enough to consider for a future parser backend.

From the workspace root:

```sh
npm run benchmark:turtle:ohm
```

The Ohm benchmark is recognition-only; it does not yet build OLDM quads.
