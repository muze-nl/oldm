import tap from 'tap'
import oldm from '@muze-nl/oldm'
import oldmCore, {Collection, one} from '@muze-nl/oldm-core'
import {n3Parser, n3PatchWriter, n3Writer} from '@muze-nl/oldm-n3'

const url = 'https://example.org/profile/card#me'

tap.test('friendly package exports one default object and installs globalThis.oldm', t => {
	t.equal(globalThis.oldm, oldm)
	t.equal(oldm.context instanceof Function, true)
	t.equal(oldm.Collection, Collection)
	t.equal(oldm.one, one)
	t.equal(oldm.n3Parser, n3Parser)
	t.equal(oldm.n3Writer, n3Writer)
	t.equal(oldm.n3PatchWriter, n3PatchWriter)
	t.notOk('default' in oldm)

	t.end()
})

tap.test('friendly context uses N3 parser and writer by default', async t => {
	const context = oldm.context()
	const source = context.parse(`
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

:me
	a schema:Person;
	vcard:fn "Auke".
`, url, 'text/turtle')

	t.equal(String(source.primary.vcard$fn), 'Auke')
	t.equal(source.primary.a, 'schema$Person')

	const output = await source.write()
	const roundtripped = oldm.context().parse(output, url, 'text/turtle')
	t.equal(String(roundtripped.primary.vcard$fn), 'Auke')

	t.end()
})

tap.test('friendly context uses N3 patch writer by default', async t => {
	const context = oldm.context()
	const source = context.parse(`
@prefix : <#>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

:me vcard:fn "Auke".
`, url, 'text/turtle')

	source.set(url, 'vcard$fn', 'Auke C.')

	const patch = await source.patch()
	t.match(patch, /solid:deletes \{/)
	t.match(patch, /:me vcard:fn "Auke" \./)
	t.match(patch, /solid:inserts \{/)
	t.match(patch, /:me vcard:fn "Auke C\." \./)

	t.end()
})

tap.test('friendly context allows explicit parser and writer overrides', async t => {
	const fakeParser = () => ({
		prefixes: {},
		quads: []
	})
	const fakeWriter = () => Promise.resolve('ok')
	const fakePatchWriter = () => Promise.resolve('patch')
	const context = oldm.context({
		parser: fakeParser,
		writer: fakeWriter,
		patchWriter: fakePatchWriter
	})
	const source = context.parse('', url, 'text/turtle')

	t.equal(context.constructor, oldmCore().constructor)
	t.equal(source.primary, null)
	t.equal(await source.write(), 'ok')
	t.equal(await source.patch(), 'patch')

	t.end()
})
