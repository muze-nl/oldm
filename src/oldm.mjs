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

export class Context {
	constructor(options)
	{
		this.prefixes = {...prefixes, ...options?.prefixes}
		if (!this.prefixes['xsd']) {
			this.prefixes['xsd'] = 'http://www.w3.org/2001/XMLSchema#'
		}
		this.parser = options?.parser
		this.writer = options?.writer
		this.sources = Object.create(null)
//		this.subjects = Object.create(null) // or use a proxy here? should contain all subjects from all sources, merged, readonly
		this.separator = options?.separator ?? '$'
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
		this.sources[url] = new Graph(quads, url, type, prefixes, this)
		return this.sources[url]
	}

	setType(literal, shortType)
	{
		if (!shortType) {
			return literal
		}
		if (typeof literal == 'string') {
			literal = new String(literal)
		} else if (typeof result == 'number') {
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
						shortObj = this.shortURI(quad.object.id, ':')
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
		} else if (typeof result == 'number') {
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
	constructor(id, graph)
	{
		super()
		Object.defineProperty(this, 'graph', {
			value: graph,
			writable: false,
			enumerable: false
		})
	}
}