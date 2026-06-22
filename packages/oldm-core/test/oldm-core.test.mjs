import tap from 'tap'
import oldm, {
	BlankNode,
	Collection,
	Context,
	Graph,
	NamedNode,
	first,
	many,
	one,
	rdfType
} from '@muze-nl/oldm-core'

const url = 'https://example.org/profile/card#me'

const namedNode = id => ({termType: 'NamedNode', id})
const blankNode = id => ({termType: 'BlankNode', id})
const literal = (value, datatype = 'http://www.w3.org/2001/XMLSchema#string', language = '') => ({
	termType: 'Literal',
	value,
	datatype: namedNode(datatype),
	language
})
const quad = (subject, predicate, object) => ({subject, predicate, object})

const schema = 'http://schema.org/'
const vcard = 'http://www.w3.org/2006/vcard/ns#'
const foaf = 'http://xmlns.com/foaf/0.1/'
const xsd = 'http://www.w3.org/2001/XMLSchema#'
const solid = 'http://www.w3.org/ns/solid/terms#'
const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

function parserFor(quads, extraPrefixes = {}) {
	return () => ({
		quads,
		prefixes: {
			schema,
			vcard,
			foaf,
			xsd,
			rdf,
			...extraPrefixes
		}
	})
}

function contextFor(quads, prefixes = {}) {
	return oldm({
		parser: parserFor(quads, prefixes),
		writer: source => Promise.resolve(JSON.stringify(source.data.map(subject => subject.id))),
		prefixes: {
			schema,
			vcard,
			foaf
		}
	})
}

tap.test('default and named exports expose the core public API', t => {
	const context = oldm()

	t.ok(context instanceof Context)
	t.equal(typeof oldm, 'function')
	t.equal(typeof Graph, 'function')
	t.equal(typeof NamedNode, 'function')
	t.equal(typeof BlankNode, 'function')
	t.equal(typeof Collection, 'function')
	t.equal(rdfType, `${rdf}type`)

	t.end()
})

tap.test('one returns values according to the documented selector contract', t => {
	t.equal(one(['a', 'b', 'c']), 'c')
	t.equal(one(['a', 'b', 'c'], 'first'), 'a')
	t.equal(one(['a', 'b', 'c'], values => values[1]), 'b')
	t.equal(one('a'), 'a')
	t.equal(one(null), null)
	t.equal(one(undefined), undefined)
	t.throws(() => one(['a'], 'middle'), /Unknown value for whichOne parameter/)

	t.end()
})

tap.test('many always returns an array without changing existing arrays', t => {
	const values = ['a', 'b']

	t.equal(many(values), values)
	t.same(many('a'), ['a'])
	t.same(many(0), [0])
	t.same(many(false), [false])
	t.same(many(null), [])
	t.same(many(undefined), [])

	t.end()
})

tap.test('first returns the first non-nullish value and preserves falsey values', t => {
	t.equal(first(null, undefined, 'fallback'), 'fallback')
	t.equal(first(null, undefined), null)
	t.equal(first(null, 0, 'fallback'), 0)
	t.equal(first(null, false, 'fallback'), false)
	t.equal(first(null, '', 'fallback'), '')

	t.end()
})

tap.test('parse exposes graph, primary, subjects, data, id and URI helpers', t => {
	const me = namedNode(url)
	const other = namedNode('https://example.org/profile/card#other')
	const quads = [
		quad(me, namedNode(rdfType), namedNode(`${schema}Person`)),
		quad(me, namedNode(`${vcard}fn`), literal('Auke')),
		quad(other, namedNode(`${vcard}fn`), literal('Other'))
	]
	const source = contextFor(quads).parse('', url, 'text/turtle')

	t.equal(source.url, url)
	t.equal(source.mimetype, 'text/turtle')
	t.equal(source.primary.id, url)
	t.equal(String(source.primary.vcard$fn), 'Auke')
	t.equal(source.primary.a, 'schema$Person')
	t.equal(source.subjects[url], source.primary)
	t.same(source.data.map(subject => subject.id).sort(), [other.id, url].sort())
	t.equal(source.get(url), source.primary)
	t.equal(source.fullURI('schema$Person'), `${schema}Person`)
	t.equal(source.shortURI(`${schema}Person`), 'schema$Person')
	t.equal(source.shortURI(`${url}/child`), '/child')
	t.equal(source.shortURI('https://unknown.example/Thing'), 'https://unknown.example/Thing')
	t.equal(source.primary.graph, source)
	t.notOk(Object.keys(source.primary).includes('graph'))
	t.throws(() => {
		source.primary.id = 'changed'
	}, TypeError)
	t.equal(source.primary.id, url)

	t.end()
})

tap.test('parse returns null primary when requested subject is absent', t => {
	const quads = [
		quad(namedNode('https://example.org/profile/card#other'), namedNode(`${vcard}fn`), literal('Other'))
	]
	const source = contextFor(quads).parse('', url, 'text/turtle')

	t.equal(source.primary, null)
	t.equal(source.data.length, 1)

	t.end()
})

tap.test('parse resolves object references, blank nodes, collections, language and typed literals', t => {
	const me = namedNode(url)
	const him = namedNode('https://example.org/profile/card#him')
	const email = blankNode('email')
	const listA = blankNode('list-a')
	const listB = blankNode('list-b')
	const quads = [
		quad(listA, namedNode(`${rdf}first`), literal('web')),
		quad(listA, namedNode(`${rdf}rest`), listB),
		quad(listB, namedNode(`${rdf}first`), literal('solid')),
		quad(listB, namedNode(`${rdf}rest`), namedNode(`${rdf}nil`)),

		quad(email, namedNode(`${vcard}value`), namedNode('mailto:auke@example.org')),

		quad(me, namedNode(rdfType), namedNode(`${schema}Person`)),
		quad(me, namedNode(rdfType), namedNode(`${foaf}Person`)),
		quad(me, namedNode(`${vcard}fn`), literal('Auke')),
		quad(me, namedNode(`${vcard}fn`), literal('Auke C.')),
		quad(me, namedNode(`${vcard}fn`), literal('Auke C. van Slooten')),
		quad(me, namedNode(`${schema}name`), literal('Auke', `${xsd}string`, 'nl')),
		quad(me, namedNode(`${vcard}bday`), literal('1972-09-20', `${xsd}date`)),
		quad(me, namedNode(`${foaf}knows`), him),
		quad(me, namedNode(`${vcard}hasEmail`), email),
		quad(me, namedNode(`${schema}knowsAbout`), listA),
		quad(him, namedNode(`${vcard}fn`), literal('Ben')),
		quad(him, namedNode(`${foaf}knows`), me)
	]
	const source = contextFor(quads).parse('', url, 'text/turtle')

	t.same([...source.primary.a].sort(), ['foaf$Person', 'schema$Person'])
	t.same(source.primary.vcard$fn.map(value => String(value)), ['Auke', 'Auke C.', 'Auke C. van Slooten'])
	t.equal(String(source.primary.schema$name), 'Auke')
	t.equal(source.primary.schema$name.language, 'nl')
	t.equal(String(source.primary.vcard$bday), '1972-09-20')
	t.equal(source.primary.vcard$bday.type, 'xsd$date')
	t.equal(source.primary.foaf$knows.id, him.id)
	t.equal(source.primary.foaf$knows.foaf$knows, source.primary)
	t.equal(source.primary.vcard$hasEmail.vcard$value.id, 'mailto:auke@example.org')
	t.ok(source.primary.schema$knowsAbout instanceof Collection)
	t.equal(source.primary.schema$knowsAbout.graph, source)
	t.same(source.primary.schema$knowsAbout.map(value => String(value)), ['web', 'solid'])

	t.end()
})

tap.test('custom separator changes shortened predicate and type names', t => {
	const me = namedNode(url)
	const quads = [
		quad(me, namedNode(rdfType), namedNode(`${schema}Person`)),
		quad(me, namedNode(`${vcard}fn`), literal('Auke'))
	]
	const context = oldm({
		separator: ':',
		parser: parserFor(quads),
		prefixes: {schema, vcard}
	})
	const source = context.parse('', url, 'text/turtle')

	t.equal(source.primary.a, 'schema:Person')
	t.equal(String(source.primary['vcard:fn']), 'Auke')
	t.equal(source.fullURI('schema:Person'), `${schema}Person`)
	t.equal(source.shortURI(`${schema}Person`), 'schema:Person')
	t.equal(context.fullURI('vcard:fn'), `${vcard}fn`)
	t.equal(context.fullURI('unknown:Thing'), 'unknown:Thing')
	t.equal(context.shortURI(`${vcard}fn`), 'vcard:fn')
	t.equal(context.shortURI('https://unknown.example/Thing'), 'https://unknown.example/Thing')

	t.end()
})

tap.test('literal metadata helpers set and read datatypes and languages', t => {
	const source = contextFor([]).parse('', url, 'text/turtle')
	const date = source.setType('1972-09-20', `${xsd}date`)
	const count = source.setType(12, `${xsd}integer`)
	const name = source.setLanguage('Auke', 'nl')
	const numericName = source.setLanguage(42, 'en')
	const plain = source.context.setType('plain')

	t.equal(plain, 'plain')
	t.equal(String(date), '1972-09-20')
	t.equal(source.getType(date), 'xsd$date')
	t.equal(Number(count), 12)
	t.equal(source.getType(count), 'xsd$integer')
	t.equal(String(name), 'Auke')
	t.equal(name.language, 'nl')
	t.equal(Number(numericName), 42)
	t.equal(numericName.language, 'en')
	t.equal(source.getType('plain'), null)
	t.throws(() => source.setType(true, `${xsd}boolean`), /cannot set type/)
	t.throws(() => source.setLanguage(true, 'nl'), /cannot set language/)

	t.end()
})


tap.test('subjects can add predicates from RDF-like predicate objects', t => {
	const source = contextFor([]).parse('', url, 'text/turtle')
	const subject = source.addNamedNode(url)

	subject.addPredicate(namedNode(`${vcard}fn`), literal('Auke'))
	subject.addPredicate(namedNode(`${vcard}fn`), literal('Auke C.'))
	subject.addPredicate(namedNode(`${vcard}fn`), literal('Auke C. van Slooten'))

	t.same(subject.vcard$fn.map(value => String(value)), ['Auke', 'Auke C.', 'Auke C. van Slooten'])

	t.end()
})

tap.test('write delegates to the configured public writer', async t => {
	const me = namedNode(url)
	const source = contextFor([
		quad(me, namedNode(`${vcard}fn`), literal('Auke'))
	]).parse('', url, 'text/turtle')

	const output = await source.write()
	t.equal(output, JSON.stringify([url]))

	t.end()
})

tap.test('context registers parsed graphs and exposes a combined read view', t => {
	const profileUrl = 'https://example.org/profile/card#me'
	const settingsUrl = 'https://example.org/settings/private#prefs'
	const me = namedNode(profileUrl)
	const settings = namedNode(settingsUrl)
	const quads = [
		quad(me, namedNode(rdfType), namedNode(`${schema}Person`)),
		quad(me, namedNode(`${vcard}fn`), literal('Auke')),
		quad(settings, namedNode(`${solid}oidcIssuer`), namedNode('https://issuer.example/')),
		quad(settings, namedNode(`${foaf}primaryTopic`), me)
	]
	let call = 0
	const context = oldm({
		parser() {
			call++
			return {
				quads: call == 1 ? quads.slice(0, 2) : quads.slice(2),
				prefixes: {schema, vcard, foaf, solid, rdf, xsd}
			}
		},
		prefixes: {schema, vcard, foaf, solid}
	})

	const profile = context.parse('', profileUrl, 'text/turtle')
	const settingsGraph = context.parse('', settingsUrl, 'text/turtle')

	t.equal(context.graphs.length, 2)
	t.equal(context.graphs[0], profile)
	t.equal(context.graphs[1], settingsGraph)
	t.equal(context.sources[profileUrl], profile)
	t.equal(context.sources[settingsUrl], settingsGraph)

	t.equal(context.get(profileUrl).id, profileUrl)
	t.equal(String(context.get(profileUrl).vcard$fn), 'Auke')
	t.equal(context.get(settingsUrl).foaf$primaryTopic.id, profileUrl)
	const subjects = context.subjects
	t.equal(subjects[settingsUrl].foaf$primaryTopic, subjects[profileUrl])
	t.equal(subjects[profileUrl].graph, context)
	t.same(context.data.map(subject => subject.id).sort(), [profileUrl, settingsUrl, 'https://issuer.example/'].sort())

	// Graph views stay separate and unchanged.
	t.equal(profile.get(profileUrl).graph, profile)
	t.equal(settingsGraph.get(profileUrl).vcard$fn, undefined)

	profile.get(profileUrl).schema$name = 'Auke van Slooten'
	t.equal(String(context.get(profileUrl).schema$name), 'Auke van Slooten')

	t.end()
})

tap.test('context combined read view merges the same named subject from multiple graphs', t => {
	const profileUrl = 'https://example.org/profile/card#me'
	const prefsUrl = 'https://example.org/profile/prefs#me'
	const me = namedNode(profileUrl)
	let call = 0
	const context = oldm({
		parser() {
			call++
			return {
				quads: call == 1
					? [
						quad(me, namedNode(`${vcard}fn`), literal('Auke')),
						quad(me, namedNode(`${schema}knowsAbout`), literal('web'))
					]
					: [
						quad(me, namedNode(`${solid}oidcIssuer`), namedNode('https://issuer.example/')),
						quad(me, namedNode(`${schema}knowsAbout`), literal('solid'))
					],
				prefixes: {schema, vcard, solid, rdf, xsd}
			}
		},
		prefixes: {schema, vcard, solid}
	})

	const profile = context.parse('', profileUrl, 'text/turtle')
	const prefs = context.parse('', prefsUrl, 'text/turtle')
	const combined = context.get(profileUrl)

	t.equal(String(combined.vcard$fn), 'Auke')
	t.equal(combined.solid$oidcIssuer.id, 'https://issuer.example/')
	t.same(combined.schema$knowsAbout.map(value => String(value)), ['web', 'solid'])

	// The per-resource graphs still expose only their own triples.
	t.equal(profile.get(profileUrl).solid$oidcIssuer, undefined)
	t.equal(prefs.get(profileUrl).vcard$fn, undefined)
	t.equal(String(profile.get(profileUrl).schema$knowsAbout), 'web')
	t.equal(String(prefs.get(profileUrl).schema$knowsAbout), 'solid')

	t.end()
})

tap.test('adding a graph with an existing url replaces it in the context registry', t => {
	let quads = [
		quad(namedNode(url), namedNode(`${vcard}fn`), literal('First'))
	]
	const context = oldm({
		parser() {
			return {quads, prefixes: {vcard, rdf, xsd}}
		},
		prefixes: {vcard}
	})

	const firstGraph = context.parse('', url, 'text/turtle')
	quads = [
		quad(namedNode(url), namedNode(`${vcard}fn`), literal('Second'))
	]
	const secondGraph = context.parse('', url, 'text/turtle')

	t.equal(context.graphs.length, 1)
	t.equal(context.graphs[0], secondGraph)
	t.equal(context.sources[url], secondGraph)
	t.not(context.sources[url], firstGraph)
	t.equal(String(context.get(url).vcard$fn), 'Second')
	t.throws(() => context.addGraph({}), /without a url/)

	t.end()
})
