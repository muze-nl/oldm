# @muze-nl/oldm-core

Core Object Linked Data Mapper package.

This package contains the object/graph mapping layer only. It has explicit ESM exports, no bundled parser/writer, no N3 dependency, and no global side effects.

```javascript
import oldm, { one, many, first, Collection } from '@muze-nl/oldm-core'
import { n3Parser, n3PatchWriter, n3Writer } from '@muze-nl/oldm-n3'

const context = oldm({
  parser: n3Parser,
  writer: n3Writer,
  patchWriter: n3PatchWriter
})
```


## Literal values

Create literals without a graph or parser:

```javascript
import { literal } from '@muze-nl/oldm-core'

const name = literal('Auke', { language: 'nl-NL' })
const plainName = literal('Auke', { language: '' })
const birthday = literal('1972-09-20', {
  type: 'http://www.w3.org/2001/XMLSchema#date'
})
const text = literal('https://example.org/')
```

`literal(value, options)` accepts strings and numbers, including boxed values.
It returns a fresh boxed value with optional `.language` and `.type` metadata.
Existing metadata is copied unless overridden; the input is not modified.
An explicit empty language is retained as `language: ''`. A supplied datatype
must be a full IRI: this standalone constructor has no prefix context. Expand
shorthand explicitly with `context.fullURI('xsd$date')` when needed.

Pass these values to `graph.set()` or `context.set()` like other OLDM values.
Boxing keeps URL-shaped text a literal instead of letting it become a named node.
Use `String(value)` or `Number(value)` to obtain its primitive value.

`graph.setLanguage(value, language)` remains available for compatibility,
including its existing behavior of modifying an already boxed value in place.
Prefer `literal()` for new code. Deletion matching is unchanged by this helper.

## Property prefixes and IRI values

Only property names are shortened. Class values (`subject.a`) and literal
datatypes (`value.type`, when present) are full IRIs in both source graphs and
combined context views. Linked objects retain their full IRI in `.id`.

Property names in source graphs prefer source prefixes. Combined context views
prefer client-provided prefixes, then OLDM defaults, then source prefixes.
Namespace aliases, such as OLDM's schema.org HTTP/HTTPS mapping, apply to
property-name shortening; value IRIs retain their original namespace.

```javascript
const context = oldm({
  parser: n3Parser,
  prefixes: { person: 'http://xmlns.com/foaf/0.1/' }
})
const graph = context.parse(turtle, profileUrl, 'text/turtle')
const me = context.get(`${profileUrl}#me`)

me.a // 'http://xmlns.com/foaf/0.1/Person', or an array of class IRIs
const personClass = context.fullURI('person$Person')
many(me.a).includes(personClass)
```

`graph.set/add/delete()` and context write helpers still accept shorthand class
inputs. They expand the input once using the receiving graph or context's
prefixes. `graph.setType()` and `context.setType()` do the same for datatypes.
Unresolved shorthand such as `missing$Person` is rejected at these write
boundaries. Relative class/datatype references on a graph resolve against its
URL; standalone values and context datatype setters require absolute IRIs.
Absolute IRIs, including URNs, are accepted without namespace rewriting.

`context.sources(id, 'a', className)` accepts a full IRI or shorthand, preferring
context prefixes and falling back to non-conflicting source prefixes. Matching
compares exact IRIs: HTTP and HTTPS namespaces are distinct. For repeated
filtering, expand the requested class once outside the loop.

Source subjects remain ordinary objects. When assigning `subject.a` or literal
metadata directly, supply full IRIs. Context subject assignment still delegates
to the context write helpers. Turtle output may use prefixes or relative IRIs
without changing the represented value.

### URI helpers and relative references

`fullURI(value)` always returns a valid absolute IRI or throws `TypeError`.
It expands a known prefix by exact string concatenation, preserving the entire
suffix, including an empty suffix. Relative references use RFC 3986 base
resolution. Absolute inputs are validated without normalization: case, Unicode,
percent escapes, and namespace identity are preserved.

`shortURI(iri)` returns a prefixed spelling, or the unchanged absolute IRI when
no prefix matches. It never returns a relative reference or applies namespace
aliases. Aliases still apply when mapping predicates to object property names.

`relativeURI(iri, baseURI)` returns a relative reference only when resolving it
against the base reproduces the exact input IRI; otherwise it returns the
absolute IRI. The base argument is optional: graph helpers default to
`graph.baseURI`, initially the graph URL without its fragment. Context helpers
use the optional `baseURI` context setting. Without a base, `relativeURI`
retains the absolute IRI, and `fullURI` rejects relative inputs.

For a graph whose base is `https://example.org/data/card`, with `foo` mapped to
that same IRI:

```js
graph.fullURI('foo$/child') // 'https://example.org/data/card/child'
graph.fullURI('card/child') // 'https://example.org/data/card/child'
graph.fullURI('/child')     // 'https://example.org/child'
graph.shortURI('https://example.org/data/card/child') // 'foo$/child'
graph.relativeURI('https://example.org/data/card/child') // 'card/child'
```

An unknown `$` prefix throws; use `./price$tag` for a relative path that contains
`$`. With `:` as the separator, an unknown `scheme:value` can still be a valid
absolute IRI (for example `urn:example`). These API strings have no Turtle angle
brackets or backslash escapes.

Both Turtle writers prefer a valid prefixed name, then an exact relative
reference, then an absolute IRI. They emit `@base` explicitly so relative output
keeps its meaning when the document is moved. Turtle local-name escaping is
handled by the writer: internal `foo$/child` becomes `foo:\/child`. N-Triples and
N-Quads continue to use absolute IRIs; PATCH output keeps its absolute fallback.

### Migrating from shorthand values

Replace comparisons such as `many(subject.a).includes('foaf$Person')` with a
comparison against `context.fullURI('foaf$Person')`. Compare literal datatypes
against full IRIs too. Shape declarations can keep shorthand class/datatype
inputs; `oldm-shape` resolves them against the subject's graph or context.

Pass full datatype IRIs to standalone `literal()` calls. Existing serialized
Turtle needs no migration. Application-owned JSON that contains shorthand class
or datatype values must resolve those values with its recorded prefixes when
loading. OLDM does not silently rewrite stored application documents.

## Multiple graphs in one context

`Context` keeps a registry of parsed graphs and exposes a combined view over all graphs loaded into the same context.

```javascript
const profile = context.parse(profileTurtle, profileUrl, 'text/turtle')
const settings = context.parse(settingsTurtle, settingsUrl, 'text/turtle')

profile.get(`${profileUrl}#me`)       // graph-specific view
context.get(`${profileUrl}#me`)       // combined context view
context.graphs                        // parsed graphs in load order
context.graph(profileUrl)             // graph by source URL
context.data                          // combined subjects
context.subjects                      // combined subject map
context.sources(context.get(`${profileUrl}#me`))
// graphs containing that subject
context.sources(context.get(`${profileUrl}#me`), 'vcard$fn')
// graphs containing that property
context.sources(context.get(`${profileUrl}#me`), 'vcard$fn', 'Auke')
// graphs containing that specific value
profile.context.data                  // same combined view, starting from a graph
profile.context.subjects              // same combined subject map, starting from a graph
```

The combined context view merges named subjects by IRI. Graph-specific views remain unchanged, so code can still separate data by original resource. Blank nodes remain graph-scoped.

If a loader or middleware gives you a `Graph`, use `graph.context` to access the combined view for all graphs loaded into the same context:

```javascript
const graph = context.parse(profileTurtle, profileUrl, 'text/turtle')

graph.data             // subjects from this one resource
graph.context.data     // combined subjects from the whole context
graph.context.get(id)  // merged subject from the whole context
```

For source-aware writes, use the graph-specific helpers when you know the resource you want to edit:

```javascript
profile.set(`${profileUrl}#me`, 'vcard$fn', 'Auke')
profile.add(`${profileUrl}#me`, 'schema$knowsAbout', 'Linked Data')
profile.delete(`${profileUrl}#me`, 'schema$knowsAbout', 'Old value')
```

Context-level helpers can choose a graph explicitly:

```javascript
context.set(`${profileUrl}#me`, 'vcard$fn', 'Auke', { graph: profile })
context.add(`${profileUrl}#me`, 'schema$knowsAbout', 'Solid', { graph: profileUrl })
```

When no graph is passed, `context.set/add/delete()` uses a conservative default: the subject's exact graph URL, the subject document URL without a fragment, the only graph that currently contains the subject, the configured `defaultGraph`, or the only graph in the context. Direct property assignment on a named subject from `context.get(...)` uses the same resolver, so simple edits can stay object-like:

```javascript
const me = context.get(`${profileUrl}#me`)
me.vcard$fn = 'Auke'
delete me.vcard$nickname
```

If there is no obvious source graph, OLDM throws and asks you to choose one explicitly with `context.set/add/delete(..., { graph })` or `graph.set/add/delete(...)`.

## PATCH output

`Graph#patch()` delegates to the configured `patchWriter`, just like `Graph#write()` delegates to `writer`. Core stays parser/writer agnostic; use `n3PatchWriter` from `@muze-nl/oldm-n3` when you want Solid N3 Patch output.

Patch writers can support owned anonymous values conservatively: fresh blank nodes and RDF collections can be inserted, while changed or deleted existing anonymous values are replaced as complete closures. Shared or cyclic anonymous values should fall back to full document replacement.

## Public exports

- default `oldm(options)` context factory
- `Context`
- `Graph`
- `NamedNode`
- `BlankNode`
- `Collection`
- `literal(value, options)`
- `one(values, whichOne)`
- `many(values)`
- `first(...values)`
- `prefixes`
- `rdfType`

## License

MIT.
