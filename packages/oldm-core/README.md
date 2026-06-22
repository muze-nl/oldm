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

`Context` keeps a registry of parsed graphs and exposes a combined read view over all graphs loaded into the same context.

```javascript
const profile = context.parse(profileTurtle, profileUrl, 'text/turtle')
const settings = context.parse(settingsTurtle, settingsUrl, 'text/turtle')

profile.get(`${profileUrl}#me`)       // graph-specific view
context.get(`${profileUrl}#me`)       // combined context view
context.graphs                        // parsed graphs in load order
context.sources[profileUrl]           // graph by source URL
context.data                          // combined subjects
context.subjects                      // combined subject map
```

The combined context view currently merges named subjects by IRI. Graph-specific views remain unchanged, so code can still separate data by original resource.

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
