import tap from 'tap'
import oldm from '@muze-nl/oldm-core'
import {turtleParser as parser, turtleWriter as writer} from '@muze-labs/oldm-turtle'
import {n3Parser} from '@muze-nl/oldm-n3'

const base = 'https://example.org/data/card'
const context = () => oldm({parser, writer})

tap.test('writer prefers prefixes and falls back to portable relative references', async t => {
	const input = `@prefix foo: <${base}#> .
	foo:me <https://schema.org/knows> <${base}/child>, <https://elsewhere.org/other> .`
	const source = context().parse(input, base, 'text/turtle')
	const output = await source.write()
	t.match(output, `@base <${base}>`)
	t.match(output, 'foo:me')
	t.match(output, '<card/child>')
	t.match(output, '<https://elsewhere.org/other>')
	const ids = text => n3Parser(text, 'https://moved.example/document', 'text/turtle').quads
		.map(q => [q.subject.id, q.predicate.id, q.object.id]).sort()
	t.same(ids(output), ids(input), 'moving the output preserves all IRIs')
	t.end()
})

tap.test('writer and parser preserve escaped prefixed local names', async t => {
	const input = String.raw`@prefix foo: <https://example.org/data/card> .
	foo:\/child <https://schema.org/name> "Child" .`
	const source = context().parse(input, base, 'text/turtle')
	t.ok(source.get(base+'/child'))
	const output = await source.write()
	t.match(output, String.raw`foo:\/child`)
	const roundtrip = n3Parser(output, base, 'text/turtle')
	t.equal(roundtrip.quads[0].subject.id, base+'/child')
	t.end()
})


tap.test('IRIs survive serialization across prefixes, queries, fragments and Unicode', async t => {
	const ids = [base, base+'#', base+'?', base+'?query=1#fragment',
		'https://example.org/data/price$tag', 'https://example.org/data/a:b',
		'https://example.org/data//child', 'https://example.org/data/é/%2f',
		'https://EXAMPLE.org:443/é/%2f', 'urn:example:a:b']
	for (const id of ids) {
		const source = context().parse(`<${id}> <https://schema.org/name> "Test" .`, base, 'text/turtle')
		t.ok(source.get(id), `parsed ${id}`)
		const output = await source.write()
		t.equal(n3Parser(output, 'https://moved.example/', 'text/turtle').quads[0].subject.id, id, id)
		t.ok(context().parse(output, 'https://moved.example/', 'text/turtle').get(id), 'own parser round trip')
	}
	for (const suffix of ['', '/child', 'a:b:c', 'a$b', 'a.b', 'trailing.', '#hash', '?query', '%2F', '(a,b);x=1']) {
		const id = base+suffix
		const source = context().parse(`@prefix foo: <${base}> . <${id}> <https://schema.org/name> "Test" .`, base, 'text/turtle')
		const output = await source.write()
		t.match(output, /^foo:/m, suffix)
		t.equal(n3Parser(output, 'https://moved.example/', 'text/turtle').quads[0].subject.id, id, suffix)
		t.ok(context().parse(output, 'https://moved.example/', 'text/turtle').get(id), 'own parser round trip')
	}
	t.end()
})
