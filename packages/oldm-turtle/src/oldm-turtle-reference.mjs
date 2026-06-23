import {rdfType} from '@muze-nl/oldm-core'
import {Grammar} from 'ohm-js'
import turtleOhm18WasmBytes from './generated/turtle-ohm18-wasm.mjs'
import {turtleWriter} from './oldm-turtle.mjs'

const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

// This parser is intentionally a reference implementation, not a small or fast
// production parser. It keeps the Turtle grammar visible in
// experimental/turtle.ohm and uses a straightforward CST walk to build the
// same parser-adapter shape as the handwritten parser.
const grammar = new Grammar(turtleOhm18WasmBytes())

function namedNode(id) {
	return {termType: 'NamedNode', id}
}

function blankNode(id) {
	return {termType: 'BlankNode', id}
}

function literal(value, datatype=XSD+'string', language='') {
	return {
		termType: 'Literal',
		value,
		datatype: namedNode(datatype),
		language
	}
}

function quad(subject, predicate, object) {
	return {subject, predicate, object}
}

class ReferenceTurtleParser {
	#input
	#url
	#base
	#blankNode = 0
	#quads = []
	#prefixes = Object.create(null)
	#blankNodes = Object.create(null)

	constructor(input, url) {
		this.#input = input
		this.#url = url
		this.#base = url
		this.#prefixes.rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
		this.#prefixes.xsd = XSD
	}

	parse() {
		const result = grammar.match(this.#input)
		try {
			if (!result.succeeded()) {
				throw new SyntaxError(result.message)
			}
			this.parseDocument(result.getCstRoot())
			return {
				quads: this.#quads,
				prefixes: this.#prefixes
			}
		} finally {
			result.dispose()
		}
	}

	parseDocument(node) {
		for (const statement of node.children[0].children) {
			this.parseStatement(statement)
		}
	}

	parseStatement(node) {
		const variant = node.children[0]
		if (variant.ctorName == 'Statement_directive') {
			this.parseDirective(variant.children[0].children[0])
			return
		}
		if (variant.ctorName == 'Statement_triples') {
			this.parseTriples(variant.children[0])
			return
		}
		this.error(`Unsupported statement: ${variant.ctorName}`)
	}

	parseDirective(node) {
		const variant = node.children[0]
		if (variant.ctorName == 'PrefixDirective') {
			const [, prefixLabel, iriRef] = variant.children
			this.#prefixes[this.prefixLabel(prefixLabel)] = this.resolveIRI(this.iriReference(iriRef))
			return
		}
		if (variant.ctorName == 'BaseDirective') {
			const [, iriRef] = variant.children
			this.#base = this.resolveIRI(this.iriReference(iriRef))
			return
		}
		if (variant.ctorName == 'SparqlPrefix') {
			const [, prefixLabel, iriRef] = variant.children
			this.#prefixes[this.prefixLabel(prefixLabel)] = this.resolveIRI(this.iriReference(iriRef))
			return
		}
		if (variant.ctorName == 'SparqlBase') {
			const [, iriRef] = variant.children
			this.#base = this.resolveIRI(this.iriReference(iriRef))
			return
		}
		this.error(`Unsupported directive: ${variant.ctorName}`)
	}

	parseTriples(node) {
		const [subjectNode, predicateObjectList] = node.children
		const subject = this.term(subjectNode)
		this.parsePredicateObjectList(subject, predicateObjectList)
	}

	parsePredicateObjectList(subject, node) {
		const [predicateNode, objectListNode, repeated] = node.children
		this.parseObjectList(subject, this.predicate(predicateNode), objectListNode)
		for (const item of repeated.children) {
			const [, nextPredicate, nextObjectList] = item.children
			this.parseObjectList(subject, this.predicate(nextPredicate), nextObjectList)
		}
	}

	parseObjectList(subject, predicate, node) {
		const [objectNode, repeated] = node.children
		this.#quads.push(quad(subject, predicate, this.term(objectNode)))
		for (const item of repeated.children) {
			const [, nextObject] = item.children
			this.#quads.push(quad(subject, predicate, this.term(nextObject)))
		}
	}

	predicate(node) {
		const value = node.children[0]
		if (value.ctorName == 'rdfType') {
			return namedNode(rdfType)
		}
		return this.resource(value)
	}

	term(node) {
		const value = node.children[0]
		switch (value.ctorName) {
			case 'Resource': return this.resource(value)
			case 'BlankNodePropertyList': return this.blankNodePropertyList(value)
			case 'Collection': return this.collection(value)
			case 'Literal': return this.literal(value)
			default: this.error(`Unsupported term: ${value.ctorName}`)
		}
	}

	resource(node) {
		const value = node.children[0]
		switch (value.ctorName) {
			case 'iriRef': return namedNode(this.resolveIRI(this.iriReference(value)))
			case 'blankNodeLabel': return this.blankNodeLabel(value)
			case 'prefixedName': return namedNode(this.expandPrefixedName(value.sourceString))
			default: this.error(`Unsupported resource: ${value.ctorName}`)
		}
	}

	blankNodePropertyList(node) {
		const [, optionalPredicateObjectList] = node.children
		const blank = this.newBlankNode()
		if (optionalPredicateObjectList.children.length) {
			this.parsePredicateObjectList(blank, optionalPredicateObjectList.children[0])
		}
		return blank
	}

	collection(node) {
		const objects = node.children[1].children
		if (!objects.length) {
			return namedNode(RDF_NIL)
		}

		let firstNode = null
		let previousNode = null
		for (const objectNode of objects) {
			const currentNode = this.newBlankNode()
			if (previousNode) {
				this.#quads.push(quad(previousNode, namedNode(RDF_REST), currentNode))
			}
			this.#quads.push(quad(currentNode, namedNode(RDF_FIRST), this.term(objectNode)))
			firstNode ??= currentNode
			previousNode = currentNode
		}
		this.#quads.push(quad(previousNode, namedNode(RDF_REST), namedNode(RDF_NIL)))
		return firstNode
	}

	literal(node) {
		const variant = node.children[0]
		switch (variant.ctorName) {
			case 'Literal_typed': {
				const [stringLiteral,, datatype] = variant.children
				return literal(this.stringLiteral(stringLiteral), this.resource(datatype).id)
			}
			case 'Literal_language': {
				const [stringLiteral, language] = variant.children
				return literal(this.stringLiteral(stringLiteral), XSD+'string', language.sourceString.slice(1))
			}
			case 'Literal_plain':
				return literal(this.stringLiteral(variant.children[0]))
			case 'Literal_boolean':
				return literal(variant.sourceString, XSD+'boolean')
			case 'Literal_numeric':
				return this.numericLiteral(variant.sourceString)
			default:
				this.error(`Unsupported literal: ${variant.ctorName}`)
		}
	}

	stringLiteral(node) {
		return unescapeQuotedString(node.sourceString)
	}

	numericLiteral(value) {
		let datatype = XSD+'integer'
		if (/[eE]/.test(value)) {
			datatype = XSD+'double'
		} else if (value.includes('.')) {
			datatype = XSD+'decimal'
		}
		return literal(value, datatype)
	}

	iriReference(node) {
		return unescapeIRI(node.sourceString.slice(1, -1))
	}

	prefixLabel(node) {
		return node.sourceString.slice(0, -1)
	}

	blankNodeLabel(node) {
		const id = node.sourceString.slice(2)
		this.#blankNodes[id] ??= blankNode(id)
		return this.#blankNodes[id]
	}

	expandPrefixedName(value) {
		const separator = value.indexOf(':')
		const prefix = value.slice(0, separator)
		const local = value.slice(separator + 1)
		if (!(prefix in this.#prefixes)) {
			this.error(`Unknown prefix: ${prefix}`)
		}
		return this.#prefixes[prefix]+local
	}

	resolveIRI(iri) {
		try {
			return new URL(iri, this.#base).href
		} catch(err) {
			return iri
		}
	}

	newBlankNode() {
		return blankNode(`b${++this.#blankNode}`)
	}

	error(message) {
		throw new SyntaxError(message)
	}
}

function unescapeIRI(value) {
	return value.replace(/\\(?:u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|(.))/g, (_, small, large, other) => {
		if (small || large) {
			return String.fromCodePoint(parseInt(small || large, 16))
		}
		return other
	})
}

function unescapeQuotedString(value) {
	let start = 1
	let end = value.length - 1
	const quote = value[0]
	if (value.startsWith(quote.repeat(3))) {
		start = 3
		end = value.length - 3
	}
	return value.slice(start, end).replace(/\\(?:t|b|n|r|f|"|'|\\|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})/g, escape => {
		const char = escape[1]
		switch (char) {
			case 't': return '\t'
			case 'b': return '\b'
			case 'n': return '\n'
			case 'r': return '\r'
			case 'f': return '\f'
			case '"': return '"'
			case "'": return "'"
			case '\\': return '\\'
			case 'u': return String.fromCodePoint(parseInt(escape.slice(2), 16))
			case 'U': return String.fromCodePoint(parseInt(escape.slice(2), 16))
			default: return char
		}
	})
}

export const turtleReferenceParser = (input, uri) => new ReferenceTurtleParser(input, uri).parse()

// Backwards-compatible alias for the original experiment name. The preferred
// name is turtleReferenceParser, because the goal of this parser is now test
// oracle/readability rather than production use.
export const turtleOhm18Parser = turtleReferenceParser
export {turtleWriter, turtleReferenceParser as turtleParser}
