import {rdfType, NamedNode, BlankNode, Collection} from '@muze-nl/oldm-core'

const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

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

class TurtleParser {
	#input
	#url
	#base
	#position = 0
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
		while (!this.done()) {
			this.skip()
			if (this.done()) {
				break
			}
			if (this.matchDirective()) {
				this.parseDirective()
			} else {
				this.parseTriples()
			}
		}
		return {
			quads: this.#quads,
			prefixes: this.#prefixes
		}
	}

	matchDirective() {
		return this.startsWith('@prefix')
			|| this.startsWith('@base')
			|| this.startsWith('PREFIX')
			|| this.startsWith('BASE')
	}

	parseDirective() {
		if (this.consume('@prefix') || this.consume('PREFIX')) {
			this.skip()
			const prefix = this.readPrefixLabel()
			this.skip()
			const iri = this.readIRIReference()
			this.#prefixes[prefix] = this.resolveIRI(iri)
			this.skip()
			if (this.peek() == '.') {
				this.#position++
			}
			return
		}
		if (this.consume('@base') || this.consume('BASE')) {
			this.skip()
			this.#base = this.resolveIRI(this.readIRIReference())
			this.skip()
			if (this.peek() == '.') {
				this.#position++
			}
			return
		}
		this.error('Expected directive')
	}

	parseTriples() {
		const subject = this.parseSubject()
		this.skip()
		this.parsePredicateObjectList(subject)
		this.skip()
		this.expect('.')
	}

	parsePredicateObjectList(subject) {
		while (true) {
			this.skip()
			if (this.peek() == ']' || this.peek() == '.') {
				return
			}
			const predicate = this.parsePredicate()
			this.skip()
			this.parseObjectList(subject, predicate)
			this.skip()
			if (this.peek() != ';') {
				return
			}
			while (this.peek() == ';') {
				this.#position++
				this.skip()
				if (this.peek() == ']' || this.peek() == '.') {
					return
				}
				break
			}
		}
	}

	parseObjectList(subject, predicate) {
		while (true) {
			const object = this.parseObject()
			this.#quads.push(quad(subject, predicate, object))
			this.skip()
			if (this.peek() != ',') {
				return
			}
			this.#position++
			this.skip()
		}
	}

	parseSubject() {
		this.skip()
		const char = this.peek()
		if (char == '[') {
			return this.parseBlankNodePropertyList()
		}
		if (char == '(') {
			return this.parseCollection()
		}
		return this.parseResource()
	}

	parsePredicate() {
		if (this.tokenIs('a')) {
			this.#position++
			return namedNode(rdfType)
		}
		return this.parseResource()
	}

	parseObject() {
		this.skip()
		const char = this.peek()
		if (char == '[') {
			return this.parseBlankNodePropertyList()
		}
		if (char == '(') {
			return this.parseCollection()
		}
		if (char == '<' || char == '_' || this.looksLikePrefixedName()) {
			return this.parseResource()
		}
		if (char == '"' || char == "'") {
			return this.parseStringLiteral()
		}
		if (this.startsWith('true') && this.tokenEnds(4)) {
			this.#position += 4
			return literal('true', XSD+'boolean')
		}
		if (this.startsWith('false') && this.tokenEnds(5)) {
			this.#position += 5
			return literal('false', XSD+'boolean')
		}
		return this.parseNumericLiteral()
	}

	parseResource() {
		this.skip()
		if (this.peek() == '<') {
			return namedNode(this.resolveIRI(this.readIRIReference()))
		}
		if (this.startsWith('_:')) {
			return this.readBlankNodeLabel()
		}
		return namedNode(this.expandPrefixedName(this.readPrefixedName()))
	}

	parseBlankNodePropertyList() {
		this.expect('[')
		this.skip()
		const node = this.newBlankNode()
		if (this.peek() == ']') {
			this.#position++
			return node
		}
		this.parsePredicateObjectList(node)
		this.skip()
		this.expect(']')
		return node
	}

	parseCollection() {
		this.expect('(')
		this.skip()
		if (this.peek() == ')') {
			this.#position++
			return namedNode(RDF_NIL)
		}
		let firstNode = null
		let previousNode = null
		while (this.peek() != ')') {
			const currentNode = this.newBlankNode()
			if (previousNode) {
				this.#quads.push(quad(previousNode, namedNode(RDF_REST), currentNode))
			}
			const object = this.parseObject()
			this.#quads.push(quad(currentNode, namedNode(RDF_FIRST), object))
			firstNode ??= currentNode
			previousNode = currentNode
			this.skip()
		}
		this.expect(')')
		this.#quads.push(quad(previousNode, namedNode(RDF_REST), namedNode(RDF_NIL)))
		return firstNode
	}

	parseStringLiteral() {
		const value = this.readString()
		this.skip()
		if (this.peek() == '@') {
			this.#position++
			return literal(value, XSD+'string', this.readLanguageTag())
		}
		if (this.consume('^^')) {
			this.skip()
			const datatype = this.parseResource()
			return literal(value, datatype.id)
		}
		return literal(value)
	}

	parseNumericLiteral() {
		const rest = this.#input.slice(this.#position)
		const match = rest.match(/^[+-]?(?:(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|[0-9]+[eE][+-]?[0-9]+|[0-9]+)/)
		if (!match) {
			this.error('Expected object')
		}
		const value = match[0]
		this.#position += value.length
		let datatype = XSD+'integer'
		if (/[eE]/.test(value)) {
			datatype = XSD+'double'
		} else if (value.includes('.')) {
			datatype = XSD+'decimal'
		}
		return literal(value, datatype)
	}

	readIRIReference() {
		this.expect('<')
		let result = ''
		while (!this.done()) {
			const char = this.next()
			if (char == '>') {
				return result
			}
			if (char == '\\') {
				result += this.readEscape()
			} else {
				result += char
			}
		}
		this.error('Unclosed IRI reference')
	}

	readString() {
		const quote = this.next()
		let triple = false
		if (this.peek() == quote && this.#input[this.#position+1] == quote) {
			triple = true
			this.#position += 2
		}
		let result = ''
		while (!this.done()) {
			if (triple && this.peek() == quote && this.#input[this.#position+1] == quote && this.#input[this.#position+2] == quote) {
				this.#position += 3
				return result
			}
			const char = this.next()
			if (!triple && char == quote) {
				return result
			}
			if (char == '\\') {
				result += this.readEscape()
			} else {
				result += char
			}
		}
		this.error('Unclosed string literal')
	}

	readEscape() {
		const char = this.next()
		switch (char) {
			case 't': return '\t'
			case 'b': return '\b'
			case 'n': return '\n'
			case 'r': return '\r'
			case 'f': return '\f'
			case '"': return '"'
			case "'": return "'"
			case '\\': return '\\'
			case 'u': return String.fromCodePoint(parseInt(this.readChars(4), 16))
			case 'U': return String.fromCodePoint(parseInt(this.readChars(8), 16))
			default: return char
		}
	}

	readPrefixLabel() {
		const name = this.readName()
		this.expect(':')
		return name
	}

	readPrefixedName() {
		const prefix = this.readName()
		this.expect(':')
		const local = this.readLocalName()
		return {prefix, local}
	}

	readBlankNodeLabel() {
		this.expect('_')
		this.expect(':')
		const id = this.readName()
		if (!id) {
			this.error('Expected blank node label')
		}
		this.#blankNodes[id] ??= blankNode(id)
		return this.#blankNodes[id]
	}

	readLanguageTag() {
		const match = this.#input.slice(this.#position).match(/^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*/)
		if (!match) {
			this.error('Expected language tag')
		}
		this.#position += match[0].length
		return match[0]
	}

	readName() {
		const match = this.#input.slice(this.#position).match(/^[A-Za-z][A-Za-z0-9_-]*/)
		if (!match) {
			return ''
		}
		this.#position += match[0].length
		return match[0]
	}

	readLocalName() {
		const start = this.#position
		while (!this.done()) {
			const char = this.peek()
			if (/\s/.test(char) || [';', ',', '.', '[', ']', '(', ')', '<', '>', '"', "'"].includes(char)) {
				break
			}
			if (char == '#') {
				break
			}
			this.#position++
		}
		return this.#input.slice(start, this.#position)
	}

	readChars(length) {
		const result = this.#input.slice(this.#position, this.#position+length)
		if (result.length != length || !/^[0-9a-fA-F]+$/.test(result)) {
			this.error('Invalid unicode escape')
		}
		this.#position += length
		return result
	}

	expandPrefixedName({prefix, local}) {
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

	looksLikePrefixedName() {
		const rest = this.#input.slice(this.#position)
		return /^([A-Za-z][A-Za-z0-9_-]*)?:/.test(rest)
	}

	tokenIs(token) {
		return this.startsWith(token) && this.tokenEnds(token.length)
	}

	tokenEnds(length) {
		const next = this.#input[this.#position+length]
		return !next || /[\s;,\.\[\]\(\)]/.test(next)
	}

	skip() {
		while (!this.done()) {
			const char = this.peek()
			if (/\s/.test(char)) {
				this.#position++
				continue
			}
			if (char == '#') {
				while (!this.done() && this.peek() != '\n' && this.peek() != '\r') {
					this.#position++
				}
				continue
			}
			break
		}
	}

	startsWith(value) {
		return this.#input.startsWith(value, this.#position)
	}

	consume(value) {
		if (!this.startsWith(value)) {
			return false
		}
		this.#position += value.length
		return true
	}

	expect(value) {
		if (!this.consume(value)) {
			this.error(`Expected ${value}`)
		}
	}

	peek() {
		return this.#input[this.#position]
	}

	next() {
		return this.#input[this.#position++]
	}

	done() {
		return this.#position >= this.#input.length
	}

	error(message) {
		const line = this.#input.slice(0, this.#position).split(/\r\n|\r|\n/).length
		const lineStart = Math.max(this.#input.lastIndexOf('\n', this.#position-1), this.#input.lastIndexOf('\r', this.#position-1)) + 1
		const column = this.#position - lineStart + 1
		throw new SyntaxError(`${message} at ${line}:${column}`)
	}
}

export const turtleParser = (input, uri) => new TurtleParser(input, uri).parse()

export const turtleWriter = async (source) => {
	const writer = new TurtleWriter(source)
	return writer.write()
}

class TurtleWriter {
	#source
	#blankNode = 0
	#blankNodeIds = new WeakMap()

	constructor(source) {
		this.#source = source
	}

	write() {
		const lines = []
		for (const [prefix, iri] of Object.entries(this.#source.prefixes ?? this.#source.context.prefixes)) {
			lines.push(`@prefix ${prefix}: <${this.escapeIRI(iri)}> .`)
		}
		if (lines.length) {
			lines.push('')
		}
		for (const [id, subject] of Object.entries(this.#source.subjects)) {
			const properties = this.getProperties(subject)
			if (!properties.length) {
				continue
			}
			lines.push(`${this.resource(id)} ${this.propertyList(properties)} .`)
			lines.push('')
		}
		return lines.join('\n').trim()+"\n"
	}

	getProperties(subject) {
		const properties = []
		if (subject.a) {
			properties.push(['a', this.values(subject.a).map(type => this.resource(this.#source.fullURI(type)))])
		}
		for (const [predicate, value] of Object.entries(subject)) {
			if (predicate == 'id' || predicate == 'a') {
				continue
			}
			properties.push([
				this.resource(this.#source.fullURI(predicate)),
				this.values(value).map(item => this.object(item))
			])
		}
		return properties
	}

	propertyList(properties) {
		return properties
			.map(([predicate, objects]) => `${predicate} ${objects.join(', ')}`)
			.join(' ;\n\t')
	}

	object(value) {
		if (value instanceof Collection) {
			return `(${value.map(item => this.object(item)).join(' ')})`
		}
		if (value instanceof NamedNode) {
			return this.resource(value.id)
		}
		if (value instanceof BlankNode) {
			return this.blankNode(value)
		}
		return this.literal(value)
	}

	blankNode(value) {
		const properties = this.getProperties(value)
		if (!properties.length) {
			return `_:${this.blankNodeID(value)}`
		}
		return `[ ${this.propertyList(properties)} ]`
	}

	literal(value) {
		let raw = value
		if (value instanceof String) {
			raw = String(value)
		} else if (value instanceof Number) {
			raw = String(Number(value))
		} else if (typeof value == 'boolean' || typeof value == 'number') {
			raw = String(value)
		}

		const quoted = `"${this.escapeString(String(raw))}"`
		const language = value?.language
		if (language) {
			return `${quoted}@${language}`
		}

		const type = this.#source.getType(value)
		if (!type || type == 'xsd$string') {
			return quoted
		}
		return `${quoted}^^${this.resource(this.#source.fullURI(type))}`
	}

	resource(id) {
		const short = this.#source.shortURI(id, ':')
		if (/^[A-Za-z][A-Za-z0-9_-]*:[^/].*$/.test(short) || /^:[^\s]*$/.test(short) || short == 'a') {
			return short
		}
		return `<${this.escapeIRI(id)}>`
	}

	values(value) {
		if (Array.isArray(value) && !(value instanceof Collection)) {
			return value
		}
		return [value]
	}

	blankNodeID(node) {
		if (!this.#blankNodeIds.has(node)) {
			this.#blankNodeIds.set(node, `b${++this.#blankNode}`)
		}
		return this.#blankNodeIds.get(node)
	}

	escapeIRI(value) {
		return String(value).replace(/\\/g, '\\\\').replace(/>/g, '\\>')
	}

	escapeString(value) {
		return value
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/\n/g, '\\n')
			.replace(/\r/g, '\\r')
			.replace(/\t/g, '\\t')
	}
}
