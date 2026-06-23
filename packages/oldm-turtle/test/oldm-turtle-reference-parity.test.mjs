import tap from 'tap'
import {turtleParser} from '@muze-labs/oldm-turtle'
import {turtleReferenceParser} from '@muze-labs/oldm-turtle/reference'

const baseUrl = 'https://example.org/profile/card#me'

const supportedDocuments = [
	{
		name: 'common small Solid profile',
		url: baseUrl,
		turtle: `
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
		`
	},
	{
		name: 'SPARQL directives, comments, relative IRIs, blank labels, booleans, numbers',
		url: baseUrl,
		turtle: `
			PREFIX : <#>
			PREFIX schema: <http://schema.org/>
			PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

			# comments are ignored
			:me schema:url <./> ;
				schema:active true ;
				schema:inactive false ;
				schema:answer 42 ;
				schema:negative -42 ;
				schema:signed +7 ;
				schema:score 12.5 ;
				schema:ratio .5 ;
				schema:exponent 1e2 ;
				schema:node _:shared .

			_:shared schema:name "Shared" .
		`
	},
	{
		name: 'blank-node property lists as subject and object',
		url: 'https://example.org/notes/index.ttl',
		turtle: `
			@prefix : <#> .
			@prefix schema: <http://schema.org/> .
			@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .

			[ schema:name "Anonymous subject" ; schema:knows [ vcard:fn "Nested" ] ]
				schema:about :topic .

			:me schema:empty [] ;
				schema:address [
					vcard:street-address "Example street" ;
					vcard:locality "Enschede" ;
				] .
		`
	},
	{
		name: 'collections, including empty and nested collections',
		url: 'https://example.org/list.ttl#me',
		turtle: `
			@prefix : <#> .
			@prefix schema: <http://schema.org/> .

			:me schema:emptyList () ;
				schema:tags ("web" "solid" "linked data") ;
				schema:nested (("a" "b") [ schema:name "inside" ] :topic) .
		`
	},
	{
		name: 'string literal forms and escapes',
		url: baseUrl,
		turtle: `
			@prefix : <#> .
			@prefix schema: <http://schema.org/> .
			@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

			:me schema:double "line\\nquote\\\"slash\\\\tab\\t" ;
				schema:single 'single\\\'quote' ;
				schema:triple """first
second""" ;
				schema:unicode "A=\\u0041 smile=\\U0001F600" ;
				schema:typed "2026-06-23"^^xsd:date ;
				schema:lang "hallo"@nl-NL ;
				schema:iri <https://example.org/\\u0061> .
		`
	},
	{
		name: 'default prefix and optional directive dots',
		url: 'https://example.org/default.ttl#me',
		turtle: `
			@prefix : <#>
			@prefix schema: <http://schema.org/>
			@base <https://example.org/base/>
			BASE <https://example.org/other/>

			: schema:name "default prefix root" .
			:me schema:url <relative> .
		`
	},
	{
		name: 'predicate object list separators and trailing semicolon',
		url: baseUrl,
		turtle: `
			@prefix : <#> .
			@prefix schema: <http://schema.org/> .
			@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .

			:me
				schema:name "Auke", "Poef" ;
				vcard:fn "Auke van Slooten" ;
			.
		`
	}
]

const rejectedDocuments = [
	{
		name: 'broken iri',
		turtle: '@prefix : <#> . :me <broken '
	},
	{
		name: 'unknown prefix',
		turtle: '@prefix : <#> . :me unknown:value "x" .'
	},
	{
		name: 'unclosed string',
		turtle: '@prefix : <#> . :me :name "Auke .'
	},
	{
		name: 'missing object',
		turtle: '@prefix : <#> . :me :name .'
	}
]

tap.test('Ohm reference parser produces exactly the same prefixes and quads as the handwritten parser', t => {
	for (const document of supportedDocuments) {
		const handwritten = normalizeParseResult(turtleParser(document.turtle, document.url))
		const reference = normalizeParseResult(turtleReferenceParser(document.turtle, document.url))
		t.same(reference, handwritten, document.name)
	}
	t.end()
})

tap.test('Ohm reference parser rejects the same unsupported/invalid documents as the handwritten parser', t => {
	for (const document of rejectedDocuments) {
		const handwritten = captureParseError(turtleParser, document.turtle)
		const reference = captureParseError(turtleReferenceParser, document.turtle)

		t.equal(reference.threw, handwritten.threw, `${document.name}: same success/failure result`)
		t.ok(handwritten.error instanceof SyntaxError, `${document.name}: handwritten throws SyntaxError`)
		t.ok(reference.error instanceof SyntaxError, `${document.name}: reference throws SyntaxError`)
	}
	t.end()
})

function captureParseError(parser, turtle) {
	try {
		parser(turtle, baseUrl)
		return {threw: false, error: null}
	} catch (error) {
		return {threw: true, error}
	}
}

function normalizeParseResult(result) {
	return {
		prefixes: Object.fromEntries(Object.entries(result.prefixes).sort(([a], [b]) => a.localeCompare(b))),
		quads: result.quads.map(normalizeQuad)
	}
}

function normalizeQuad(quad) {
	return {
		subject: normalizeTerm(quad.subject),
		predicate: normalizeTerm(quad.predicate),
		object: normalizeTerm(quad.object)
	}
}

function normalizeTerm(term) {
	if (term.termType == 'Literal') {
		return {
			termType: term.termType,
			value: term.value,
			language: term.language,
			datatype: normalizeTerm(term.datatype)
		}
	}
	return {
		termType: term.termType,
		id: term.id
	}
}
