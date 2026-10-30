# @muze-nl/oldm

Beginner-friendly OLDM package.

This package exports one default `oldm` object, wires in the N3 parser/writer by default, provides browser bundles, and sets `globalThis.oldm`.

```javascript
import oldm from '@muze-nl/oldm'

const context = oldm.context()
```

For explicit, tree-shakeable imports, use `@muze-nl/oldm-core` and `@muze-nl/oldm-n3` directly:

```javascript
import oldm, { Collection, one, many } from '@muze-nl/oldm-core'
import { n3Parser, n3PatchWriter, n3Writer } from '@muze-nl/oldm-n3'

const context = oldm({
  parser: n3Parser,
  writer: n3Writer,
  patchWriter: n3PatchWriter
})
```


## Literal values

Use `oldm.literal()` to construct a value without needing a graph:

```javascript
const name = oldm.literal('Auke', { language: 'nl-NL' })
const plainName = oldm.literal('Auke', { language: '' })
const birthday = oldm.literal('1972-09-20', {
  type: 'http://www.w3.org/2001/XMLSchema#date'
})
const text = oldm.literal('https://example.org/')
```

The helper accepts strings and numbers, including boxed values, and returns a
fresh boxed value. It copies existing language/type metadata unless overridden
and does not modify the input. An explicit empty language is preserved.
Supply a full datatype IRI, or expand shorthand explicitly using
`context.fullURI('xsd$date')`. The standalone constructor has no prefix context.
URL-shaped text stays a literal when passed to graph write helpers. Use `String(value)` or `Number(value)` for the primitive value.

The same helper is available as the named `literal` export from
`@muze-nl/oldm-core`. Existing `graph.setLanguage()` calls remain supported,
including their in-place behavior for boxed values. Deletion matching is
unchanged by the new constructor.

## Property prefixes and IRI values

Only property names are shortened. Class values (`subject.a`) and literal
datatypes (`value.type`, when present) are full IRIs in both source graphs and
combined context views. Linked objects retain their full IRI in `.id`.

Property names in source graphs prefer source prefixes. Combined context views
prefer client-provided prefixes, then OLDM defaults, then source prefixes.
Namespace aliases, such as OLDM's schema.org HTTP/HTTPS mapping, apply to
property-name shortening; value IRIs retain their original namespace.

```javascript
const context = oldm.context({
  prefixes: { person: 'http://xmlns.com/foaf/0.1/' }
})
const graph = context.parse(turtle, profileUrl, 'text/turtle')
const me = context.get(`${profileUrl}#me`)

me.a // 'http://xmlns.com/foaf/0.1/Person', or an array of class IRIs
const personClass = context.fullURI('person$Person')
oldm.many(me.a).includes(personClass)
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

A context keeps a registry of every parsed graph. Each `context.parse()` call still returns a `Graph` for the parsed resource, while the context exposes a combined view over all graphs loaded into that context.

```javascript
const context = oldm.context()

const profile = context.parse(profileTurtle, profileUrl, 'text/turtle')
const settings = context.parse(settingsTurtle, settingsUrl, 'text/turtle')

profile.get(`${profileUrl}#me`)       // data from only the profile graph
context.get(`${profileUrl}#me`)       // merged data from all graphs
context.graphs                        // [profile, settings]
context.graph(profileUrl)             // profile
context.data                          // combined subject list
context.subjects                      // combined subject map by full URI
context.sources(context.get(`${profileUrl}#me`))
// [profile, settings] when both graphs contain data for that subject
context.sources(context.get(`${profileUrl}#me`), 'vcard$fn')
// [profile] when only the profile graph contains that property
```

The combined view merges named subjects by IRI and keeps the original graph views separate. `context.sources(subject, predicate, value)` can be used to inspect which graph contributed a subject, property, or specific property value.

For source-aware writes, use the graph-specific helpers when you know the resource you want to edit:

```javascript
profile.set(`${profileUrl}#me`, 'vcard$fn', 'Auke')
profile.add(`${profileUrl}#me`, 'schema$knowsAbout', 'Linked Data')
profile.delete(`${profileUrl}#me`, 'schema$knowsAbout', 'Old value')
```

Or use context-level helpers with an explicit graph:

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

## Solid PATCH output

`oldm.context()` wires in the N3 patch writer by default. After parsing and editing a graph, call `graph.patch()` to generate a Solid N3 Patch string instead of a full Turtle document.

```javascript
const profile = context.parse(profileTurtle, profileUrl, 'text/turtle')
profile.set(`${profileUrl}#me`, 'vcard$fn', 'Auke C.')

const patch = await profile.patch()
```

## Browser bundles

The friendly package provides both a modern ESM bundle and a classic global IIFE bundle.

For modern module scripts:

```html
<script type="module">
  import oldm from 'https://cdn.jsdelivr.net/npm/@muze-nl/oldm/dist/oldm.min.js'

  const context = oldm.context()
</script>
```

For a classic script tag that creates `globalThis.oldm`:

```html
<script src="https://cdn.jsdelivr.net/npm/@muze-nl/oldm/dist/oldm.global.min.js"></script>
<script>
  const context = oldm.context()
</script>
```

## License

MIT.
