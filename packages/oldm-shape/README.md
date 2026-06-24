# @muze-labs/oldm-shape

`@muze-labs/oldm-shape` is a small assert-style shape layer for OLDM.

It lets application code define a normal JavaScript object shape, validate JavaScript objects against that shape, and map those objects to and from OLDM linked data objects.

The package is intentionally not SHACL, ShEx, JSON Schema, or an ontology language. It is a small application-facing mapper for object-shaped linked data.

## Install

```sh
npm install @muze-labs/oldm-shape @muze-nl/oldm-core @muze-nl/assert
```

This package is experimental and currently lives in the `@muze-labs` namespace.

## Basic use

```js
import oldm, { Graph } from '@muze-nl/oldm-core'
import {
	Optional,
	collection,
	field,
	id,
	node,
	shape,
	typed,
	uri
} from '@muze-labs/oldm-shape'

const context = oldm()
const graph = context.addGraph(new Graph(
	[],
	'https://example.org/contacts.ttl',
	'text/turtle',
	context.prefixes,
	context
))

const Email = shape({
	value: field('vcard$value', uri(/^mailto:/))
})

const Contact = shape('vcard$Individual', {
	id: id(uri()),
	name: field('vcard$fn', String),
	nickname: Optional(field('vcard$nickname', String)),
	birthday: Optional(field('vcard$bday', typed('xsd$date', /^\d{4}-\d{2}-\d{2}$/))),
	email: Optional(field('vcard$hasEmail', node(Email))),
	knows: Optional(field('foaf$knows', [uri()])),
	topics: Optional(field('schema$knowsAbout', collection(String)))
})

const contact = {
	id: 'https://example.org/profile/card#me',
	name: 'Auke',
	nickname: 'poef',
	birthday: '1972-09-20',
	email: {
		value: 'mailto:auke@example.org'
	},
	knows: [
		'https://example.org/alice#me',
		'https://example.org/bob#me'
	],
	topics: ['web', 'solid']
}

const subject = Contact.toOldm(contact, graph)

subject.vcard$fn
// 'Auke'

subject.vcard$hasEmail.vcard$value.id
// 'mailto:auke@example.org'

const plainObject = Contact.fromOldm(subject)
```

## Prefixes

Shape definitions use OLDM short URIs such as `vcard$fn`, `foaf$knows`, or `ex$Contact`. Prefixes are not configured on the shape itself. Configure them on the OLDM context, then create graphs with that context.

```js
import oldm, { Graph } from '@muze-nl/oldm-core'

const context = oldm({
	prefixes: {
		ex: 'https://example.org/ns#',
		vcard: 'http://www.w3.org/2006/vcard/ns#'
	}
})

const graph = context.addGraph(new Graph(
	[],
	'https://example.org/contacts.ttl',
	'text/turtle',
	context.prefixes,
	context
))

const Contact = shape('ex$Contact', {
	name: field('vcard$fn', String)
})
```

OLDM already includes common prefixes such as `rdf`, `rdfs`, `xsd`, `foaf`, `schema`, `vcard`, `solid`, and `acl`. Add your own project or vocabulary prefixes to the context before converting shapes.

`toOldm()` validates prefix use before writing anything to the graph. It throws when a short URI uses an unknown prefix, including shape types, field predicates, typed literal datatypes, `id(uri())` values, and `uri()` values.

```js
const Broken = shape('unknown$Thing', {
	name: field('vcard$fn', String)
})

Broken.toOldm({ name: 'Auke' }, graph)
// throws: unknown OLDM prefix "unknown"
```

## Validation

A shape is a normal assertion function, so it can be used with `@muze-nl/assert`.

```js
import { assert, enable, fails } from '@muze-nl/assert'

enable()

assert(contact, Contact)

const problems = fails(contact, Contact)
```

Each shape also exposes convenience methods:

```js
Contact.fails(contact)
Contact.validate(contact)
Contact.assert(contact)
```

By default validation follows the existing assert style and ignores extra JavaScript object fields:

```js
Contact.fails({ ...contact, extra: true })
// false
```

You can make validation strict when you need that:

```js
Contact.fails({ ...contact, extra: true }, { extra: 'error' })
```

Conversion to OLDM is stricter by default because unknown JavaScript fields would otherwise be silently lost:

```js
Contact.toOldm({ ...contact, extra: true }, graph)
// throws

Contact.toOldm({ ...contact, extra: true }, graph, { extra: 'ignore' })
// allowed
```

## API

### `shape(type?, fields, options?)`

Defines a shape. The optional `type` is mapped to the RDF type property `a`.

```js
const Person = shape('foaf$Person', {
	id: id(uri()),
	name: field('foaf$name', String)
})
```

If the type is omitted, the shape can be used for blank nodes or untyped resources.

```js
const Note = shape({
	text: field('schema$text', String)
})
```

A shape function exposes:

```js
Person.fails(data, options?)
Person.validate(data, options?)
Person.assert(data, options?)
Person.toOldm(data, graph, options?)
Person.fromOldm(subject, options?)
```

### `field(predicate, pattern)`

Maps a JavaScript property to an OLDM predicate.

```js
name: field('vcard$fn', String)
```

### `id(pattern = String)`

Marks the JavaScript field that maps to the OLDM subject id.

```js
id: id(uri())
```

If a shape has no `id()` field, `toOldm()` creates a blank node.

### `uri(pattern = uri-looking string)`

Maps a JavaScript string to an OLDM named node.

```js
homepage: field('foaf$homepage', uri())
emailValue: field('vcard$value', uri(/^mailto:/))
```

`uri()` accepts absolute URI strings, URL objects, and OLDM short URIs such as `foaf$Person`. It leaves URI normalization to OLDM so configured prefixes keep working.

### `typed(datatype, pattern = String)`

Maps a JavaScript literal to an OLDM typed literal.

```js
birthday: field('vcard$bday', typed('xsd$date', /^\d{4}-\d{2}-\d{2}$/))
```

Typed values are converted back to their primitive JavaScript value by `fromOldm()`.

### `node(shapeOrFields)`

Maps a nested JavaScript object to a nested OLDM node.

```js
const Email = shape({
	value: field('vcard$value', uri(/^mailto:/))
})

const Contact = shape('vcard$Individual', {
	email: field('vcard$hasEmail', node(Email))
})
```

Nested shapes without an `id()` field are written as blank nodes. Nested shapes with an `id()` field are written as named subjects in the same graph.

### Arrays for repeated predicate values

Use assert's array style for repeated RDF predicate values:

```js
knows: field('foaf$knows', [uri()])
```

That maps this JavaScript object:

```js
{
	knows: [
		'https://example.org/alice#me',
		'https://example.org/bob#me'
	]
}
```

to repeated `foaf$knows` values, not to an RDF collection.

### `collection(pattern)`

Use `collection()` when you intentionally want an RDF collection/list.

```js
topics: field('schema$knowsAbout', collection(String))
```

### `Optional(pattern)` and `Required(pattern)`

These mirror the wrappers from `@muze-nl/assert`, but preserve the OLDM mapping metadata.

```js
nickname: Optional(field('vcard$nickname', String))
name: Required(field('vcard$fn', String))
```

Use these wrappers from `@muze-labs/oldm-shape` around mapped fields. Validators from `@muze-nl/assert` can still be used inside fields.

## Conversion rules

`toOldm(data, graph, options?)`:

- validates the JavaScript object first
- writes only fields declared by the shape
- writes the shape type to `a` when one is defined
- creates a named subject when an `id()` field is present
- creates a blank node when no `id()` field is present
- treats unknown JavaScript fields as an error by default
- does not fetch linked resources
- does not infer predicates from JavaScript property names

Options:

```js
Contact.toOldm(data, graph, {
	extra: 'error',       // default; use 'ignore' to allow unknown JS fields
	clearMissing: false  // default; true deletes missing mapped predicates
})
```

`fromOldm(subject, options?)`:

- projects only fields declared by the shape
- ignores undeclared OLDM predicates
- checks the RDF type by default when the shape has a type
- rejects multiple RDF values for scalar JavaScript fields
- validates the resulting JavaScript object before returning it

Options:

```js
Contact.fromOldm(subject, {
	requireType: true // default; false skips the RDF type check
})
```

## Non-goals

This package deliberately does not try to be:

- SHACL
- ShEx
- JSON Schema
- RDFS or OWL
- a form framework
- an inference engine
- a Solid session or network layer
- a JSON-LD processor

Those tools may still be useful around OLDM. This package is only the small JavaScript object-shape and mapping layer.
