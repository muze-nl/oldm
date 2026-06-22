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
