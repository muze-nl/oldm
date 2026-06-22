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
	if (isLiteral(left) && isLiteral(right)) {
		return String(left) == String(right)
			&& left?.type == right?.type
			&& left?.language == right?.language
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
	constructor(options)
	{
		this.prefixes = {...prefixes, ...options?.prefixes} //FIXME: don't add the same url with different prefixes
		if (!this.prefixes['xsd']) { //FIXME: don't assume the xsd url always has the 'xsd' prefix
			this.prefixes['xsd'] = 'http://www.w3.org/2001/XMLSchema#'
		}
		this.parser = options?.parser
		this.writer = options?.writer
		this.sources = Object.create(null)
		this.graphs = []
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

		const existing = this.sources[graph.url]
		if (existing) {
			const index = this.graphs.indexOf(existing)
			if (index >= 0) {
				this.graphs[index] = graph
			}
		} else {
			this.graphs.push(graph)
		}
		this.sources[graph.url] = graph
		return graph
	}

	get(shortID)
	{
		return this.subjects[this.fullURI(shortID)]
	}

	getSubjects()
	{
		const subjects = Object.create(null)

		for (const graph of this.graphs) {
			for (const id of Object.keys(graph.subjects)) {
				if (!subjects[id]) {
					subjects[id] = new NamedNode(id, this)
				}
			}
		}

		for (const graph of this.graphs) {
			for (const [id, subject] of Object.entries(graph.subjects)) {
				this.mergeSubject(subjects[id], subject, subjects)
			}
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
		for (let prefix in this.prefixes) {
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

	fullURI(shortURI, separator=null)
	{
		if (!separator) {
			separator = this.context.separator
		}
		const [prefix, path] = shortURI.split(separator)
		if (path) {
			return this.prefixes[prefix]+path 
		}
		return shortURI
	}

	shortURI(fullURI, separator=null)
	{
		if (!separator) {
			separator = this.context.separator
		}
		for (let prefix in this.context.prefixes) {
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