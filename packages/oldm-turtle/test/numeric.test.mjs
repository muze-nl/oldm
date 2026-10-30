import tap from 'tap'
import {turtleParser} from '@muze-labs/oldm-turtle'
import {n3Parser} from '@muze-nl/oldm-n3'

const base = 'https://example.org/notes.ttl'
const xsd = 'http://www.w3.org/2001/XMLSchema#'
const parse = input => turtleParser(input, base, 'text/turtle')
const literals = result => result.quads
	.filter(quad => quad.object.termType == 'Literal')
	.map(({object}) => [object.value, object.datatype.id])

// Turtle 1.1 INTEGER, DECIMAL and DOUBLE: a decimal needs fractional digits,
// while a double may omit them when an exponent follows (e.g. 1.e2).
// https://www.w3.org/TR/turtle/#grammar-production-DECIMAL
for (const [lexical, datatype] of [
	['0', 'integer'], ['1', 'integer'], ['-12', 'integer'], ['+12', 'integer'],
	['001', 'integer'], ['9007199254740993', 'integer'],
	['0.0', 'decimal'], ['12.50', 'decimal'], ['.5', 'decimal'],
	['-.5', 'decimal'], ['+1.25', 'decimal'],
	['1e2', 'double'], ['-1E-2', 'double'], ['+1e+2', 'double'],
	['1.e2', 'double'], ['-1.E+2', 'double'], ['.5e-2', 'double'],
	['1.25E3', 'double'],
]) {
	tap.test(`numeric token ${lexical} leaves the terminating period`, t => {
		const input = `<urn:format> <urn:order> ${lexical}.`
		const result = literals(parse(input))
		t.same(result, [[lexical, xsd+datatype]], 'preserves lexical value and datatype')
		t.same(result, literals(n3Parser(input, base, 'text/turtle')), 'agrees with N3')
		t.end()
	})
}

tap.test('numeric values respect adjacent statements, comments and list punctuation', t => {
	const documents = [
		'<urn:s> <urn:p> 1.# comment\n<urn:s> <urn:q> -2.',
		'<urn:s> <urn:p> 1.<urn:s> <urn:q> 2.',
		'<urn:s> <urn:p> 1,2.5,3.e2; <urn:q> 4.',
		'<urn:s> <urn:p> (1 .5 2.e3); <urn:q> [ <urn:r> -4 ].',
	]
	for (const input of documents) {
		t.same(literals(parse(input)), literals(n3Parser(input, base, 'text/turtle')), input)
	}
	t.end()
})

tap.test('incomplete numeric forms and extra periods are rejected', t => {
	for (const input of ['1. .', '1..', '1e .', '1e+ .', '1.e .', '1.2e- .', '--1 .', '+. .']) {
		const turtle = `<urn:s> <urn:p> ${input}`
		t.throws(() => parse(turtle), SyntaxError, input)
		t.throws(() => n3Parser(turtle, base, 'text/turtle'), undefined, 'N3 rejects '+input)
	}
	t.end()
})
