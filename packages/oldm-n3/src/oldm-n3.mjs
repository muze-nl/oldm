import {rdfType, NamedNode, BlankNode, Collection} from '@muze-nl/oldm-core'
import { Parser, Writer, DataFactory } from 'n3'

const solidNamespace = 'http://www.w3.org/ns/solid/terms#'
const rdfNamespace = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

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
			prefixes: source.prefixDeclarations('source')
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
	const patch = solidPatchChanges(original, current, {
		quad: DataFactory.quad,
		variable: DataFactory.variable,
		blankNode: DataFactory.blankNode
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
	return quads.map(quad => createQuad(mapTerm(quad.subject), quad.predicate, mapTerm(quad.object), quad.graph))
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
	return term?.value ?? term?.id ?? ''
}

function serializePatch(source, inserts, deletes, where=[])
{
	const prefixes = {
		...source.prefixDeclarations('source')
	}
	if (quadsUseNamespace([...where, ...deletes, ...inserts], rdfNamespace)) {
		prefixes.rdf ??= rdfNamespace
	}
	prefixes.solid = solidNamespace
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
	if (where.length) {
		predicates.push(`solid:where ${formula(writer, where)}`)
	}
	if (deletes.length) {
		predicates.push(`solid:deletes ${formula(writer, deletes)}`)
	}
	if (inserts.length) {
		predicates.push(`solid:inserts ${formula(writer, inserts)}`)
	}

	let patch = `_:patch a solid:InsertDeletePatch`
	if (predicates.length) {
		patch += ';\n\t' + predicates.join(';\n\t')
	}
	lines.push(`${patch} .`)

	return lines.join('\n')+"\n"
}

function quadsUseNamespace(quads, namespace)
{
	return quads.some(quad =>
		termUsesNamespace(quad.subject, namespace)
		|| termUsesNamespace(quad.predicate, namespace)
		|| termUsesNamespace(quad.object, namespace)
	)
}

function termUsesNamespace(term, namespace)
{
	return term?.termType == 'NamedNode' && termValue(term).startsWith(namespace)
}

function formula(writer, quads)
{
	if (!quads.length) {
		return '{}'
	}
	const lines = quads.map(quad => `\n\t\t${writer.quadToString(quad.subject, quad.predicate, quad.object).trim()}`)
	return `{${lines.join('')}\n\t}`
}
