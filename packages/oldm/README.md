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


## Multiple graphs in one context

A context now keeps a registry of every parsed graph. Each `context.parse()` call still returns a `Graph` for the parsed resource, while the context exposes a combined read view over all graphs loaded into that context.

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

The combined view merges named subjects by IRI and keeps the original graph views separate. `context.sources(subject, predicate, value)` can be used to inspect which graph contributed a subject, property, or specific property value. Write routing is intentionally left for a later step.

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
