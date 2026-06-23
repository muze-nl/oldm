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
