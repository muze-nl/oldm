import {rdfType, NamedNode, BlankNode, Collection} from '@muze-nl/oldm-core'
import { Parser, Writer, DataFactory } from 'n3'

const solidNamespace = 'http://www.w3.org/ns/solid/terms#'

export const n3Parser = (input, uri, type) => {
	const parser = new Parser({
        baseIRI: uri,
        blankNodePrefix: '',
        format: type
    })
    let prefixes = Object.create(null) // clean object without prototype
    const quads = parser.parse(input, null, (prefix,url) => {
        prefixes[prefix] = url.id
    })
    return { quads, prefixes }
}

/**
 * Loops over all subjects in a source
 * and writes quads using n3.Writer
 * NamedNode objects are also in the subjects list, so
 * only need their object.id in a quad
 * BlankNodes use writer.blank, lists (collection) writer.list
 * blank expects an array of [predicate, object] pairs
 * so only write object blanks, lists and literals, use object.id for the rest
 */
export const n3Writer = (source) => {
	return new Promise((resolve, reject) => {
		const writer = new Writer({
			format: source.mimetype,
			prefixes: {...source.prefixes}
		})
		const xsd = source.prefixes.xsd
		const {quad, namedNode, literal, blankNode} = DataFactory

		const writeClassNames = (id, subject) => {
			let classNames = subject.a
			if (!classNames) {
				return
			}
			if (!Array.isArray(classNames)) {
				classNames = [ classNames ]
			}
			if (classNames?.length) {
				for(let name of classNames) {
					name = source.fullURI(name)
					writer.addQuad(quad(
						namedNode(id),
						namedNode(rdfType),
						namedNode(name)
					))
				}
			}			
		}

		const writeProperties = (id, subject) => {
			if (!subject) {
				return
			}
			let preds = getPredicates(subject)
			for (let pred of preds) {
				if (pred.predicate.id=='id' || pred.predicate.id=='a') {
					/* these are handled explicitly elsewhere */
					continue
				}
				if (!Array.isArray(pred.object)) {
					pred.object = [ pred.object ]
				}
				for (let o of pred.object ) {
					writer.addQuad(quad(
						namedNode(id),
						pred.predicate,
						o
					))
				}
			}
		}

		const getPredicates = (object) => {
			let preds = []
			Object.entries(object).forEach(entry => {
				const predicate = entry[0]
				let object = entry[1]
				const fullPred = source.fullURI(predicate)
				let pred = {
					predicate: namedNode(fullPred)
				}
				if (object instanceof Collection) {
					pred.object = getCollection(object)
				} else if (Array.isArray(object)) {
					pred.object = getArray(object)
				} else if (object instanceof NamedNode) {
					pred.object = namedNode(object.id)
				} else if (object instanceof BlankNode) {
					pred.object = getBlankNode(object)
				} else if (isLiteral(object)) {
					pred.object = getLiteral(object)
				} else {
					console.log('oldm-ns: encountered unknown object', object, predicate)
				}
				preds.push(pred)
			})
			return preds
		}

		const getLiteral = (object) => {
			let type = source.getType(object) || undefined
			if (type) {
				if (type == xsd+source.context.separator+'string' 
					|| type == xsd+source.context.separator+'number') {
					type = undefined
				} else {
					type = source.fullURI(type)
				}
				type = namedNode(type)
			} else {
				let language = object?.language
				if (language) {
					type = language // is automatically detected as language by literal()
				}
			}
			if (object instanceof String) {
				object = ''+object
			} else if (object instanceof Number) {
				object = +object
			}
			return literal(object, type)
		}

		const isLiteral = (value) => {
			return (
				value instanceof String 
				|| value instanceof Number
				|| typeof value == 'boolean' 
				|| typeof value == 'string' 
				|| typeof value == 'number'
			)
		}

		const getCollection = (object) => {
			let list = []
			for (let value of object) {
				if (isLiteral(value)) {
					list.push(getLiteral(value))
				} else if (value.id) {
					list.push(namedNode(value.id))
				} else {
					list.push(getBlankNode(value))
				}
			}
			return writer.list(list)
		}


		const getBlankNode = (object) => {
			return writer.blank(getPredicates(object))
		}

		const getArray = (object) => {
			// array is a list of objects
			// either object.id (named node)
			// literal
			// blank
			// or list
			let list = []
			for (const o of object) {
				if (isLiteral(o)) {
					list.push(getLiteral(o))
				} else if (o instanceof NamedNode) {
					list.push(namedNode(o.id))
				} else if (o instanceof BlankNode) {
					list.push(getBlankNode(o))
				} else if (o instanceof Collection) {
					list.push(getCollection(o))
				}
			}
			return list
		}

		Object.entries(source.subjects).forEach(([id,subject]) => {
			id = source.shortURI(id, ':')
			
			writeClassNames(id, subject)

			writeProperties(id, subject)			
		})

		writer.end((error, result) => {
			if (result) {
				resolve(result)
			} else {
				reject(error)
			}
		})
	})
}

export const n3PatchWriter = async (source) => {
	if (source.originalSource == null) {
		throw new Error('Cannot generate a patch without the original graph source')
	}

	const currentSource = await n3Writer(source)
	const original = n3Parser(source.originalSource, source.url, source.mimetype).quads
	const current = n3Parser(currentSource, source.url, source.mimetype).quads
	const {inserts, deletes} = diffQuads(original, current)

	assertPatchable(inserts, 'insert')
	assertPatchable(deletes, 'delete')

	return serializePatch(source, inserts, deletes)
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
		termKey(quad.object),
		termKey(quad.graph)
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
			term.datatype?.value ?? term.datatype?.id ?? ''
		].join('\u0000')
	}
	return `${term.termType}\u0000${term.value ?? term.id ?? ''}`
}

function assertPatchable(quads, operation)
{
	const hasBlankNode = quads.some(quad =>
		quad.subject.termType == 'BlankNode'
		|| quad.predicate.termType == 'BlankNode'
		|| quad.object.termType == 'BlankNode'
	)
	if (hasBlankNode) {
		throw new Error(`Cannot generate a Solid PATCH with blank nodes in ${operation} changes; use graph.write() and PUT instead`)
	}
}

function serializePatch(source, inserts, deletes)
{
	const prefixes = patchPrefixes(source, inserts, deletes)
	const solidPrefix = findPrefix(solidNamespace, prefixes)
	const writer = new Writer({
		format: 'text/turtle',
		prefixes
	})
	const lines = []
	for (const [prefix, iri] of Object.entries(prefixes)) {
		lines.push(`@prefix ${prefix}: <${iri}> .`)
	}
	if (lines.length) {
		lines.push('')
	}

	const predicates = []
	if (deletes.length) {
		predicates.push(`${solidPrefix}:deletes ${formula(writer, deletes)}`)
	}
	if (inserts.length) {
		predicates.push(`${solidPrefix}:inserts ${formula(writer, inserts)}`)
	}

	let patch = `_:patch a ${solidPrefix}:InsertDeletePatch`
	if (predicates.length) {
		patch += ';\n\t' + predicates.join(';\n\t')
	}
	lines.push(`${patch} .`)

	return lines.join('\n')+"\n"
}

function patchPrefixes(source, inserts, deletes)
{
	const prefixes = {...(source.prefixes ?? {})}
	const contextPrefixes = source.context?.prefixes ?? {}

	ensurePrefix(solidNamespace+'InsertDeletePatch', prefixes, contextPrefixes, 'solid', solidNamespace)
	for (const quad of [...deletes, ...inserts]) {
		ensureTermPrefixes(quad.subject, prefixes, contextPrefixes)
		ensureTermPrefixes(quad.predicate, prefixes, contextPrefixes)
		ensureTermPrefixes(quad.object, prefixes, contextPrefixes)
	}
	return prefixes
}

function ensureTermPrefixes(term, prefixes, contextPrefixes)
{
	if (term.termType == 'NamedNode') {
		ensurePrefix(term.value ?? term.id, prefixes, contextPrefixes)
	}
	if (term.termType == 'Literal') {
		const datatype = term.datatype?.value ?? term.datatype?.id
		if (datatype && datatype != 'http://www.w3.org/2001/XMLSchema#string') {
			ensurePrefix(datatype, prefixes, contextPrefixes)
		}
	}
}

function ensurePrefix(iri, prefixes, contextPrefixes, fallbackPrefix=null, fallbackIRI=null)
{
	if (findPrefix(iri, prefixes) != null) {
		return
	}

	for (const [prefix, namespace] of Object.entries(contextPrefixes)) {
		if (iri.startsWith(namespace)) {
			prefixes[availablePrefix(prefix, prefixes)] = namespace
			return
		}
	}

	if (fallbackPrefix && fallbackIRI) {
		prefixes[availablePrefix(fallbackPrefix, prefixes)] = fallbackIRI
	}
}

function availablePrefix(prefix, prefixes)
{
	if (!(prefix in prefixes)) {
		return prefix
	}
	let index = 2
	while (`${prefix}${index}` in prefixes) {
		index++
	}
	return `${prefix}${index}`
}

function findPrefix(iri, prefixes)
{
	for (const [prefix, namespace] of Object.entries(prefixes)) {
		if (iri.startsWith(namespace)) {
			return prefix
		}
	}
	return null
}

function formula(writer, quads)
{
	if (!quads.length) {
		return '{}'
	}
	const lines = quads.map(quad => `\n\t\t${writer.quadToString(quad.subject, quad.predicate, quad.object).trim()}`)
	return `{${lines.join('')}\n\t}`
}
