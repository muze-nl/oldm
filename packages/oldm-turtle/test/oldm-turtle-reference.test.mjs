import tap from 'tap'
import oldm, {Collection} from '@muze-nl/oldm-core'
import {turtleReferenceParser, turtleWriter} from '@muze-labs/oldm-turtle/reference'

const url = 'https://example.org/profile/card#me'

function createContext(options = {}) {
	return oldm({
		parser: turtleReferenceParser,
		writer: turtleWriter,
		...options
	})
}

function parse(turtle, options = {}) {
	return createContext(options).parse(turtle, url, 'text/turtle')
}

tap.test('reference parser builds the same public shape for common small Solid Turtle', t => {
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

tap.test('reference parser handles comments, relative IRIs, blank node labels, booleans and numbers', t => {
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

tap.test('reference parser works as an OLDM parser/writer adapter', async t => {
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

tap.test('reference parser throws syntax errors and unknown-prefix errors', t => {
	t.throws(() => parse('@prefix : <#> . :me <broken '), SyntaxError)
	t.throws(() => parse('@prefix : <#> . :me unknown:value "x" .'), /Unknown prefix/)

	t.end()
})
