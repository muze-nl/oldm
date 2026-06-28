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


## Prefix preference

OLDM shortens predicate and type IRIs with the prefixes configured on the context. Prefix declarations found in Turtle input are parser conveniences; they do not decide the JavaScript property names exposed by OLDM.

When multiple prefixes point at the same namespace, client-provided prefixes are preferred over OLDM defaults, and defaults are preferred over prefixes found in a parsed source document. For example, both `pim:` and `space:` are common aliases for `http://www.w3.org/ns/pim/space#`. Since OLDM prefers `space` for that namespace, profile data using either `pim:storage` or `space:storage` is exposed as `space$storage` in JavaScript.

```javascript
const context = oldm({
  parser: n3Parser,
  prefixes: {
    space: 'http://www.w3.org/ns/pim/space#'
  }
})

const profile = context.parse(turtle, profileUrl, 'text/turtle')
const me = profile.subjects[`${profileUrl}#me`]

console.log(me.space$storage.id)
```


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
