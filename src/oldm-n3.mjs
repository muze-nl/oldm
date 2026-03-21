import {rdfType, NamedNode, BlankNode, Collection} from './oldm.mjs'
import n3 from 'n3'

export const n3Parser = (input, uri, type) => {
	const parser = new n3.Parser({
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
		const writer = new n3.Writer({
			format: source.type,
			prefixes: {...source.prefixes}
		})
		const xsd = source.prefixes.xsd
		const {quad, namedNode, literal, blankNode} = n3.DataFactory

		const writeClassNames = (id, subject) => {
			let classNames = subject.a
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

		const getArray = (id, object) => {
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
