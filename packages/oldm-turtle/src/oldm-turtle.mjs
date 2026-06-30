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

function variable(id) {
	return {termType: 'Variable', id}
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
		for (const [prefix, iri] of Object.entries(this.#source.prefixDeclarations('source'))) {
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
		if ((short != id && /^[A-Za-z][A-Za-z0-9_-]*:[^/].*$/.test(short)) || /^:[^\s]*$/.test(short) || short == 'a') {
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


export const turtlePatchWriter = async (source) => {
	if (source.originalSource == null) {
		throw new Error('Cannot generate a patch without the original graph source')
	}

	const currentSource = await turtleWriter(source)
	const original = turtleParser(source.originalSource, source.url).quads
	const current = turtleParser(currentSource, source.url).quads
	const patch = solidPatchChanges(original, current, {
		quad,
		variable,
		blankNode
	})

	return serializePatch(source, patch.inserts, patch.deletes, patch.where)
}

function diffQuads(original, current)
{
	const originalByKey = new Map(original.map(quad => [quadKey(quad), quad]))
	const currentByKey = new Map(current.map(quad => [quadKey(quad), quad]))

	const deletes = []
	const inserts = []
	for (const [key, quad] of originalByKey) {
		if (!currentByKey.has(key)) {
			deletes.push(quad)
		}
	}
	for (const [key, quad] of currentByKey) {
		if (!originalByKey.has(key)) {
			inserts.push(quad)
		}
	}
	return {inserts, deletes}
}

function quadKey(quad)
{
	return [
		termKey(quad.subject),
		termKey(quad.predicate),
		termKey(quad.object)
	].join(' ')
}

function termKey(term)
{
	if (!term) {
		return ''
	}
	if (term.termType == 'Literal') {
		return [
			'Literal',
			term.value,
			term.language ?? '',
			term.datatype?.id ?? ''
		].join('\u0000')
	}
	return `${term.termType}\u0000${term.id ?? ''}`
}

function solidPatchChanges(original, current, factory)
{
	const originalAnonymous = anonymousUnits(original)
	const currentAnonymous = anonymousUnits(current)
	const {deletedUnits, insertedUnits} = diffAnonymousUnits(originalAnonymous.units, currentAnonymous.units)
	const anonymousDeletes = []
	const anonymousInserts = []
	const where = []

	for (const unit of deletedUnits) {
		assertOwnedAnonymousUnit(unit, 'delete')
		const variableQuads = mapBlankNodes(unit.quads, name => factory.variable(name), factory.quad, 'old')
		where.push(...variableQuads)
		anonymousDeletes.push(...variableQuads)
	}

	for (const unit of insertedUnits) {
		assertOwnedAnonymousUnit(unit, 'insert')
		anonymousInserts.push(...mapBlankNodes(unit.quads, name => factory.blankNode(name), factory.quad, 'insert'))
	}

	const plainOriginal = original.filter(quad => !originalAnonymous.quadKeys.has(quadKey(quad)))
	const plainCurrent = current.filter(quad => !currentAnonymous.quadKeys.has(quadKey(quad)))
	const plainDiff = diffQuads(plainOriginal, plainCurrent)

	assertPatchable(plainDiff.inserts, 'insert changes outside an owned anonymous value')
	assertPatchable(plainDiff.deletes, 'delete changes outside an owned anonymous value')

	return {
		where,
		deletes: [...plainDiff.deletes, ...anonymousDeletes],
		inserts: [...plainDiff.inserts, ...anonymousInserts]
	}
}

function anonymousUnits(quads)
{
	const outgoing = blankSubjectIndex(quads)
	const incoming = blankObjectIndex(quads)
	const units = []
	const quadKeys = new Set()

	for (const edge of quads) {
		if (!isBlankNode(edge.object) || isBlankNode(edge.subject)) {
			continue
		}
		const closure = blankNodeClosure(edge.object, outgoing)
		const canonical = canonicalBlankNode(edge.object, outgoing)
		const unitQuads = [edge, ...closure.quads]
		for (const quad of unitQuads) {
			quadKeys.add(quadKey(quad))
		}
		units.push({
			edge,
			quads: unitQuads,
			blankNodeIds: closure.blankNodeIds,
			incoming,
			cyclic: closure.cyclic || canonical.cyclic,
			signature: [termKey(edge.subject), termKey(edge.predicate), canonical.key].join(' ')
		})
	}

	return {units, quadKeys}
}

function blankSubjectIndex(quads)
{
	const index = new Map()
	for (const quad of quads) {
		if (!isBlankNode(quad.subject)) {
			continue
		}
		const id = termValue(quad.subject)
		if (!index.has(id)) {
			index.set(id, [])
		}
		index.get(id).push(quad)
	}
	return index
}

function blankObjectIndex(quads)
{
	const index = new Map()
	for (const quad of quads) {
		if (!isBlankNode(quad.object)) {
			continue
		}
		const id = termValue(quad.object)
		if (!index.has(id)) {
			index.set(id, [])
		}
		index.get(id).push(quad)
	}
	return index
}

function blankNodeClosure(root, outgoing)
{
	const blankNodeIds = new Set()
	const quads = []
	const stack = [root]
	let cyclic = false

	while (stack.length) {
		const term = stack.pop()
		const id = termValue(term)
		if (blankNodeIds.has(id)) {
			cyclic = true
			continue
		}
		blankNodeIds.add(id)
		for (const quad of outgoing.get(id) ?? []) {
			quads.push(quad)
			if (isBlankNode(quad.object)) {
				stack.push(quad.object)
			}
		}
	}

	return {quads, blankNodeIds, cyclic}
}

function canonicalBlankNode(term, outgoing, memo=new Map(), path=new Set())
{
	const id = termValue(term)
	if (memo.has(id)) {
		return memo.get(id)
	}
	if (path.has(id)) {
		return {key: '[cycle]', cyclic: true}
	}

	path.add(id)
	let cyclic = false
	const properties = (outgoing.get(id) ?? []).map(quad => {
		const object = canonicalTerm(quad.object, outgoing, memo, path)
		cyclic ||= object.cyclic
		return `${termKey(quad.predicate)} ${object.key}`
	}).sort()
	path.delete(id)

	const result = {
		key: `BlankNode(${properties.join('|')})`,
		cyclic
	}
	memo.set(id, result)
	return result
}

function canonicalTerm(term, outgoing, memo, path)
{
	if (isBlankNode(term)) {
		return canonicalBlankNode(term, outgoing, memo, path)
	}
	return {key: termKey(term), cyclic: false}
}

function diffAnonymousUnits(original, current)
{
	const originalBySignature = groupUnitsBySignature(original)
	const currentBySignature = groupUnitsBySignature(current)
	const signatures = new Set([...originalBySignature.keys(), ...currentBySignature.keys()])
	const deletedUnits = []
	const insertedUnits = []

	for (const signature of signatures) {
		const originalUnits = originalBySignature.get(signature) ?? []
		const currentUnits = currentBySignature.get(signature) ?? []
		const unchanged = Math.min(originalUnits.length, currentUnits.length)
		deletedUnits.push(...originalUnits.slice(unchanged))
		insertedUnits.push(...currentUnits.slice(unchanged))
	}

	return {deletedUnits, insertedUnits}
}

function groupUnitsBySignature(units)
{
	const grouped = new Map()
	for (const unit of units) {
		if (!grouped.has(unit.signature)) {
			grouped.set(unit.signature, [])
		}
		grouped.get(unit.signature).push(unit)
	}
	return grouped
}

function assertOwnedAnonymousUnit(unit, operation)
{
	if (unit.cyclic) {
		throw new Error(`Cannot generate a Solid PATCH to ${operation} a cyclic anonymous value; use graph.write() and PUT instead`)
	}

	for (const id of unit.blankNodeIds) {
		const incoming = unit.incoming.get(id) ?? []
		if (incoming.length != 1) {
			throw new Error(`Cannot generate a Solid PATCH to ${operation} a shared anonymous value; use graph.write() and PUT instead`)
		}
	}
}

function mapBlankNodes(quads, createTerm, createQuad, prefix)
{
	const terms = new Map()
	const mapTerm = term => {
		if (!isBlankNode(term)) {
			return term
		}
		const id = termValue(term)
		if (!terms.has(id)) {
			terms.set(id, createTerm(`${prefix}${terms.size}`))
		}
		return terms.get(id)
	}
	return quads.map(quad => createQuad(mapTerm(quad.subject), quad.predicate, mapTerm(quad.object)))
}

function assertPatchable(quads, operation)
{
	const hasBlankNode = quads.some(quad =>
		isBlankNode(quad.subject)
		|| isBlankNode(quad.predicate)
		|| isBlankNode(quad.object)
	)
	if (hasBlankNode) {
		throw new Error(`Cannot generate a Solid PATCH with blank nodes in ${operation}; use graph.write() and PUT instead`)
	}
}

function isBlankNode(term)
{
	return term?.termType == 'BlankNode'
}

function termValue(term)
{
	return term?.id ?? term?.value ?? ''
}

function serializePatch(source, inserts, deletes, where=[])
{
	const prefixes = {
		...source.prefixDeclarations('source'),
		solid: 'http://www.w3.org/ns/solid/terms#'
	}
	const lines = []
	for (const [prefix, iri] of Object.entries(prefixes)) {
		lines.push(`@prefix ${prefix}: <${escapeIRI(iri)}> .`)
	}
	if (lines.length) {
		lines.push('')
	}

	const predicates = []
	if (where.length) {
		predicates.push(`solid:where ${formula(source, where)}`)
	}
	if (deletes.length) {
		predicates.push(`solid:deletes ${formula(source, deletes)}`)
	}
	if (inserts.length) {
		predicates.push(`solid:inserts ${formula(source, inserts)}`)
	}

	let patch = `_:patch a solid:InsertDeletePatch`
	if (predicates.length) {
		patch += ';\n\t' + predicates.join(';\n\t')
	}
	lines.push(`${patch} .`)

	return lines.join('\n')+'\n'
}

function formula(source, quads)
{
	if (!quads.length) {
		return '{}'
	}
	const lines = quads.map(quad => `\n\t\t${quadToString(source, quad)}`)
	return `{${lines.join('')}\n\t}`
}

function quadToString(source, quad)
{
	return `${termToString(source, quad.subject)} ${termToString(source, quad.predicate)} ${termToString(source, quad.object)} .`
}

function termToString(source, term)
{
	if (term.termType == 'Variable') {
		return `?${term.id}`
	}
	if (term.termType == 'NamedNode') {
		return resource(source, term.id)
	}
	if (term.termType == 'BlankNode') {
		return `_:${term.id}`
	}
	if (term.termType == 'Literal') {
		return literalToString(source, term)
	}
	throw new Error(`Cannot serialize unknown RDF term type: ${term.termType}`)
}

function literalToString(source, term)
{
	const quoted = `"${escapeString(String(term.value))}"`
	if (term.language) {
		return `${quoted}@${term.language}`
	}
	const datatype = term.datatype?.id
	if (datatype && datatype != XSD+'string') {
		return `${quoted}^^${resource(source, datatype)}`
	}
	return quoted
}

function resource(source, id)
{
	if (id == rdfType) {
		return 'a'
	}
	const short = source.shortURI(id, ':')
	if ((short != id && /^[A-Za-z][A-Za-z0-9_-]*:[^/].*$/.test(short)) || /^:[^\s]*$/.test(short)) {
		return short
	}
	return `<${escapeIRI(id)}>`
}

function escapeIRI(value)
{
	return String(value).replace(/\\/g, '\\\\').replace(/>/g, '\\>')
}

function escapeString(value)
{
	return value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t')
}
