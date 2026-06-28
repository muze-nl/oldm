# Muze alignment: @muze-labs/oldm-shape

`@muze-labs/oldm-shape` is an experimental object-shape layer for OLDM.

It is designed to let small browser applications define application-facing JavaScript object shapes, validate those objects, and convert them to and from OLDM linked data objects.

## Alignment

### Simplicity over completeness

The package intentionally implements a small subset:

- `shape()`
- `field()`
- `id()`
- `uri()`
- `typed()`
- `node()`
- `collection()`
- `Optional()`
- `Required()`

It does not try to cover all RDF graph validation cases. That keeps the mental model close to normal JavaScript object validation.

### Correct abstraction boundaries

The package is not an ontology, not a parser, not a writer, not a Solid client, and not a form framework.

Its boundary is:

> assert-style JavaScript validation + explicit OLDM predicate mapping + graph/object conversion.

That keeps OLDM core focused on object-linked-data mapping and keeps assert focused on lightweight validation.

### Composable, decoupled components

The package depends only on:

- `@muze-nl/assert`
- `@muze-nl/oldm-core`

It does not depend on the N3 parser, the Turtle parser, Metro, Solid session handling, JSON-LD tooling, SHACL tooling, or ShEx tooling.

### Browser and view-source friendliness

The API is plain JavaScript and follows the existing assert style:

```js
const Contact = shape('vcard$Individual', {
	id: id(uri()),
	name: field('vcard$fn', String),
	nickname: Optional(field('vcard$nickname', String))
})
```

A technically curious non-professional programmer can inspect the shape and see both the JavaScript field names and the linked data predicates in one place.

### Standards alignment

The package uses OLDM short URIs and RDF concepts directly: subject ids, RDF type `a`, named nodes, blank nodes, typed literals, repeated predicate values, and RDF collections.

It does not implement SHACL or ShEx in version 1. This is a deliberate tradeoff: SHACL and ShEx are better standards for RDF graph validation, but they are less direct as the application-facing JavaScript object mapping syntax.

## Known divergences and future improvements

### No SHACL or ShEx export yet

The internal model is intentionally close to a small ShEx-like subset, but the package does not yet export SHACL or ShEx.

Possible future packages or helpers:

- `toShEx()`
- `toShacl()`
- `toJsonSchema()`

These should remain optional so the core package stays small.

### No advanced cardinality helpers yet

Version 1 supports required values, optional values, repeated values with array patterns, and RDF collections.

Possible future helpers:

- `OneOrMore(pattern)`
- `Min(count, pattern)`
- `Max(count, pattern)`
- `OneOf(...patterns)`

These should only be added when concrete use cases need them.

### No inference or graph-wide constraints

The package validates and maps object-shaped data. It does not infer classes or validate arbitrary graph-wide relationships.

SHACL, ShEx, RDFS, OWL, or custom queries are better fits for those cases.

### Empty graph creation is still a little verbose

Examples currently need to construct an empty OLDM graph directly:

```js
const graph = context.addGraph(new Graph([], url, 'text/turtle', context.prefixes, context))
```

A small `context.createGraph(url, type?)` helper in OLDM core would make this clearer and would benefit normal OLDM users too.
