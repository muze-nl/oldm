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
import { n3Parser, n3Writer } from '@muze-nl/oldm-n3'

const context = oldm({
  parser: n3Parser,
  writer: n3Writer
})
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
