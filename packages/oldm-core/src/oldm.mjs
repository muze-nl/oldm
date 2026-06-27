export default function oldm(options)
{
	return new Context(options)
}

export const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'

export const prefixes = {
	acl:    'http://www.w3.org/ns/auth/acl#',
	acp:    'http://www.w3.org/ns/solid/acp#',
	dcterms:'http://purl.org/dc/terms/',
	foaf:   'http://xmlns.com/foaf/0.1/',
	ldn:    'https://www.w3.org/ns/ldn#',
	ldp:    'http://www.w3.org/ns/ldp#',
	notify: 'http://www.w3.org/ns/solid/notifications#',
	oidc:   'http://www.w3.org/ns/solid/oidc#',
	owl:    'http://www.w3.org/2002/07/owl#',
	pim:    'http://www.w3.org/ns/pim/space#',
	rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
	rdfs:   'http://www.w3.org/2000/01/rdf-schema#',
	schema: 'http://schema.org/',
	solid:  'http://www.w3.org/ns/solid/terms#',
	stat:   'http://www.w3.org/ns/posix/stat#',
	turtle: 'http://www.w3.org/ns/iana/media-types/text/turtle#',
	vcard:  'http://www.w3.org/2006/vcard/ns#',
	xsd:    'http://www.w3.org/2001/XMLSchema#'
}

export function one(values, whichOne='last')
{
	let result = values
	if (Array.isArray(values)) {
		if (whichOne=='last') {
			result = values[values.length-1]
		} else if (whichOne=='first') {
			result = values[0]
		} else if (typeof whichOne=='function') {
			result = whichOne(values)			
		} else {
			throw new Error('Unknown value for whichOne parameter')
		}
	}
	return result
}

export function many(values)
{
	if (Array.isArray(values)) {
		return values
	}
	if (values == null) {
		return []
	}
	return [values]
}

export function first(...values)
{
	for (const value of values) {
		if (value!==null && value!==undefined) {
			return value
		}
	}
	return null
}

function values(value)
{
	if (Array.isArray(value) && !(value instanceof Collection)) {
		return value
	}
	if (value === undefined) {
		return []
	}
	return [value]
}

function mergeValue(existing, value)
{
	const result = values(existing)
	for (const item of values(value)) {
		if (!result.some(existingItem => sameValue(existingItem, item))) {
			result.push(item)
		}
	}
	if (result.length == 0) {
		return undefined
	}
	if (result.length == 1) {
		return result[0]
	}
	return result
}

function sameValue(left, right)
{
	if (left === right) {
		return true
	}
	if (left instanceof NamedNode && right instanceof NamedNode) {
		return left.id == right.id
	}
	if (left instanceof NamedNode && typeof right == 'string') {
		return left.id == right
	}
	if (typeof left == 'string' && right instanceof NamedNode) {
		return left == right.id
	}
	if (left instanceof Collection && right instanceof Collection) {
		return left.length == right.length
			&& left.every((item, index) => sameValue(item, right[index]))
	}
	if (isLiteral(left) && isLiteral(right)) {
		return String(left) == String(right)
			&& left?.type == right?.type
			&& left?.language == right?.language
	}
	return false
}


function sameSourceValue(left, right)
{
	if (left === right) {
		return true
	}
	if (left instanceof NamedNode && right instanceof NamedNode) {
		return left.id == right.id
	}
	if (left instanceof NamedNode && typeof right == 'string') {
		return left.id == right
	}
	if (typeof left == 'string' && right instanceof NamedNode) {
		return left == right.id
	}
	if (left instanceof Collection && right instanceof Collection) {
		return left.length == right.length
			&& left.every((item, index) => sameSourceValue(item, right[index]))
	}
	if (isLiteral(left) && isLiteral(right)) {
		const leftType = left?.type
		const rightType = right?.type
		const leftLanguage = left?.language
		const rightLanguage = right?.language
		return String(left) == String(right)
			&& (!leftType || !rightType || leftType == rightType)
			&& (!leftLanguage || !rightLanguage || leftLanguage == rightLanguage)
	}
	return false
}

function resolveValue(value, subjects, context)
{
	if (value instanceof Collection) {
		const collection = new Collection(context)
		for (const item of value) {
			collection.push(resolveValue(item, subjects, context))
		}
		return collection
	}
	if (Array.isArray(value)) {
		return value.map(item => resolveValue(item, subjects, context))
	}
	if (value instanceof NamedNode && subjects[value.id]) {
		return subjects[value.id]
	}
	return value
}

function isLiteral(value)
{
	return (
		value instanceof String
		|| value instanceof Number
		|| typeof value == 'boolean'
		|| typeof value == 'string'
		|| typeof value == 'number'
	)
}

export class Context {
	#buildingSubjects = false

	constructor(options)
	{
		const clientPrefixes = options?.prefixes ?? {}
		this.prefixes = {...prefixes, ...clientPrefixes}
		this.prefixOrder = [
			...Object.keys(clientPrefixes),
			...Object.keys(prefixes).filter(prefix => !(prefix in clientPrefixes))
		]
		if (!this.prefixes['xsd']) {
			this.prefixes['xsd'] = 'http://www.w3.org/2001/XMLSchema#'
			this.prefixOrder.push('xsd')
		}
		this.parser = options?.parser
		this.writer = options?.writer
		this.graphs = []
		this.graphsByUrl = Object.create(null)
		this.defaultGraph = options?.defaultGraph ?? null
		this.separator = options?.separator ?? '$'

		Object.defineProperty(this, 'subjects', {
			get() {
				return this.getSubjects()
			}
		})

		Object.defineProperty(this, 'data', {
			get() {
				return Object.values(this.subjects)
			}
		})
	}

	parse(input, url, type)
	{
		const {quads, prefixes} = this.parser(input, url, type)
		if (prefixes) {
			for (let prefix in prefixes) {
				let prefixURL = prefixes[prefix]
				if (prefixURL.match(/^http(s?):\/\/$/i)) {
					prefixURL += url.substring(prefixURL.length)
				} else try {
					prefixURL = new URL(prefixes[prefix], url).href
				} catch(err) {
					console.error('Could not parse prefix', prefixes[prefix], err.message)
				}

				if (!this.prefixes[prefix]) {
					this.prefixes[prefix] = prefixURL
					this.prefixOrder.push(prefix)
				}
			}
		}
		return this.addGraph(new Graph(quads, url, type, prefixes, this))
	}

	addGraph(graph)
	{
		if (!graph?.url) {
			throw new Error('Cannot add graph without a url')
		}

		const existing = this.graphsByUrl[graph.url]
		if (existing) {
			const index = this.graphs.indexOf(existing)
			if (index >= 0) {
				this.graphs[index] = graph
			}
		} else {
			this.graphs.push(graph)
		}
		this.graphsByUrl[graph.url] = graph
		return graph
	}

	graph(url)
	{
		return this.graphsByUrl[this.fullURI(url)]
	}

	set(subject, predicate, value, options={})
	{
		return this.resolveGraph(subject, options).set(subject, predicate, value)
	}

	add(subject, predicate, value, options={})
	{
		return this.resolveGraph(subject, options).add(subject, predicate, value)
	}

	delete(subject, predicate=null, value=undefined, options={})
	{
		const graph = this.resolveGraph(subject, options)
		if (arguments.length < 3) {
			return graph.delete(subject, predicate)
		}
		return graph.delete(subject, predicate, value)
	}

	resolveGraph(subject, options={})
	{
		if (options.graph) {
			return this.getGraphOption(options.graph)
		}

		if (subject instanceof BlankNode && subject.graph instanceof Graph) {
			return subject.graph
		}

		const id = this.subjectID(subject)
		if (id) {
			const exactGraph = this.graphsByUrl[id]
			if (exactGraph) {
				return exactGraph
			}

			const documentGraph = this.graphsByUrl[this.documentURL(id)]
			if (documentGraph) {
				return documentGraph
			}

			const subjectSources = this.graphs.filter(graph => graph.subjects[id])
			if (subjectSources.length == 1) {
				return subjectSources[0]
			}
			if (subjectSources.length > 1) {
				throw new Error(`Cannot choose a source graph for ${id}. Use context.set/add/delete(..., { graph }) or graph.set/add/delete(...) to choose one explicitly.`)
			}
		}

		if (this.defaultGraph) {
			return this.getGraphOption(this.defaultGraph)
		}

		if (this.graphs.length == 1) {
			return this.graphs[0]
		}

		throw new Error('Cannot choose a source graph. Use context.set/add/delete(..., { graph }) or graph.set/add/delete(...) to choose one explicitly.')
	}

	getGraphOption(graph)
	{
		if (graph instanceof Graph) {
			if (!this.graphs.includes(graph)) {
				throw new Error('The selected graph is not part of this context')
			}
			return graph
		}

		const resolved = this.graph(graph)
		if (!resolved) {
			throw new Error(`Unknown graph: ${graph}`)
		}
		return resolved
	}

	documentURL(id)
	{
		try {
			const url = new URL(id)
			url.hash = ''
			return url.href
		} catch(err) {
			return id
		}
	}

	sources(subject, predicate=null, value=undefined)
	{
		if (!subject) {
			return [...this.graphs]
		}

		if (subject instanceof BlankNode && !(subject instanceof NamedNode)) {
			return this.sourcesForBlankNode(subject, predicate, value, arguments.length >= 3)
		}

		const id = this.subjectID(subject)
		if (!id) {
			return []
		}

		return this.graphs.filter(graph => {
			const graphSubject = graph.subjects[id]
			return graphSubject
				&& this.subjectHasSource(graphSubject, predicate, value, arguments.length >= 3)
		})
	}

	sourcesForBlankNode(subject, predicate, value, hasValue)
	{
		const graph = subject.graph
		if (!(graph instanceof Graph)) {
			return []
		}
		if (this.subjectHasSource(subject, predicate, value, hasValue)) {
			return [graph]
		}
		return []
	}

	subjectHasSource(subject, predicate, value, hasValue)
	{
		if (!predicate) {
			return true
		}

		const property = this.propertyName(predicate)
		if (!(property in subject)) {
			return false
		}
		if (!hasValue) {
			return true
		}

		return values(subject[property]).some(item => sameSourceValue(item, value))
	}

	subjectID(subject)
	{
		if (subject?.id) {
			return this.fullURI(subject.id)
		}
		if (typeof subject == 'string') {
			return this.fullURI(subject)
		}
		return null
	}

	propertyName(predicate)
	{
		if (predicate?.id) {
			predicate = predicate.id
		}
		if (predicate == 'a' || predicate == rdfType || this.fullURI(predicate) == rdfType) {
			return 'a'
		}
		return this.shortURI(this.fullURI(predicate))
	}

	get(shortID)
	{
		return this.subjects[this.fullURI(shortID)]
	}

	getSubjects()
	{
		const subjects = Object.create(null)

		this.#buildingSubjects = true
		try {
			for (const graph of this.graphs) {
				for (const id of Object.keys(graph.subjects)) {
					if (!subjects[id]) {
						subjects[id] = this.contextSubject(new NamedNode(id, this))
					}
				}
			}

			for (const graph of this.graphs) {
				for (const [id, subject] of Object.entries(graph.subjects)) {
					this.mergeSubject(subjects[id], subject, subjects)
				}
			}
		} finally {
			this.#buildingSubjects = false
		}

		return subjects
	}

	mergeSubject(target, source, subjects)
	{
		for (const [predicate, value] of Object.entries(source)) {
			if (predicate == 'id') {
				continue
			}
			target[predicate] = mergeValue(
				target[predicate],
				resolveValue(value, subjects, this)
			)
		}
	}

	contextSubject(subject)
	{
		const context = this
		return new Proxy(subject, {
			set(target, property, value, receiver) {
				if (context.#buildingSubjects || typeof property == 'symbol' || property == 'id' || property == 'graph') {
					return Reflect.set(target, property, value, receiver)
				}

				context.set(target.id, property, value)
				context.updateContextProperty(target, property)
				return true
			},

			deleteProperty(target, property) {
				if (context.#buildingSubjects || typeof property == 'symbol' || property == 'id' || property == 'graph') {
					return Reflect.deleteProperty(target, property)
				}

				context.delete(target.id, property)
				context.updateContextProperty(target, property)
				return true
			}
		})
	}

	updateContextProperty(target, property)
	{
		const updated = this.get(target.id)
		if (updated && property in updated) {
			target[property] = updated[property]
		} else {
			delete target[property]
		}
	}

	fullURI(shortURI, separator=null)
	{
		if (!separator) {
			separator = this.separator
		}
		const [prefix, path] = shortURI.split(separator)
		if (path && this.prefixes[prefix]) {
			return this.prefixes[prefix]+path 
		}
		return shortURI
	}

	shortURI(fullURI, separator=null)
	{
		if (!separator) {
			separator = this.separator
		}
		for (const prefix of this.prefixOrder) {
			if (fullURI.startsWith(this.prefixes[prefix])) {
				return prefix + separator + fullURI.substring(this.prefixes[prefix].length)
			}
		}
		return fullURI
	}

	setType(literal, shortType)
	{
		if (!shortType) {
			return literal
		}
		if (typeof literal == 'string') {
			literal = new String(literal)
		} else if (typeof literal == 'number') {
			literal = new Number(literal)
		}
		if (typeof literal !== 'object') {
			throw new Error('cannot set type on ',literal,shortType)
		}
		literal.type = shortType
		return literal
	}

	getType(literal)
	{
		if (literal && typeof literal == 'object') {
			return literal.type
		}
		return null
	}
}

export class Graph
{
	#blankNodes = Object.create(null)

	constructor(quads, url, mimetype, prefixes, context)
	{
		this.mimetype = mimetype
		this.url      = url
		this.prefixes = prefixes
		this.context  = context
		this.subjects = Object.create(null)
		for (let quad of quads) {
			let subject
			if (quad.subject.termType=='BlankNode') {
				let shortPred = this.shortURI(quad.predicate.id,':')
				let shortObj
				switch(shortPred) {
					case 'rdf:first':
						subject = this.addCollection(quad.subject.id)
						shortObj = quad.object.id ? this.shortURI(quad.object.id, ':') : null
						if (shortObj!='rdf:nil') {
							const value = this.getValue(quad.object)
							if (value) {
								subject.push(value)
							}
						}
					continue
					case 'rdf:rest':
						this.#blankNodes[quad.object.id] = this.#blankNodes[quad.subject.id]
					continue
					default:
						subject = this.addBlankNode(quad.subject.id)
					break
				}
			} else {
				subject = this.addNamedNode(quad.subject.id)
			}
			subject.addPredicate(quad.predicate.id, quad.object)
		}
		if (this.subjects[url]) {
			this.primary = this.subjects[url]
		} else {
			this.primary = null
		}
		Object.defineProperty(this, 'data', {
			get() {
				return Object.values(this.subjects)
			}
		})
	}

	addNamedNode(uri)
	{
		// make sure any relative uri subject ids are fully qualified
		let absURI = new URL(uri, this.url).href
		if (!this.subjects[absURI]) {
			this.subjects[absURI] = new NamedNode(absURI, this)
		}
		return this.subjects[absURI]
	}

	addBlankNode(id)
	{
		if (!this.#blankNodes[id]) {
			this.#blankNodes[id] = new BlankNode(this)
		}
		return this.#blankNodes[id]
	}

	addCollection(id)
	{
		if (!this.#blankNodes[id]) {
			this.#blankNodes[id] = new Collection(this)
		}
		return this.#blankNodes[id]
	}

	write()
	{
		return this.context.writer(this)
	}

	get(shortID)
	{
		return this.subjects[this.fullURI(shortID)]
	}

	set(subject, predicate, value)
	{
		const node = this.ensureSubject(subject)
		const property = this.context.propertyName(predicate)

		if (property == 'a') {
			node.a = this.normalizeTypeValues(value)
		} else {
			node[property] = this.normalizeValues(value)
		}
		return node
	}

	add(subject, predicate, value)
	{
		const node = this.ensureSubject(subject)
		const property = this.context.propertyName(predicate)
		const newValue = property == 'a'
			? this.normalizeTypeValues(value)
			: this.normalizeValues(value)

		node[property] = mergeValue(node[property], newValue)
		return node
	}

	delete(subject, predicate=null, value=undefined)
	{
		const node = this.findSubject(subject)
		if (!node) {
			return false
		}

		if (!predicate) {
			if (node.id) {
				delete this.subjects[node.id]
				if (this.primary === node) {
					this.primary = null
				}
			}
			return true
		}

		const property = this.context.propertyName(predicate)
		if (!(property in node)) {
			return false
		}

		if (arguments.length < 3) {
			delete node[property]
			return true
		}

		const deleteValues = property == 'a'
			? values(this.normalizeTypeValues(value))
			: values(this.normalizeValues(value))
		const remaining = values(node[property])
			.filter(item => !deleteValues.some(deleteValue => sameValue(item, deleteValue)))

		if (remaining.length == values(node[property]).length) {
			return false
		}
		if (remaining.length == 0) {
			delete node[property]
		} else if (remaining.length == 1) {
			node[property] = remaining[0]
		} else {
			node[property] = remaining
		}
		return true
	}

	ensureSubject(subject)
	{
		if (subject instanceof BlankNode && !(subject instanceof NamedNode)) {
			if (subject.graph !== this) {
				throw new Error('Cannot write a blank node into a different graph')
			}
			return subject
		}

		if (subject instanceof NamedNode) {
			return this.addNamedNode(subject.id)
		}

		return this.addNamedNode(this.fullURI(subject))
	}

	findSubject(subject)
	{
		if (subject instanceof BlankNode && !(subject instanceof NamedNode)) {
			return subject.graph === this ? subject : null
		}
		const id = subject?.id ? subject.id : this.fullURI(subject)
		return this.subjects[id]
	}

	normalizeValues(value)
	{
		if (Array.isArray(value) && !(value instanceof Collection)) {
			return value.map(item => this.normalizeValue(item))
		}
		return this.normalizeValue(value)
	}

	normalizeValue(value)
	{
		if (value instanceof Collection) {
			const collection = new Collection(this)
			for (const item of value) {
				collection.push(this.normalizeValue(item))
			}
			return collection
		}
		if (value instanceof NamedNode) {
			return this.addNamedNode(value.id)
		}
		if (value instanceof BlankNode) {
			if (value.graph !== this) {
				throw new Error('Cannot write a blank node into a different graph')
			}
			return value
		}
		if (this.looksLikeURI(value)) {
			return this.addNamedNode(this.fullURI(value))
		}
		return value
	}

	normalizeTypeValues(value)
	{
		if (Array.isArray(value) && !(value instanceof Collection)) {
			return value.map(item => this.normalizeTypeValue(item))
		}
		return this.normalizeTypeValue(value)
	}

	normalizeTypeValue(value)
	{
		if (value instanceof NamedNode) {
			return this.shortURI(value.id)
		}
		return this.shortURI(this.fullURI(value))
	}

	looksLikeURI(value)
	{
		if (typeof value != 'string') {
			return false
		}
		if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
			return true
		}
		const [prefix, path] = value.split(this.context.separator)
		return Boolean(path && this.context.prefixes[prefix])
	}

	fullURI(shortURI, separator=null)
	{
		if (!separator) {
			separator = this.context.separator
		}
		const [prefix, path] = shortURI.split(separator)
		if (path) {
			if (this.context.prefixes[prefix]) {
				return this.context.prefixes[prefix]+path
			}
			if (this.prefixes[prefix]) {
				return this.prefixes[prefix]+path
			}
		}
		return shortURI
	}

	shortURI(fullURI, separator=null)
	{
		if (!separator) {
			separator = this.context.separator
		}
		for (const prefix of this.context.prefixOrder) {
			if (fullURI.startsWith(this.context.prefixes[prefix])) {
				return prefix + separator + fullURI.substring(this.context.prefixes[prefix].length)
			}
		}
		if (this.url && fullURI.startsWith(this.url)) {
			return fullURI.substring(this.url.length)
		}
		return fullURI
	}

	/**
	 * This sets the type of a literal, usually one of the xsd types
	 */
	setType(literal, type)
	{
		const shortType = this.shortURI(type)
		return this.context.setType(literal, shortType)
	}

	/**
	 * This returns the type of a literal, or null
	 */
	getType(literal)
	{
		return this.context.getType(literal)
	}

	setLanguage(literal, language)
	{
		if (typeof literal == 'string') {
			literal = new String(literal)
		} else if (typeof literal == 'number') {
			literal = new Number(literal)
		}
		if (typeof literal !== 'object') {
			throw new Error('cannot set language on ',literal)
		}
		literal.language = language
		return literal
	}

	getValue(object)
	{
		let result
		if (object.termType=='Literal') {
			result = object.value
			let datatype = object.datatype?.id
			if (datatype) {
				result = this.setType(result, datatype)
			}
			let language = object.language
			if (language) {
				result = this.setLanguage(result, language)
			}
		} else if (object.termType=='BlankNode') {
			result = this.addBlankNode(object.id)
		} else {
			result = this.addNamedNode(object.id)
		}
		return result
	}


}

export class BlankNode
{

	constructor(graph)
	{
		Object.defineProperty(this, 'graph', {
			value: graph,
			writable: false,
			enumerable: false
		})
	}

	addPredicate(predicate, object)
	{
		if (predicate.id) {
			predicate = predicate.id
		}
		if (predicate==rdfType) {
			let type = this.graph.shortURI(object.id)
			this.addType(type)
		} else {
			const value = this.graph.getValue(object)
			predicate = this.graph.shortURI(predicate)
			if (!this[predicate]) {
				this[predicate] = value
			} else if (Array.isArray(this[predicate])) {
				this[predicate].push(value)
			} else {
				this[predicate] = [ this[predicate], value]
			}
		}
	}

	/**
	 * Adds a rdfType value, stored in this.a
	 * Subjects can have more than one type (or class), unlike literals
	 * The type value can be any URI, xsdTypes are unexpected here
	 */
	addType(type)
	{
		if (!this.a) {
			this.a = type
		} else {
			if (!Array.isArray(this.a)) {
				this.a = [ this.a ]
			}
			this.a.push(type)
		}
	}
}

export class NamedNode extends BlankNode
{
	constructor(id, graph)
	{
		super(graph)
		Object.defineProperty(this, 'id', {
			value: id,
			writable: false,
			enumerable: true
		})
	}
}

export class Collection extends Array
{
	constructor(graph)
	{
		super()
		Object.defineProperty(this, 'graph', {
			value: graph,
			writable: false,
			enumerable: false
		})
	}
}