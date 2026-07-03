import tap from 'tap'
import oldm, {Collection, many, one} from '@muze-nl/oldm-core'
import {n3Parser, n3PatchWriter, n3Writer} from '@muze-nl/oldm-n3'

const url = 'https://example.org/profile/card#me'

function createContext(options = {}) {
	return oldm({
		parser: n3Parser,
		writer: n3Writer,
		patchWriter: n3PatchWriter,
		...options
	})
}

function parse(turtle, options = {}) {
	return createContext(options).parse(turtle, url, 'text/turtle')
}

tap.test('n3Parser parses Turtle into OLDM public object shape', t => {
	const source = parse(`
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

:me
	a schema:Person, foaf:Person;
	vcard:fn "Auke van Slooten";
	foaf:knows :him.

:him
	a schema:Person;
	vcard:fn "Ben Peachey";
	foaf:knows :me.
`)

	t.equal(String(source.primary.vcard$fn), 'Auke van Slooten')
	t.same([...source.primary.a].sort(), ['foaf$Person', 'schema$Person'])
	t.equal(source.primary.foaf$knows.id, 'https://example.org/profile/card#him')
	t.equal(String(source.primary.foaf$knows.vcard$fn), 'Ben Peachey')
	t.equal(source.primary.foaf$knows.foaf$knows, source.primary)

	t.end()
})

tap.test('n3Parser preserves xsd datatypes, language tags and collections', t => {
	const source = parse(`
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

:me
	a schema:Person;
	vcard:bday "1972-09-20"^^xsd:date;
	vcard:fn "Auke"@nl;
	schema:knowsAbout ("web" "solid").
`)

	t.equal(String(source.primary.vcard$bday), '1972-09-20')
	t.equal(source.primary.vcard$bday.type, 'xsd$date')
	t.equal(String(source.primary.vcard$fn), 'Auke')
	t.equal(source.primary.vcard$fn.language, 'nl')
	t.ok(source.primary.schema$knowsAbout instanceof Collection)
	t.same(source.primary.schema$knowsAbout.map(value => String(value)), ['web', 'solid'])

	t.end()
})

tap.test('n3Writer serializes changed data that can be parsed back', async t => {
	const source = parse(`
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

:me
	a schema:Person;
	vcard:bday "1972-09-20"^^xsd:date;
	vcard:fn "Auke van Slooten"@nl;
	foaf:knows :him;
	schema:knowsAbout ("web" "solid").

:him
	a schema:Person;
	vcard:fn "Ben".
`)

	source.primary.vcard$fn = source.setLanguage('Auke Cornelis van Slooten', 'nl')
	source.primary.vcard$nickname = ['Poef', 'Auke']

	const output = await source.write()
	const roundtripped = createContext().parse(output, url, 'text/turtle')

	t.equal(String(roundtripped.primary.vcard$fn), 'Auke Cornelis van Slooten')
	t.equal(roundtripped.primary.vcard$fn.language, 'nl')
	t.equal(String(roundtripped.primary.vcard$bday), '1972-09-20')
	t.equal(roundtripped.primary.vcard$bday.type, 'xsd$date')
	t.equal(roundtripped.primary.foaf$knows.id, 'https://example.org/profile/card#him')
	t.equal(String(roundtripped.primary.foaf$knows.vcard$fn), 'Ben')
	t.same(many(roundtripped.primary.vcard$nickname).map(value => String(value)).sort(), ['Auke', 'Poef'])
	t.same(roundtripped.primary.schema$knowsAbout.map(value => String(value)), ['web', 'solid'])

	t.end()
})


tap.test('n3Writer prefers source prefixes over conflicting client prefixes', async t => {
	const source = parse(`
@prefix : <#>.
@prefix doc: <https://document.example/ns#>.
:me doc:name "Auke".
`, {
		prefixes: {
			client: 'https://document.example/ns#',
			other: 'https://client.example/ns#'
		}
	})

	source.context.set(url, 'other$note', 'Client-only value')
	const output = await source.write()

	t.match(output, /@prefix doc: <https:\/\/document\.example\/ns#>/)
	t.match(output, /doc:name "Auke"/)
	t.notMatch(output, /client:name "Auke"/)
	t.match(output, /other:note "Client-only value"/)
	t.notMatch(output, /client:note/)

	t.end()
})

tap.test('n3Writer serializes blank nodes as object values', async t => {
	const source = parse(`
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

:me
	a schema:Person;
	vcard:hasEmail [
		vcard:value <mailto:auke@example.org>
	].
`)

	const output = await source.write()
	const roundtripped = createContext().parse(output, url, 'text/turtle')
	const email = one(roundtripped.primary.vcard$hasEmail)

	t.equal(email.vcard$value.id, 'mailto:auke@example.org')

	t.end()
})

tap.test('n3PatchWriter serializes simple named-node changes as a Solid N3 Patch', async t => {
	const source = parse(`
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

:me
	a schema:Person;
	vcard:fn "Auke";
	vcard:note "Old".
`)

	source.set(url, 'vcard$fn', 'Auke C.')
	source.delete(url, 'vcard$note')
	source.add(url, 'vcard$nickname', 'Poef')

	const patch = await source.patch()

	t.match(patch, /@prefix solid: <http:\/\/www\.w3\.org\/ns\/solid\/terms#> \./)
	t.match(patch, /_:patch a solid:InsertDeletePatch;/)
	t.match(patch, /solid:deletes \{/)
	t.match(patch, /:me vcard:fn "Auke" \./)
	t.match(patch, /:me vcard:note "Old" \./)
	t.match(patch, /solid:inserts \{/)
	t.match(patch, /:me vcard:fn "Auke C\." \./)
	t.match(patch, /:me vcard:nickname "Poef" \./)
	t.notMatch(patch, /schema:Person \./)

	t.end()
})

tap.test('n3PatchWriter replaces an owned blank-node value as a Solid N3 Patch', async t => {
	const source = parse(`
@prefix : <#>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

:me
	vcard:hasEmail [
		vcard:value <mailto:auke@example.org>
	].
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
	t.notMatch(patch, /Cannot generate/)

	t.end()
})

tap.test('n3PatchWriter replaces an RDF collection as a whole anonymous value', async t => {
	const source = parse(`
@prefix : <#>.
@prefix schema: <http://schema.org/>.

:me
	schema:knowsAbout ("web" "solid").
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

tap.test('n3PatchWriter rejects changed shared blank-node values', async t => {
	const source = parse(`
@prefix : <#>.
@prefix schema: <http://schema.org/>.

:me schema:address _:shared.
:org schema:address _:shared.
_:shared schema:name "Amsterdam".
`)

	source.delete(url, 'schema$address')

	await t.rejects(source.patch(), /shared anonymous value/)

	t.end()
})
