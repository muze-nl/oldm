# @muze-labs/oldm-turtle

Experimental small Turtle 1.1 parser/writer adapter for OLDM.

This package is intentionally focused on the Turtle features that are common in small Solid documents. It is not meant to be a full replacement for N3 yet.

```js
import oldm from '@muze-nl/oldm-core'
import { turtleParser, turtlePatchWriter, turtleWriter } from '@muze-labs/oldm-turtle'

const context = oldm({
  parser: turtleParser,
  writer: turtleWriter,
  patchWriter: turtlePatchWriter
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
- Solid N3 Patch output for named-node changes and owned anonymous value replacements
- predicate lists and object lists
- comments
- relative IRI resolution

Patch support follows the same conservative anonymous-value strategy as `@muze-nl/oldm-n3`: fresh blank nodes and collections can be inserted, existing owned blank nodes and collections are replaced as complete anonymous closures, and shared or cyclic anonymous values are rejected so callers can use full document replacement.

Known limits in this experimental version:

- no streaming input or output
- no TriG, N-Quads, N3 rules, RDF-star, or RDF 1.2 extensions
- escaping and prefixed-name validation are intentionally conservative
