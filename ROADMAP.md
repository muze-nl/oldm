# OLDM Roadmap

This document collects follow-up work for OLDM after the package split into `@muze-nl/oldm-core`, `@muze-nl/oldm-n3`, and the beginner-friendly `@muze-nl/oldm` package.

The current architecture is much closer to Muze’s design principles than the original single package: the core is explicit and tree-shakeable, N3 is isolated in an adapter, and the friendly browser package intentionally provides the one-object/global API. The next improvements should keep that separation intact.

## Guiding principles

- Keep `@muze-nl/oldm-core` small, explicit, side-effect free, and parser/writer agnostic.
- Keep beginner convenience in `@muze-nl/oldm`, not in the core package.
- Prefer small public APIs over hidden magic.
- Use explicit APIs where ambiguity matters, but keep sensible defaults for the common case.
- Avoid turning OLDM into a full triplestore. It should remain an object-friendly linked-data mapper.
- Preserve the ability to inspect, understand, and replace each part of the system.

## 1. Dirty tracking per graph

### Problem

OLDM now supports editing data across multiple graphs/resources, including source-aware writes. The missing workflow piece is knowing which original resources need to be saved after editing.

### Proposed API

```js
graph.changed        // boolean
graph.markClean()

context.changedGraphs // array of changed graphs
```

Any source-aware mutation should mark the target graph as changed:

```js
graph.set(subject, predicate, value)
graph.add(subject, predicate, value)
graph.delete(subject, predicate, value)

context.set(subject, predicate, value, { graph })
context.add(subject, predicate, value, { graph })
context.delete(subject, predicate, value, { graph })

context.get(subject).vcard$fn = 'Auke'
delete context.get(subject).vcard$nickname
```

### Notes

- Parsing a graph should not mark it as changed.
- Calling `graph.markClean()` should reset the flag after a successful save.
- Replacing a graph in a context should not accidentally preserve dirty state from an older graph with the same URL unless explicitly intended.
- Dirty tracking should remain per graph, not only per context.

### Tests

- Parsed graphs start clean.
- Each write API marks exactly the target graph changed.
- A direct assignment on a merged context subject marks the resolved graph changed.
- Ambiguous direct writes should throw and should not mark any graph changed.
- `graph.markClean()` resets the flag.
- `context.changedGraphs` returns only changed graphs.

## 2. Explicit value constructors

### Problem

OLDM currently has convenient heuristics for turning values into literals, named nodes, blank nodes, and collections. This is useful for beginners, but it can become ambiguous.

For example:

```js
graph.set(me, 'foaf$homepage', 'https://example.org/')
graph.set(me, 'schema$text', 'https://example.org/')
```

The first likely means an IRI, while the second may mean a literal string.

### Proposed API

```js
oldm.named('https://example.org/')
oldm.literal('https://example.org/')
oldm.literal('1972-09-20', { type: 'xsd$date' })
oldm.literal('Auke', { language: 'nl' })
oldm.collection(['web', 'solid'])
```

Possible names to consider:

```js
oldm.node(...)
oldm.namedNode(...)
oldm.literal(...)
oldm.list(...)
oldm.collection(...)
```

### Notes

- Keep the current heuristics for beginner-friendly use.
- Use explicit constructors in examples where precision matters.
- Constructors should be available from `@muze-nl/oldm-core` and re-exported on the friendly `oldm` object.
- Avoid making constructors depend on N3 or RDF/JS internals.

### Tests

- `oldm.named(url)` always writes as an IRI.
- `oldm.literal(url)` always writes as a literal string, even if it looks like a URL.
- typed and language literals round-trip.
- `oldm.collection([...])` creates a public `Collection`.
- constructors work through both core named imports and the friendly `oldm` object.

## 3. Harden the context graph registry

### Problem

The context graph registry should be public enough to inspect, but not easy to corrupt accidentally.

Mutable public structures make it possible to break invariants:

```js
context.graphs.length = 0
context.graphsByUrl[profileUrl] = null
```

### Proposed API

```js
context.graphs        // read-only array or fresh copy
context.graph(url)    // lookup by URL
context.hasGraph(url)
context.addGraph(graph)
context.removeGraph(url)
```

### Notes

- Consider using private fields internally.
- If `context.graphs` returns a copy, document that mutating it does not affect the context.
- `removeGraph(url)` should update all combined indexes/views consistently.
- Avoid exposing `graphsByUrl` directly.

### Tests

- Mutating the array returned by `context.graphs` does not corrupt the context.
- `context.graph(url)` still works after reading `context.graphs`.
- `context.removeGraph(url)` removes the graph from combined `subjects`, `data`, `get()`, and `sources()`.
- Re-adding a graph with the same URL replaces the previous graph consistently.

## 4. Document or stabilize combined context subject identity

### Problem

The combined context view may rebuild merged subjects on demand. If so, this can be surprising:

```js
context.get(me) === context.get(me) // may be false
```

The API should either guarantee stable identity or clearly document that context subjects are temporary merged views.

### Option A: document temporary merged views

This is the simplest approach.

Document that:

- graph-level subjects are stable within a graph;
- context-level subjects are merged views;
- callers should not rely on object identity between separate `context.get(id)` calls;
- changes should be made through source-aware APIs or direct assignment on the retrieved view.

### Option B: cache merged subjects

This is more convenient but adds implementation complexity.

If caching is chosen:

- cache invalidation must happen on graph writes, graph replacement, and graph removal;
- direct assignment proxies must continue to route writes correctly;
- memory use should stay bounded and understandable.

### Suggested direction

Start with Option A. It is simpler and more Muze-aligned for now. Revisit caching only if unstable identity becomes a real developer experience problem.

### Tests

If documented as temporary views:

- add tests that public behavior works without relying on identity;
- avoid tests that require `context.get(id) === context.get(id)`.

If stable identity is implemented:

- assert repeated `context.get(id)` returns the same object until relevant graph changes;
- assert cache invalidation after graph writes and replacement.

## 5. Add save-oriented APIs or examples

### Problem

After dirty tracking, users need a clear way to save only changed resources.

### Minimal API

Keep persistence outside the core package:

```js
for (const graph of context.changedGraphs) {
  const turtle = await graph.write()
  await save(graph.url, turtle)
  graph.markClean()
}
```

### Possible future package

If fetch-based loading/saving becomes useful, put it in a separate package:

```text
@muze-labs/oldm-fetch
```

or similar.

Possible API:

```js
const profile = await oldmFetch.load(context, profileUrl)
await oldmFetch.saveChanged(context)
```

### Notes

- Do not put network fetch behavior in `@muze-nl/oldm-core`.
- Keep persistence replaceable.
- The beginner package may eventually include a tiny optional helper, but only if it stays simple.

### Tests

- `graph.write()` works after source-aware edits.
- only changed graphs are saved in example/helper tests.
- failed saves do not call `markClean()`.

## 6. Remove console side effects from library code

### Problem

Library code should not unexpectedly write to the console. Current examples to clean up include messages such as:

```js
console.error('Could not parse prefix', ...)
console.log('oldm-ns: encountered unknown object', ...)
```

### Proposed approach

Replace console output with one of:

- thrown errors for invalid input;
- ignored values for harmless unsupported cases;
- optional diagnostics hooks if genuinely useful later.

For example:

```js
const context = oldm({
  onWarning(warning) {
    // optional user-controlled logging
  }
})
```

Do not add a diagnostics system unless there is a clear need.

### Tests

- invalid prefixes throw or are handled predictably.
- unsupported values do not produce console output during normal tests.
- if warnings are added, warnings are delivered through the public hook.

## 7. Clarify prefix behavior

### Problem

There are existing FIXME comments around prefix handling:

```js
// FIXME: don't add the same url with different prefixes
// FIXME: don't assume the xsd url always has the 'xsd' prefix
```

Prefix behavior matters because OLDM exposes prefixed names as object property names.

### Decisions to make

- What happens if two prefixes point to the same URL?
- What happens if a document uses a non-`xsd` prefix for the XML Schema namespace?
- Do user-configured prefixes override parsed prefixes?
- Does the first prefix win, or does the latest parsed prefix win?

### Suggested rule

Prefer predictability:

1. user-configured prefixes win;
2. existing prefixes are not overwritten by parsed prefixes;
3. first parsed prefix wins for a namespace URL;
4. XML Schema datatypes should be recognized by namespace URL, not by assuming the prefix is `xsd`.

### Tests

- same namespace with two prefixes uses the documented winner.
- user-configured prefixes are preserved.
- `xsd:date` metadata works even if the source document uses another prefix for the XSD namespace.
- `shortURI()` and `fullURI()` follow the documented rules.

## 8. Add bundle smoke tests

### Problem

The package tests mainly exercise source entry points. The generated browser bundles should also be checked so they do not silently break.

### Proposed tests

For ESM bundle:

```js
const oldm = await import('../dist/oldm.min.js')
```

For IIFE/global bundle:

- run `dist/oldm.global.min.js` in a small VM/browser-like global context;
- assert `globalThis.oldm` exists;
- assert `oldm.context()` works.

### Notes

- Keep tests lightweight.
- Do not require a real browser unless needed.
- Make sure both development and minified bundles are tested if possible.

## 9. Add or remove linting

### Problem

The repo includes linting dependencies, but linting is not yet part of the normal scripts.

### Options

A. Add linting:

```json
{
  "scripts": {
    "lint": "eslint packages/**/*.mjs"
  }
}
```

B. Remove ESLint dependencies for now.

### Suggested direction

Add a minimal lint script if it does not introduce a lot of configuration. Otherwise remove the dependency until it is useful.

## 10. Improve CI and generated bundle handling

### Current issue

The build workflow should be careful about generated `dist/` files under the monorepo package path.

### Proposed improvements

- Use `npm ci` in CI.
- Run `npm test`.
- Run `npm run build`.
- Either:
  - commit generated bundles manually as part of release commits, or
  - fail CI if build outputs differ from committed files.

### Notes

Auto-committing build artifacts from workflows can be convenient, but it can also make review and branch behavior harder to understand.

A simple check script may be clearer:

```sh
npm run build
git diff --exit-code -- packages/oldm/dist
```

## 11. Turtle-only parser/writer

### Problem

N3 is now isolated, but the beginner package still depends on it through `@muze-nl/oldm-n3`.

N3 is capable and useful, but broader than OLDM needs:

- multiple linked-data formats;
- streaming support;
- broader RDF tooling;
- larger bundle;
- packaging complexity for plain browser use.

### Proposed direction

Create an experimental package first:

```text
@muze-labs/turtle
```

or:

```text
@muze-labs/oldm-turtle
```

Scope for v1:

- Turtle only;
- no streaming;
- ESM first;
- browser-native;
- readable implementation;
- public parser/writer adapter compatible with OLDM.

Supported features should include:

- `@prefix` / `PREFIX`;
- `@base` / `BASE`;
- IRI references;
- prefixed names;
- `a` as `rdf:type`;
- string literals;
- language tags;
- datatype tags;
- numbers;
- booleans;
- blank node property lists;
- blank node labels;
- collections;
- predicate lists;
- object lists;
- relative IRI resolution;
- comments.

Explicitly out of scope for v1:

- TriG;
- N-Quads;
- RDF/XML;
- JSON-LD;
- N3 rules/reasoning;
- SPARQL;
- streaming input/output;
- RDF store functionality.

### Tests

Use a mix of:

- W3C Turtle tests where practical;
- small hand-written OLDM-focused fixtures;
- real Solid profile/contact preference documents;
- round-trip tests through OLDM’s public object model.

### Status

Started as `@muze-labs/oldm-turtle` in `packages/oldm-turtle`. The first experiment supports the common Turtle 1.1 features used by small Solid-style documents and includes a comparison script:

```sh
npm run compare:turtle
```

See `docs/TURTLE_PARSER_INVESTIGATION.md` for current size and benchmark results. The package should remain experimental until it has broader conformance tests and real-world Solid fixtures.

## 12. Document the object ↔ RDF mapping contract

### Problem

OLDM intentionally maps RDF into a friendlier JavaScript object model. This is useful, but the exact semantic tradeoffs should be explicit.

### Topics to document

- subject identity;
- graph/resource identity;
- merged context views;
- repeated predicates as arrays;
- `one()`, `many()`, and `first()`;
- language-tagged literals;
- typed literals;
- named nodes;
- blank nodes;
- collections;
- cycles and references;
- source/provenance behavior;
- source-aware writes;
- direct assignment behavior;
- unsupported RDF features.

### Suggested file

```text
docs/object-mapping.md
```

This should be user-facing documentation, not just an internal alignment note.

## Suggested implementation order

1. Dirty tracking per graph.
2. Explicit value constructors.
3. Harden context graph registry.
4. Clarify context merged-view identity in documentation.
5. Add save-oriented examples.
6. Remove console side effects.
7. Clarify prefix behavior.
8. Add bundle smoke tests.
9. Add or remove linting.
10. Improve CI/build artifact handling.
11. Start the Turtle-only parser/writer experiment.
12. Document the full object ↔ RDF mapping contract.

The first five items complete the new multi-graph editing workflow. The remaining items improve reliability, browser confidence, and long-term Muze alignment.
