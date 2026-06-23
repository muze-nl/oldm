# @muze-nl/oldm-core

Core Object Linked Data Mapper package.

This package contains the object/graph mapping layer only. It has explicit ESM exports, no bundled parser/writer, no N3 dependency, and no global side effects.

```javascript
import oldm, { one, many, first, Collection } from '@muze-nl/oldm-core'
import { n3Parser, n3Writer } from '@muze-nl/oldm-n3'

const context = oldm({
  parser: n3Parser,
  writer: n3Writer
})
```


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
```

The combined context view merges named subjects by IRI. Graph-specific views remain unchanged, so code can still separate data by original resource. Blank nodes remain graph-scoped.

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

## Public exports

- default `oldm(options)` context factory
- `Context`
- `Graph`
- `NamedNode`
- `BlankNode`
- `Collection`
- `one(values, whichOne)`
- `many(values)`
- `first(...values)`
- `prefixes`
- `rdfType`

## License

MIT.
