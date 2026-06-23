# Muze alignment: oldm

> Initial alignment roadmap. It is intended as a practical maintenance document, not as a complete code audit.

## Muze design principles

Muze builds web software for technically curious non-professional programmers, without making the tools unattractive to professionals.

We prefer:

- simplicity over completeness
- small, decoupled, single-concern libraries
- correct abstractions that do not cross conceptual boundaries
- browser-native standards where possible
- lightweight abstractions only when they make developer code simpler
- stable, long-term APIs
- components and frameworks that are easy to adapt or replace
- standards-based or open-source hosting stacks that avoid lock-in
- software small enough to work well on slow devices and connections
- a view-source philosophy: invite developers to look under the hood and learn

When making tradeoffs, prefer composability, replaceability, web-platform alignment, and long-term simplicity over convenience, popularity, or feature completeness.


## Muze package namespace policy

The `@muze-nl` npm namespace should be a trust signal. Packages published there should be close to production-ready: the public API is expected to be stable, the package can be installed and used by a fresh project, and the README should be clear about supported usage.

Experimental libraries should use the `@muze-labs` namespace until they are mature enough to carry the main Muze production-readiness signal. Moving from `@muze-labs` into `@muze-nl` should be treated as a release-readiness decision, not only a naming cleanup.

## Current assessment

OLDM is aligned with Muze’s sovereign-web goals because it tries to make Linked Data usable as normal JavaScript objects. Its risk is abstraction correctness: Linked Data has different semantics from ordinary objects, so convenience must not hide identity, graph, multiplicity, or type information too much.

## Strengths

- Addresses a real complexity barrier in Solid/Linked Data applications.
- Keeps data visible as plain JavaScript objects rather than requiring users to manipulate raw triples everywhere.
- Asks users to provide prefixes and parser/writer choices explicitly, which helps keep configuration visible.
- Includes small helper concepts like `one`, `many`, and `first` for common Linked Data friction.

## Alignment issues

### 1. Resolve or isolate the browser/import-map issue around N3

**Principle:** Browser-native standards where possible.

**Problem:** The README notes that the N3 library used by parser/writer helpers is not compatible with ES6 import maps, so that mode is not supported.

**Why it matters:** For a browser-first Muze library, import-map/no-build usage is an important target. A dependency that blocks this weakens web-platform alignment.

**Suggested direction:** Investigate whether N3 can be loaded differently, wrapped behind optional adapters, replaced for browser builds, or split so OLDM core remains import-map compatible.

**Status:** Partly addressed

**Note:** The package is now split so `@muze-nl/oldm-core` has no direct N3 dependency and the N3 integration lives in `@muze-nl/oldm-n3`. The beginner package now publishes both ESM bundles and a classic global IIFE bundle, so plain script-tag usage is supported again. The beginner package still uses N3 by default, so a fully import-map-compatible Turtle adapter remains a future improvement.

### 2. Document semantic tradeoffs of object mapping

**Principle:** Correct abstractions that do not cross conceptual boundaries.

**Problem:** Mapping RDF triples into JavaScript objects is useful, but RDF identity, graph boundaries, repeated predicates, language tags, datatypes, and cycles do not perfectly match ordinary object semantics.

**Why it matters:** The target user should not learn a simplified model that later breaks down in surprising ways.

**Suggested direction:** Add a “What is preserved / what is simplified” section. Include examples of cycles, one-or-many values, literals with types/languages, and subject identity.

**Status:** Partly addressed

**Note:** `Context` now keeps a registry of parsed graphs, exposes a combined read view, provides `context.sources(subject, predicate, value)` for provenance inspection, supports source-aware write helpers through `graph.set/add/delete()` and `context.set/add/delete(..., { graph })`, and routes direct property assignment on named subjects from `context.get(...)` through the same conservative graph resolver. Blank nodes remain graph-scoped and collection mutation is still intentionally conservative.

### 3. Separate core graph/object mapping from parser/writer adapters

**Principle:** Small, decoupled libraries.

**Problem:** If parser/writer dependencies dominate the package, OLDM becomes less replaceable.

**Why it matters:** Users should be able to use OLDM with different RDF parsers/writers or only the mapping layer.

**Suggested direction:** Consider explicit modules: `oldm/core`, `oldm/n3`, and maybe `oldm/helpers`. Make dependency boundaries visible in imports and docs.

**Status:** Done

**Note:** The repository now uses npm workspaces with `@muze-nl/oldm-core`, `@muze-nl/oldm-n3`, and the friendly `@muze-nl/oldm` package. Parser/writer dependencies are isolated from the core mapper.

### 4. Add small end-to-end Solid examples

**Principle:** View-source learnability.

**Problem:** The README shows a profile example, but users need one or two complete minimal workflows.

**Why it matters:** OLDM is likely used by people who know some web basics but not RDF deeply.

**Suggested direction:** Add copy-paste examples: read WebID profile, get display name, edit a field, serialize back to Turtle. Keep them short and inspectable.

**Status:** Open

## Open questions

- Should `prefix$predicate` remain the default property naming convention long-term?
- Should OLDM expose raw triples/graph operations as an escape hatch?
- Which RDF formats should be first-class versus adapter-provided?

## Non-goals

- Do not become a full RDF framework.
- Do not pretend Linked Data is just JSON.
- Do not require a build step for the simplest browser use case if avoidable.

## Review cadence

Review this document before feature work, before releases, and whenever the public API or dependency surface changes. Close issues by changing their status to `Done` and leaving a short note about the decision.


## Experimental Turtle adapter

The repository now contains `@muze-labs/oldm-turtle`, an experimental non-streaming Turtle 1.1 parser/writer adapter. It is a better long-term fit for Muze principles than the broad N3 dependency, but it is not the default yet. The current investigation shows a substantial browser bundle reduction if it replaces N3, while small Solid-style parse/write performance is roughly comparable. See `docs/TURTLE_PARSER_INVESTIGATION.md`.
