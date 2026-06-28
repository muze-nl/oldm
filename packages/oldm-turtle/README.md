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

`turtlePatchWriter` generates Solid N3 Patch output by diffing the original parsed source against the graph's current Turtle output. Patch serialization prefers prefixes declared by the source document; context prefixes are added only for namespaces that the source cannot already shorten. Changes involving blank nodes are rejected so callers can fall back to a full `PUT`.

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
- Solid N3 Patch generation for named-node/literal changes

Known limits in this experimental version:

- no streaming input or output
- no TriG, N-Quads, N3 rules, RDF-star, or RDF 1.2 extensions
- escaping and prefixed-name validation are intentionally conservative
- patch generation rejects blank-node and collection changes
