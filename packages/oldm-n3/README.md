# @muze-nl/oldm-n3

N3 parser/writer adapter for OLDM.

This package keeps the N3 dependency separate from `@muze-nl/oldm-core`, so users who only need the core object mapping layer do not need to install or bundle N3.

```javascript
import oldm from '@muze-nl/oldm-core'
import { n3Parser, n3Writer } from '@muze-nl/oldm-n3'

const context = oldm({
  parser: n3Parser,
  writer: n3Writer
})
```

## Public exports

- `n3Parser(input, uri, type)`
- `n3Writer(source)`

## License

MIT.
