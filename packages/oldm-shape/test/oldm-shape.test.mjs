import tap from 'tap'
import { fails } from '@muze-nl/assert'
import oldm, { Collection, Graph, NamedNode } from '@muze-nl/oldm-core'
import {
	Optional,
	Required,
	collection,
	field,
	id,
	node,
	shape,
	typed,
	uri
} from '@muze-labs/oldm-shape'

function graphFor(url='https://example.org/contacts.ttl') {
	const context = oldm({
		prefixes: {
			foaf: 'http://xmlns.com/foaf/0.1/',
			schema: 'http://schema.org/',
			vcard: 'http://www.w3.org/2006/vcard/ns#',
			xsd: 'http://www.w3.org/2001/XMLSchema#'
		}
	})
	return context.addGraph(new Graph([], url, 'text/turtle', context.prefixes, context))
}

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

tap.test('shape works as an assert-compatible validator', t => {
	t.notOk(fails(contact, Contact))
	t.notOk(Contact.fails(contact))

	const problems = Contact.fails({...contact, name: ''})
	t.ok(problems)
	t.equal(problems[0].path, 'name')

	t.notOk(Contact.fails({...contact, extra: true}))
	t.ok(Contact.fails({...contact, extra: true}, { extra: 'error' }))

	t.end()
})

tap.test('toOldm maps JavaScript objects to OLDM subjects', t => {
	const graph = graphFor()
	const subject = Contact.toOldm(contact, graph)

	t.equal(subject.id, contact.id)
	t.equal(subject.a, 'vcard$Individual')
	t.equal(String(subject.vcard$fn), 'Auke')
	t.equal(String(subject.vcard$nickname), 'poef')
	t.equal(String(subject.vcard$bday), '1972-09-20')
	t.equal(subject.vcard$bday.type, 'xsd$date')
	t.equal(subject.vcard$hasEmail.vcard$value.id, 'mailto:auke@example.org')
	t.ok(subject.foaf$knows[0] instanceof NamedNode)
	t.same(subject.foaf$knows.map(value => value.id), contact.knows)
	t.ok(subject.schema$knowsAbout instanceof Collection)
	t.same([...subject.schema$knowsAbout].map(String), ['web', 'solid'])

	t.end()
})

tap.test('toOldm rejects extra fields by default during conversion', t => {
	const graph = graphFor()
	t.throws(() => Contact.toOldm({...contact, unknown: true}, graph), /OLDM shape validation failed/)
	t.doesNotThrow(() => Contact.toOldm({...contact, unknown: true}, graph, { extra: 'ignore' }))
	t.end()
})



tap.test('toOldm rejects unknown prefixes before writing to the graph', t => {
	const graph = graphFor()

	const UnknownType = shape('unknown$Thing', {
		name: field('vcard$fn', String)
	})
	t.throws(() => UnknownType.toOldm({ name: 'Auke' }, graph), /OLDM shape prefix validation failed/)

	const UnknownPredicate = shape('vcard$Individual', {
		name: field('unknown$name', String)
	})
	t.throws(() => UnknownPredicate.toOldm({ name: 'Auke' }, graph), /OLDM shape prefix validation failed/)

	const UnknownDatatype = shape('vcard$Individual', {
		date: field('vcard$bday', typed('unknown$date', String))
	})
	t.throws(() => UnknownDatatype.toOldm({ date: '2026-06-24' }, graph), /OLDM shape prefix validation failed/)

	const UnknownIdValue = shape('vcard$Individual', {
		id: id(uri()),
		name: field('vcard$fn', String)
	})
	t.throws(() => UnknownIdValue.toOldm({ id: 'unknown$me', name: 'Auke' }, graph), /OLDM shape prefix validation failed/)

	const UnknownUriValue = shape('vcard$Individual', {
		homepage: field('foaf$homepage', uri())
	})
	t.throws(() => UnknownUriValue.toOldm({ homepage: 'unknown$home' }, graph), /OLDM shape prefix validation failed/)

	const WithKnownProjectPrefix = shape('ex$Thing', {
		id: id(uri()),
		link: field('ex$link', uri())
	})
	const context = oldm({ prefixes: { ex: 'https://example.org/ns#' } })
	const projectGraph = context.addGraph(new Graph([], 'https://example.org/data.ttl', 'text/turtle', context.prefixes, context))
	t.doesNotThrow(() => WithKnownProjectPrefix.toOldm({
		id: 'ex$me',
		link: 'ex$other'
	}, projectGraph))

	t.end()
})

tap.test('toOldm maps objects without ids to blank nodes', t => {
	const graph = graphFor()
	const Note = shape({
		text: field('schema$text', String)
	})
	const subject = Note.toOldm({ text: 'Hello' }, graph)

	t.notOk(subject.id)
	t.equal(subject.schema$text, 'Hello')
	t.equal(subject.graph, graph)

	t.end()
})

tap.test('fromOldm maps OLDM subjects back to JavaScript objects', t => {
	const graph = graphFor()
	const subject = Contact.toOldm(contact, graph)
	const result = Contact.fromOldm(subject)

	t.same(result, contact)
	t.end()
})

tap.test('fromOldm detects unexpected missing RDF type by default', t => {
	const graph = graphFor()
	const subject = Contact.toOldm(contact, graph)
	delete subject.a

	t.throws(() => Contact.fromOldm(subject), /OLDM shape conversion failed/)
	t.same(Contact.fromOldm(subject, { requireType: false }), contact)
	t.end()
})

tap.test('fromOldm rejects multiple RDF values for scalar JavaScript fields', t => {
	const graph = graphFor()
	const subject = Contact.toOldm(contact, graph)
	subject.vcard$fn = ['Auke', 'Other']

	t.throws(() => Contact.fromOldm(subject), /OLDM shape conversion failed/)
	t.end()
})

tap.test('Required preserves mapping metadata when wrapping field definitions', t => {
	const Person = shape('foaf$Person', {
		id: Required(id(uri())),
		name: Required(field('foaf$name', String))
	})
	const graph = graphFor()
	const subject = Person.toOldm({
		id: 'https://example.org/profile/card#me',
		name: 'Auke'
	}, graph)

	t.equal(subject.id, 'https://example.org/profile/card#me')
	t.equal(subject.foaf$name, 'Auke')
	t.end()
})
