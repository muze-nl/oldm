import tap from 'tap'
import oldm, {Collection, one} from '@muze-nl/oldm-core'
import {turtleParser, turtlePatchWriter, turtleWriter} from '@muze-labs/oldm-turtle'

const url = 'https://example.org/profile/card#me'

function createContext(options = {}) {
	return oldm({
		parser: turtleParser,
		writer: turtleWriter,
		patchWriter: turtlePatchWriter,
		...options
	})
}

function parse(turtle, options = {}) {
	return createContext(options).parse(turtle, url, 'text/turtle')
}

tap.test('parses common Turtle 1.1 syntax used by small Solid documents', t => {
	const source = parse(`
		@base <https://example.org/profile/card> .
		@prefix : <#> .
		@prefix schema: <http://schema.org/> .
		@prefix foaf: <http://xmlns.com/foaf/0.1/> .
		@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
		@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

		:me
			a schema:Person, foaf:Person ;
			vcard:fn "Auke", "Auke C." ;
			schema:name "Auke"@nl ;
			vcard:bday "1972-09-20"^^xsd:date ;
			vcard:hasEmail [ vcard:value <mailto:auke@example.org> ] ;
			schema:knowsAbout ("web" "solid") ;
			foaf:knows :him .

		:him vcard:fn "Ben" .
	`)

	t.equal(source.primary.id, url)
	t.same([...source.primary.a].sort(), ['foaf$Person', 'schema$Person'])
	t.same(source.primary.vcard$fn.map(value => String(value)), ['Auke', 'Auke C.'])
	t.equal(String(source.primary.schema$name), 'Auke')
	t.equal(source.primary.schema$name.language, 'nl')
	t.equal(String(source.primary.vcard$bday), '1972-09-20')
	t.equal(source.primary.vcard$bday.type, 'xsd$date')
	t.equal(source.primary.vcard$hasEmail.vcard$value.id, 'mailto:auke@example.org')
	t.equal(source.primary.foaf$knows.vcard$fn.toString(), 'Ben')
	t.ok(source.primary.schema$knowsAbout instanceof Collection)
	t.same(source.primary.schema$knowsAbout.map(value => String(value)), ['web', 'solid'])

	t.end()
})

tap.test('parses comments, relative IRIs, blank node labels, booleans and numbers', t => {
	const source = parse(`
		PREFIX : <#>
		PREFIX schema: <http://schema.org/>
		PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

		# comments are ignored
		:me schema:url <./> ;
			schema:active true ;
			schema:answer 42 ;
			schema:score 12.5 ;
			schema:node _:shared .

		_:shared schema:name "Shared" .
	`)

	t.equal(source.primary.schema$url.id, 'https://example.org/profile/')
	t.equal(String(source.primary.schema$active), 'true')
	t.equal(source.primary.schema$active.type, 'xsd$boolean')
	t.equal(String(source.primary.schema$answer), '42')
	t.equal(source.primary.schema$answer.type, 'xsd$integer')
	t.equal(String(source.primary.schema$score), '12.5')
	t.equal(source.primary.schema$score.type, 'xsd$decimal')
	t.equal(String(source.primary.schema$node.schema$name), 'Shared')

	t.end()
})

tap.test('writes Turtle that OLDM can parse back with the same public shape', async t => {
	const context = createContext()
	const source = context.parse(`
		@prefix : <#> .
		@prefix schema: <http://schema.org/> .
		@prefix foaf: <http://xmlns.com/foaf/0.1/> .
		@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
		@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

		:me
			a schema:Person ;
			vcard:fn "Auke"@nl ;
			vcard:bday "1972-09-20"^^xsd:date ;
			foaf:knows :him ;
			schema:knowsAbout ("web" "solid") .

		:him vcard:fn "Ben" .
	`, url, 'text/turtle')

	source.add(url, 'vcard$nickname', ['Poef', 'Auke'])
	const output = await source.write()
	const roundtrip = context.parse(output, url, 'text/turtle')

	t.equal(String(roundtrip.primary.vcard$fn), 'Auke')
	t.equal(roundtrip.primary.vcard$fn.language, 'nl')
	t.equal(String(roundtrip.primary.vcard$bday), '1972-09-20')
	t.equal(roundtrip.primary.vcard$bday.type, 'xsd$date')
	t.equal(roundtrip.primary.foaf$knows.id, 'https://example.org/profile/card#him')
	t.equal(String(roundtrip.primary.foaf$knows.vcard$fn), 'Ben')
	t.same(roundtrip.primary.schema$knowsAbout.map(value => String(value)), ['web', 'solid'])
	t.same(roundtrip.primary.vcard$nickname.map(value => String(value)), ['Poef', 'Auke'])

	t.end()
})


tap.test('turtleWriter prefers source prefixes and falls back to non-conflicting client prefixes', async t => {
	const source = parse(`
		@prefix : <#> .
		@prefix doc: <https://document.example/ns#> .

		:me doc:name "Auke" .
	`, {
		prefixes: {
			client: 'https://document.example/ns#',
			other: 'https://client.example/ns#'
		}
	})

	source.context.set(url, 'other$note', 'Client-only value')
	const output = await source.write()

	t.match(output, /@prefix doc: <https:\/\/document\.example\/ns#> \./)
	t.match(output, /doc:name "Auke"/)
	t.notMatch(output, /client:name "Auke"/)
	t.match(output, /other:note "Client-only value"/)
	t.notMatch(output, /client:note/)

	t.end()
})

tap.test('works as an OLDM parser/writer adapter in multiple graphs', async t => {
	const context = createContext()
	const profile = context.parse(`
		@prefix : <#> .
		@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
		:me vcard:fn "Auke" .
	`, url, 'text/turtle')
	const prefs = context.parse(`
		@prefix solid: <http://www.w3.org/ns/solid/terms#> .
		<https://example.org/profile/card#me> solid:oidcIssuer <https://issuer.example/> .
	`, 'https://example.org/settings/prefs', 'text/turtle')

	const me = context.get(url)
	t.equal(String(me.vcard$fn), 'Auke')
	t.equal(me.solid$oidcIssuer.id, 'https://issuer.example/')
	t.same(context.sources(me, 'vcard$fn'), [profile])
	t.same(context.sources(me, 'solid$oidcIssuer'), [prefs])

	profile.set(url, 'vcard$note', 'Written by turtle')
	const output = await profile.write()
	t.match(output, /Written by turtle/)

	t.end()
})


tap.test('turtlePatchWriter replaces an owned blank-node value as a Solid N3 Patch', async t => {
	const source = parse(`
		@prefix : <#> .
		@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .

		:me vcard:hasEmail [ vcard:value <mailto:auke@example.org> ] .
	`)

	source.set(source.primary.vcard$hasEmail, 'vcard$value', 'mailto:other@example.org')

	const patch = await source.patch()

	t.match(patch, /solid:where \{/)
	t.match(patch, /:me vcard:hasEmail \?old0 \./)
	t.match(patch, /\?old0 vcard:value <mailto:auke@example\.org> \./)
	t.match(patch, /solid:deletes \{/)
	t.match(patch, /solid:inserts \{/)
	t.match(patch, /:me vcard:hasEmail _:insert0 \./)
	t.match(patch, /_:insert0 vcard:value <mailto:other@example\.org> \./)

	t.end()
})

tap.test('turtlePatchWriter replaces an RDF collection as a whole anonymous value', async t => {
	const source = parse(`
		@prefix : <#> .
		@prefix schema: <http://schema.org/> .

		:me schema:knowsAbout ("web" "solid") .
	`)
	const replacement = new Collection(source)
	replacement.push('web', 'oldm')
	source.set(url, 'schema$knowsAbout', replacement)

	const patch = await source.patch()

	t.match(patch, /solid:where \{/)
	t.match(patch, /:me schema:knowsAbout \?old0 \./)
	t.match(patch, /\?old0 rdf:first "web" \./)
	t.match(patch, /\?old0 rdf:rest \?old1 \./)
	t.match(patch, /\?old1 rdf:first "solid" \./)
	t.match(patch, /solid:deletes \{/)
	t.match(patch, /solid:inserts \{/)
	t.match(patch, /_:insert0 rdf:first "web" \./)
	t.match(patch, /_:insert1 rdf:first "oldm" \./)

	t.end()
})

tap.test('turtlePatchWriter rejects changed shared blank-node values', async t => {
	const source = parse(`
		@prefix : <#> .
		@prefix schema: <http://schema.org/> .

		:me schema:address _:shared .
		:org schema:address _:shared .
		_:shared schema:name "Amsterdam" .
	`)

	source.delete(url, 'schema$address')

	await t.rejects(source.patch(), /shared anonymous value/)

	t.end()
})

tap.test('throws useful syntax errors', t => {
	t.throws(() => parse('@prefix : <#> . :me <broken '), SyntaxError)
	t.throws(() => parse('@prefix : <#> . :me unknown:value "x" .'), /Unknown prefix/)

	t.end()
})
