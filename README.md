# OLDM: Object Linked Data Mapper

OLDM is now structured as a small npm-workspaces monorepo. The split keeps the core object mapping package tree-shakeable and dependency-light, while preserving a beginner-friendly package that exposes a single `oldm` object and installs `globalThis.oldm` for browser use.

## Packages

| Package | Role |
| --- | --- |
| `@muze-nl/oldm-core` | Core object/graph mapping, helpers, and classes. Explicit ESM exports only. No N3 dependency and no global side effects. |
| `@muze-nl/oldm-n3` | N3 parser/writer adapter for OLDM. Depends on `n3` and `@muze-nl/oldm-core`. |
| `@muze-nl/oldm` | Beginner-friendly package. Exports one default `oldm` object, provides default N3 parser/writer wiring, browser bundles, and sets `globalThis.oldm`. |

## Installation

For the friendly default package:

```shell
npm install @muze-nl/oldm
```

```javascript
import oldm from '@muze-nl/oldm'

const context = oldm.context()
```

For explicit, tree-shakeable use:

```shell
npm install @muze-nl/oldm-core @muze-nl/oldm-n3
```

```javascript
import oldm, { one, many, Collection } from '@muze-nl/oldm-core'
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
context.sources[profileUrl]           // profile
context.data                          // combined subject list
context.subjects                      // combined subject map by full URI
```

The combined view merges named subjects by IRI and keeps the original graph views separate. Write routing and explicit source/provenance APIs are intentionally left for a later step.

## Browser bundles

The friendly package builds browser bundles into `packages/oldm/dist/`: an ESM bundle for module scripts and a classic global IIFE bundle for plain script tags.

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

## Development

Install dependencies from the repository root:

```shell
npm install
```

Run all package tests:

```shell
npm test
```

Build the browser bundles for `@muze-nl/oldm`:

```shell
npm run build-dev
npm run build
```

Run coverage for all workspaces:

```shell
npm run coverage
```

## Example

```javascript
import oldm from '@muze-nl/oldm'

const context = oldm.context({
  prefixes: {
    schema: 'https://schema.org/',
    vcard: 'http://www.w3.org/2006/vcard/ns#',
    foaf: 'http://xmlns.com/foaf/0.1/'
  }
})

const url = 'https://example.org/profile/card#me'
const response = await fetch(url)
const text = await response.text()
const source = context.parse(text, url, 'text/turtle')

console.log(source.primary.vcard$fn)
```

## License

MIT. See [LICENSE](./LICENSE).
