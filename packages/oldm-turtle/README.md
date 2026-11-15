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

## Full document writes

Shared and cyclic blank-node values retain their identity on full document
writes. The writer uses labeled statements for repeated references, including
shared collection heads, and keeps inline syntax for unshared values. Writing
neither changes the graph nor assigns public IDs to its anonymous objects.

An ordinary empty property array (`[]`) contains no values and produces no
triple, including for `a`. An empty `Collection` is different: it remains an RDF
list value, written as `()` (`rdf:nil`). The patch writer can therefore delete a
property whose values have been cleared. Its conservative rejection of changed
shared or cyclic anonymous values still applies; use full replacement for those.

These rules follow [RDF 1.1 Turtle (25 February 2014)](https://www.w3.org/TR/2014/REC-turtle-20140225/):
sections 2.6–2.8 describe blank-node identity and lists, while grammar productions
[7]–[8] require an object after each predicate.

## Prefix declarations

Writers emit only prefixes actually used in the serialized RDF. This includes
nested values and literal datatypes, and also applies to Solid patches. Text
that happens to contain `prefix:words` does not require a declaration. Unused
source and context prefixes remain available for later edits; serialization
does not modify the graph or its prefix configuration.
