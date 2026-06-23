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

## Ohm.js reference parser

The repository also contains a deliberately slow/big Ohm.js 18 reference parser. It is exported as a separate opt-in path, not used by the default package entry:

```js
import { turtleReferenceParser, turtleWriter } from '@muze-labs/oldm-turtle/reference'
```

The older experiment path remains as a compatibility alias:

```js
import { turtleOhm18Parser } from '@muze-labs/oldm-turtle/ohm18'
```

The reference parser is useful as a readable grammar-backed oracle for tests. It is not meant to be the production parser. The default parser remains the small handwritten parser.

From the workspace root:

```sh
npm run build:turtle-ohm
npm run test:turtle:reference
npm run benchmark:turtle:ohm
npm run evaluate:turtle:ohm
```

`npm run test:turtle:reference` includes parity tests that parse representative Turtle documents with both the handwritten parser and the Ohm reference parser, then compare the produced prefixes and quads directly.

Current local results suggest the Ohm/reference parser reduces maintained parser code only modestly, increases the browser bundle substantially, and is slower end-to-end than the handwritten parser on small Solid-style files. Its main value is as a correctness/reference implementation on the experiment branch.
