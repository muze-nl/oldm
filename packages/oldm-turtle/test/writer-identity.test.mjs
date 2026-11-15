import tap from 'tap'
import oldm, {Collection} from '@muze-nl/oldm-core'
import {n3Parser} from '@muze-nl/oldm-n3'
import {turtleParser, turtlePatchWriter, turtleWriter} from '@muze-labs/oldm-turtle'

const url = 'https://example.org/document'
const root = url+'#root'
const context = () => oldm({
	parser: turtleParser,
	writer: turtleWriter,
	patchWriter: turtlePatchWriter
})
const parse = text => context().parse(text, url, 'text/turtle')
const quads = text => n3Parser(text, url, 'text/turtle').quads
const objects = (graph, subject, predicate) => graph
	.filter(quad => quad.subject.id == subject && quad.predicate.id == predicate)
	.map(quad => quad.object)
const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

tap.test('full writes retain a self-reference and unrelated data', async t => {
	const source = parse(`
		<#root> <urn:node> _:loop ; <urn:keep> "kept" .
		_:loop <urn:next> _:loop ; <urn:title> "Loop"@en .
	`)
	const node = source.get(root)['urn:node']
	const output = await source.write()
	const graph = quads(output)
	const restored = objects(graph, root, 'urn:node')[0]
	t.equal(restored.termType, 'BlankNode')
	t.equal(objects(graph, restored.id, 'urn:next')[0].id, restored.id)
	t.equal(objects(graph, restored.id, 'urn:title')[0].language, 'en')
	t.equal(objects(graph, root, 'urn:keep')[0].value, 'kept')
	t.equal(graph.length, 4, 'no properties lost or duplicated')
	t.equal(node['urn:next'], node, 'writing leaves the source identity intact')
	t.equal(await source.write(), output, 'repeat writes are stable')
})

tap.test('full writes retain a mutual cycle and shared empty nodes', async t => {
	const source = parse(`
		<#root> <urn:node> _:a ; <urn:empty> _:empty .
		<#other> <urn:node> _:b ; <urn:empty> _:empty .
		_:a <urn:next> _:b .
		_:b <urn:next> _:a .
	`)
	const graph = quads(await source.write())
	const a = objects(graph, root, 'urn:node')[0]
	const b = objects(graph, url+'#other', 'urn:node')[0]
	t.equal(objects(graph, a.id, 'urn:next')[0].id, b.id)
	t.equal(objects(graph, b.id, 'urn:next')[0].id, a.id)
	t.equal(objects(graph, root, 'urn:empty')[0].id,
		objects(graph, url+'#other', 'urn:empty')[0].id)
	t.not(a.id, b.id, 'distinct nodes remain distinct')
	t.equal(graph.length, 6)
})

tap.test('shared nodes keep one identity inside lists and object lists', async t => {
	const source = parse(`
		<#root> <urn:items> (_:shared _:shared) ;
			<urn:nodes> _:shared, [ <urn:name> "Different" ] .
		_:shared <urn:name> "Shared" .
	`)
	const graph = quads(await source.write())
	const head = objects(graph, root, 'urn:items')[0]
	const first = objects(graph, head.id, rdf+'first')[0]
	const tail = objects(graph, head.id, rdf+'rest')[0]
	const second = objects(graph, tail.id, rdf+'first')[0]
	const nodes = objects(graph, root, 'urn:nodes')
	t.equal(first.id, second.id)
	t.equal(first.id, nodes[0].id)
	t.not(first.id, nodes[1].id)
	t.equal(objects(graph, first.id, 'urn:name')[0].value, 'Shared')
	t.equal(graph.filter(quad => quad.predicate.id == 'urn:name').length, 2)
})

tap.test('a cycle through an RDF collection keeps the collection head', async t => {
	const source = parse(`
		<#root> <urn:list> _:list ; <urn:same> _:list .
		_:list <${rdf}first> _:node ; <${rdf}rest> _:tail .
		_:tail <${rdf}first> "second" ; <${rdf}rest> <${rdf}nil> .
		_:node <urn:head> _:list .
	`)
	const graph = quads(await source.write())
	const head = objects(graph, root, 'urn:list')[0]
	const node = objects(graph, head.id, rdf+'first')[0]
	const tail = objects(graph, head.id, rdf+'rest')[0]
	t.equal(objects(graph, root, 'urn:same')[0].id, head.id)
	t.equal(objects(graph, node.id, 'urn:head')[0].id, head.id)
	t.equal(objects(graph, tail.id, rdf+'first')[0].value, 'second')
	t.equal(objects(graph, tail.id, rdf+'rest')[0].id, rdf+'nil')
	t.equal(graph.length, 7)
})

tap.test('a collection can contain a reference to its own head', async t => {
	const source = parse(`
		<#root> <urn:list> _:list .
		_:list <${rdf}first> _:list ; <${rdf}rest> <${rdf}nil> .
	`)
	const graph = quads(await source.write())
	const head = objects(graph, root, 'urn:list')[0]
	t.equal(objects(graph, head.id, rdf+'first')[0].id, head.id)
	t.equal(objects(graph, head.id, rdf+'rest')[0].id, rdf+'nil')
	t.equal(graph.length, 3)
})

tap.test('empty property and type arrays are omitted; empty RDF lists remain', async t => {
	const source = parse(`
		<#root> a <urn:Type> ; <urn:groups> <urn:group> ;
			<urn:node> [ <urn:keep> "nested" ] ; <urn:keep> "kept" .
	`)
	source.set(root, 'urn:groups', [])
	source.set(root, 'a', [])
	source.set(source.get(root)['urn:node'], 'urn:empty', [])
	source.set(root, 'urn:list', new Collection(source))
	source.set(url+'#empty', 'urn:empty', [])
	const output = await source.write()
	const graph = quads(output)
	t.equal(objects(graph, root, 'urn:groups').length, 0)
	t.equal(objects(graph, root, rdf+'type').length, 0)
	t.equal(graph.filter(quad => quad.predicate.id == 'urn:empty').length, 0)
	t.equal(objects(graph, root, 'urn:keep')[0].value, 'kept')
	t.equal(objects(graph, root, 'urn:list')[0].id, rdf+'nil')
	t.equal(source.get(root)['urn:groups'].length, 0, 'no mutation on write')
	t.equal(graph.length, 4)
	t.doesNotThrow(() => turtleParser(output, url), 'both parsers accept output')
})

tap.test('patches retain the conservative rejection of changed cyclic values', async t => {
	const source = parse(`
		<#root> <urn:node> _:loop . _:loop <urn:next> _:loop .
	`)
	source.set(source.get(root)['urn:node'], 'urn:title', 'Changed')
	await t.rejects(source.patch(), /cyclic anonymous value/)
})

tap.test('clearing property values produces a valid deletion patch', async t => {
	const source = parse('<#root> <urn:groups> <urn:group> ; <urn:keep> "kept" .')
	source.set(root, 'urn:groups', [])
	const patch = await source.patch()
	t.match(patch, /solid:deletes \{/)
	t.match(patch, '<urn:groups> <urn:group>')
	t.notMatch(patch, '<urn:keep>')
})

tap.test('unrelated named-node changes can be patched beside an unchanged cycle', async t => {
	const source = parse(`
		<#root> <urn:node> _:loop ; <urn:title> "Before" .
		_:loop <urn:next> _:loop .
	`)
	source.set(root, 'urn:title', 'After')
	const patch = await source.patch()
	t.match(patch, '"Before"')
	t.match(patch, '"After"')
	t.notMatch(patch, '<urn:next>')
})

tap.test('empty arrays do not suppress valid falsy literal values', async t => {
	const source = parse('')
	source.set(root, 'urn:empty', [])
	source.set(root, 'urn:zero', 0)
	source.set(root, 'urn:false', false)
	source.set(root, 'urn:text', '')
	const graph = quads(await source.write())
	t.equal(objects(graph, root, 'urn:empty').length, 0)
	t.equal(objects(graph, root, 'urn:zero')[0].value, '0')
	t.equal(objects(graph, root, 'urn:false')[0].value, 'false')
	t.equal(objects(graph, root, 'urn:text')[0].value, '')
	t.equal(graph.length, 3)
})
