import tap from 'tap'
import oldm, {Graph} from '@muze-nl/oldm-core'

const base = 'https://example.org/data/card'
function owners() {
	const context = oldm({prefixes: {foo: base, bad: 'relative/'}})
	return [context, new Graph([], base, 'text/turtle', {}, context)]
}

tap.test('prefix expansion is exact and shortening never returns a relative reference', t => {
	for (const owner of owners()) {
		for (const [short, full] of [['foo$', base], ['foo$/child', base+'/child'], ['foo$a$b', base+'a$b']]) {
			t.equal(owner.fullURI(short), full)
			t.equal(owner.shortURI(full), short)
		}
		t.equal(owner.fullURI('foo:a:b', ':'), base+'a:b')
		t.equal(owner.fullURI('foo:/../child', ':'), base+'/../child')
		t.equal(owner.shortURI('http://schema.org/Person'), 'http://schema.org/Person', 'aliases do not change IRI identity')
		t.equal(owner.fullURI('https://EXAMPLE.org:443/é/%2f'), 'https://EXAMPLE.org:443/é/%2f')
		t.equal(owner.fullURI('urn:example:a:b'), 'urn:example:a:b')
		for (const value of [null, 17, 'https://', 'https://exa mple.org/', 'https://example.org/%zz', 'missing$Thing', 'toString$Thing', 'bad$Thing']) {
			t.throws(() => owner.fullURI(value), TypeError, String(value))
		}
	}
	const graph = owners()[1]
	t.equal(graph.shortURI('https://example.org/data/other'), 'https://example.org/data/other')
	t.end()
})

tap.test('fullURI resolves references using RFC 3986 without rewriting absolute IRIs', t => {
	const [context, graph] = owners()
	t.throws(() => context.fullURI('#me'), TypeError)
	t.equal(oldm({baseURI: base}).fullURI('#me'), base+'#me')
	for (const [ref, full] of [
		['', base], ['#me', base+'#me'], ['card/child', base+'/child'],
		['/child', 'https://example.org/child'], ['../other', 'https://example.org/other'],
		['?q=1', base+'?q=1'], ['//other.example/a', 'https://other.example/a'],
		['./é/%2e/child', 'https://example.org/data/é/%2e/child']
	]) t.equal(graph.fullURI(ref), full, ref)
	t.end()
})

tap.test('relativeURI produces exact round trips including query, fragment and path edge cases', t => {
	const [, graph] = owners()
	const expected = new Map([
		[base, ''], [base+'#me', '#me'], [base+'/child', 'card/child'],
		['https://example.org/data/other', 'other'], [base+'?q=1', '?q=1']
	])
	for (const [iri, relative] of expected) t.equal(graph.relativeURI(iri), relative)
	for (const iri of [
		...expected.keys(), 'https://elsewhere.org/child', 'urn:example:thing',
		'https://example.org/data/a:b', 'https://example.org/data/foo$Thing', 'https://example.org/data//child',
		'https://example.org/', 'https://example.org/data/', base+'?', base+'#',
		'https://example.org/data/é/%2f', 'https://EXAMPLE.org/data/card',
		'https://example.org/data/../child', 'https://example.org/data/%2e/child'
	]) t.equal(graph.fullURI(graph.relativeURI(iri)), iri, iri)
	const queryBase = base+'?old=1#fragment'
	const queryContext = oldm({baseURI: queryBase})
	t.equal(queryContext.fullURI(queryContext.relativeURI(base)), base, 'clear an inherited query')
	t.equal(oldm().relativeURI(base), base, 'without a base keep the absolute IRI')
	t.end()
})

// Expected resolutions from RFC 3986 section 5.4; include abnormal dot segments.
tap.test('relative resolution agrees with RFC 3986 examples', t => {
	const context = oldm({baseURI: 'http://a/b/c/d;p?q'})
	const cases = [
		['g:h', 'g:h'], ['g', 'http://a/b/c/g'], ['./g', 'http://a/b/c/g'],
		['g/', 'http://a/b/c/g/'], ['/g', 'http://a/g'], ['//g', 'http://g'],
		['?y', 'http://a/b/c/d;p?y'], ['g?y', 'http://a/b/c/g?y'],
		['#s', 'http://a/b/c/d;p?q#s'], ['g#s', 'http://a/b/c/g#s'],
		['g?y#s', 'http://a/b/c/g?y#s'], [';x', 'http://a/b/c/;x'],
		['g;x', 'http://a/b/c/g;x'], ['g;x?y#s', 'http://a/b/c/g;x?y#s'],
		['', 'http://a/b/c/d;p?q'], ['.', 'http://a/b/c/'], ['./', 'http://a/b/c/'],
		['..', 'http://a/b/'], ['../', 'http://a/b/'], ['../g', 'http://a/b/g'],
		['../..', 'http://a/'], ['../../', 'http://a/'], ['../../g', 'http://a/g'],
		['../../../g', 'http://a/g'], ['../../../../g', 'http://a/g'],
		['/./g', 'http://a/g'], ['/../g', 'http://a/g'],
		['g.', 'http://a/b/c/g.'], ['.g', 'http://a/b/c/.g'],
		['g..', 'http://a/b/c/g..'], ['..g', 'http://a/b/c/..g'],
		['./../g', 'http://a/b/g'], ['./g/.', 'http://a/b/c/g/'],
		['g/./h', 'http://a/b/c/g/h'], ['g/../h', 'http://a/b/c/h'],
		['g;x=1/./y', 'http://a/b/c/g;x=1/y'], ['g;x=1/../y', 'http://a/b/c/y'],
		['g?y/./x', 'http://a/b/c/g?y/./x'], ['g?y/../x', 'http://a/b/c/g?y/../x'],
		['g#s/./x', 'http://a/b/c/g#s/./x'], ['g#s/../x', 'http://a/b/c/g#s/../x']
	]
	for (const [relative, full] of cases) t.equal(context.fullURI(relative), full, relative)
	t.end()
})

tap.test('fullURI rejects malformed IRIs without silently repairing them', t => {
	const context = oldm()
	for (const iri of [
		'http://host/path\n', 'http://host/?q\r', 'http://host/#f\t',
		'http://host/\u007F', 'http://host/\uD800', 'http://host/\uFFFF',
		'http://host/has space', 'http://host/<x>', 'http://host/"x"',
		'http://host/a\\b', 'http://host/%', 'http://host/%2', 'http://host/#a#b',
		'http://[bad]/', 'http://host:port/', 'http://user@@host/', 'http:///path'
	]) t.throws(() => context.fullURI(iri), TypeError, JSON.stringify(iri))
	for (const iri of ['http://[::1]/', 'urn:example:a:b', 'mailto:user@example.org',
		'https://例え.テスト/é/😀', 'https://host/?q=\uE000', 'http://host:80/a/../b']) {
		t.equal(context.fullURI(iri), iri)
	}
	t.end()
})

tap.test('empty prefix suffixes remain references in graph writes', t => {
	const [, graph] = owners()
	const subject = graph.set('#me', 'https://schema.org/url', 'foo$')
	t.equal(subject.schema$url.id, base)
	t.equal(subject.id, base+'#me')
	t.end()
})
