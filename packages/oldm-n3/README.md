# @muze-nl/oldm-n3

N3 parser/writer adapter for OLDM.

This package keeps the N3 dependency separate from `@muze-nl/oldm-core`, so users who only need the core object mapping layer do not need to install or bundle N3.

```javascript
import oldm from '@muze-nl/oldm-core'
import { n3Parser, n3PatchWriter, n3Writer } from '@muze-nl/oldm-n3'

const context = oldm({
  parser: n3Parser,
  writer: n3Writer,
  patchWriter: n3PatchWriter
})
```

`n3PatchWriter` generates Solid N3 Patch output by diffing the original parsed source against the graph's current Turtle output. Owned anonymous values are supported conservatively: inserting a fresh blank node or collection emits it in `solid:inserts`, while changing or deleting an existing blank node or collection replaces the owning named-subject triple and the complete old anonymous closure through variables in `solid:where`/`solid:deletes`. Shared or cyclic anonymous values are rejected so callers can fall back to a full `PUT`.

## Public exports

- `n3Parser(input, uri, type)`
- `n3Writer(source)`
- `n3PatchWriter(source)`

## License

MIT.
