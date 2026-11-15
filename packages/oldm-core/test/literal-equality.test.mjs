import tap from 'tap'
import { Graph, Context, literal, many } from '@muze-nl/oldm-core'

const integer = 'http://www.w3.org/2001/XMLSchema#integer'
const predicate = 'urn:value'
for (const reverse of [false, true]) {
  tap.test(`numeric and lexical literals deduplicate and delete, reversed=${reverse}`, t => {
    const graph = new Graph([], 'urn:graph', 'text/turtle', {}, new Context())
    const pair = [literal(9, { type: integer }), literal('9', { type: integer, language: '' })]
    if (reverse) {
      pair.reverse()
    }
    graph.add('urn:item', predicate, pair[0])
    graph.add('urn:item', predicate, pair[1])
    t.equal(many(graph.get('urn:item')[predicate]).length, 1)
    graph.delete('urn:item', predicate, pair[1])
    t.equal(graph.get('urn:item')[predicate], undefined)
    t.end()
  })
}

tap.test('literal equality preserves datatype, lexical form, and real language differences', t => {
  const graph = new Graph([], 'urn:graph', 'text/turtle', {}, new Context())
  const entries = [
    literal(9, { type: integer }),
    literal('09', { type: integer }),
    literal('9', { type: 'http://www.w3.org/2001/XMLSchema#string' }),
    literal('nine', { language: 'en' }),
    literal('nine', { language: 'fr' })
  ]
  for (const entry of entries) {
    graph.add('urn:item', predicate, entry)
  }
  t.equal(many(graph.get('urn:item')[predicate]).length, entries.length)
  t.end()
})
