import tap from 'tap'
import oldm, {Graph} from '../src/oldm.mjs'
import {n3Parser, n3Writer} from '../src/oldm-n3.mjs'

tap.test('rdf uris', t => {
	const context = oldm()
	const graph = new Graph([], 'https://example.org/','text/turtle',context.prefixes,context)
	const rdfType = graph.fullURI('rdf:type',':')
	const rdfFirst = graph.fullURI('rdf:first',':')
	t.equal(rdfType, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
	t.equal(rdfFirst, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first')
	t.end()
})

tap.test('get graph', t => {
	let turtle = `
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

:me 
	a schema:Person;
	vcard:fn "Auke van Slooten" .`
	const context = oldm({
		prefixes: {
			'schema':'https://schema.org/',
			'vcard':'http://www.w3.org/2006/vcard/ns#'
		},
		parser: n3Parser
	})
	let source = context.parse(turtle, 'https://auke.solidcommunity.net/profile/card#me', 'text/turtle')
	t.same(''+source.data[0].vcard$fn, 'Auke van Slooten')
	t.same(''+source.primary.vcard$fn, 'Auke van Slooten')
	t.end()
})

// tap.test('two graphs merging', t => {
// 	let turtle = `
// @prefix : <#>.
// @prefix schema: <http://schema.org/>.
// @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

// :me 
// 	a schema:Person;
// 	vcard:fn "Auke van Slooten" .`
// 	let turtle2 = `
// @prefix : <#>.
// @prefix schema: <http://schema.org/>.
// @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
// @prefix foaf: <http://xmlns.com/foaf/0.1/>.

// <https://auke.solidcommunity.net/profile/card#me>
// 	a foaf:Person;
// 	vcard:organization-name "Muze".
// `
// 	let oldmParser = parser({
// 		prefixes: {
// 			'schema':'https://schema.org/',
// 			'vcard':'http://www.w3.org/2006/vcard/ns#'
// 		},
// 		parser: new N3Parser()
// 	})
// 	let data = oldmParser.parse(turtle, 'https://auke.solidcommunity.net/profile/card#me')
// 	let added = oldmParser.parse(turtle2, 'https://example.com/')
// 	t.same(''+data.vcard$fn, 'Auke van Slooten')
// 	t.same(''+data['vcard$organization-name'], 'Muze')
// 	t.end()
// })

tap.test('separator', t => {
	let turtle = `
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

:me 
	a schema:Person;
	vcard:fn "Auke van Slooten" .`
	const context = oldm({
		prefixes: {
			'schema':'https://schema.org/',
			'vcard':'http://www.w3.org/2006/vcard/ns#'
		},
		separator: ':',
		parser: n3Parser
	})
	let source = context.parse(turtle, 'https://auke.solidcommunity.net/profile/card#me', 'text/turtle')
	t.same(''+source.primary['vcard:fn'], 'Auke van Slooten')
	t.end()	
})

tap.test('xsdtypes', t => {
	let turtle = `
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

:me 
	a schema:Person;
	vcard:bday "1972-09-20"^^xsd:date;
 	vcard:fn "Auke van Slooten" .`
	const context = oldm({
		prefixes: {
			'schema':'https://schema.org/',
			'vcard':'http://www.w3.org/2006/vcard/ns#'
		},
		parser: n3Parser
	})
	let source = context.parse(turtle, 'https://auke.solidcommunity.net/profile/card#me', 'text/turtle')

	t.same(''+source.primary.vcard$bday, '1972-09-20')
	t.same(source.primary.vcard$bday.type, 'xsd$date')
	t.end()	
})

/**
 * TODO
 * - test object values
 * - test context.subjects as merged subjects
 **/

tap.test('write changes', async t => {
	let turtle = `
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

:me 
	a schema:Person;
	vcard:bday "1972-09-20"^^xsd:date;
 	vcard:fn "Auke van Slooten" .`

	let expectTurtle = `@prefix : <https://auke.solidcommunity.net/profile/card#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

:me a schema:Person;
    vcard:bday "1972-09-20"^^xsd:date;
    vcard:fn "Auke Cornelis van Slooten".
`
	
	const context = oldm({
		prefixes: {
			'schema':'http://schema.org/',
			'vcard':'http://www.w3.org/2006/vcard/ns#'
		},
		parser: n3Parser,
		writer: n3Writer
	})

	let source = context.parse(turtle, 'https://auke.solidcommunity.net/profile/card#me', 'text/turtle')

    source.primary.vcard$fn = 'Auke Cornelis van Slooten'

	let output = await source.write()

	t.same(output, expectTurtle)
	t.end()	
})

tap.test('collections', async t => {
	let turtle = `
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

:me 
	a schema:Person;
	vcard:bday "1972-09-20"^^xsd:date;
 	vcard:fn ( "Auke van Slooten" "Auke Cornelis van Slooten" ).`

	let expectTurtle = `@prefix : <https://auke.solidcommunity.net/profile/card#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

:me a schema:Person;
    vcard:bday "1972-09-20"^^xsd:date;
    vcard:fn ("Auke Cornelis van Slooten").
`
	
	const context = oldm({
		prefixes: {
			'schema':'http://schema.org/',
			'vcard':'http://www.w3.org/2006/vcard/ns#'
		},
		parser: n3Parser,
		writer: n3Writer
	})

	let source = context.parse(turtle, 'https://auke.solidcommunity.net/profile/card#me', 'text/turtle')

	let temp = source.primary.vcard$fn.shift()

	let output = await source.write()

	t.same(output, expectTurtle)

	t.end()
})
