import {
	assert as assertValue,
	error,
	fails as assertFails
} from '@muze-nl/assert'
import {
	BlankNode,
	Collection,
	Graph,
	NamedNode
} from '@muze-nl/oldm-core'

const metadata = Symbol.for('@muze-labs/oldm-shape.metadata')

let blankNodeId = 0

/**
 * Defines a JavaScript object shape that can validate application data and map
 * it to and from OLDM objects.
 *
 * The optional type is written to and checked against the RDF type property `a`.
 */
export function shape(type, fields, options={})
{
	if (arguments.length == 1 || isPlainObject(type)) {
		options = fields ?? {}
		fields = type
		type = null
	}
	if (!isPlainObject(fields)) {
		throw new Error('shape() expects a field definition object')
	}

	const fieldEntries = Object.entries(fields)
	const idEntry = fieldEntries.find(([, pattern]) => rootMeta(pattern)?.kind == 'id')
	const info = {
		kind: 'shape',
		type,
		fields,
		options
	}

	function _shape(data, root, path='') {
		return validateShape(data, info, root ?? data, path, { extra: 'ignore' })
	}

	Object.defineProperty(_shape, metadata, {
		value: info,
		enumerable: false
	})

	_shape.type = type
	_shape.fields = fields
	_shape.fails = (data, validateOptions={}) => validateShape(data, info, data, '', validateOptions)
	_shape.validate = (data, validateOptions={}) => !_shape.fails(data, validateOptions)
	_shape.assert = (data, validateOptions={}) => {
		const problems = _shape.fails(data, validateOptions)
		if (problems) {
			throw shapeError('OLDM shape validation failed', problems, data)
		}
		return data
	}
	_shape.toOldm = (data, graph, convertOptions={}) => toOldm(info, data, graph, convertOptions, idEntry)
	_shape.fromOldm = (subject, convertOptions={}) => fromOldm(info, subject, convertOptions)

	return _shape
}

/**
 * Maps a friendly JavaScript property to an OLDM predicate property.
 */
export function field(predicate, pattern)
{
	if (!predicate) {
		throw new Error('field() expects an OLDM predicate such as vcard$fn')
	}
	function _field(data, root, path) {
		return assertFails(data, pattern, root, path)
	}
	return withMeta(_field, {
		kind: 'field',
		predicate,
		pattern
	})
}

/**
 * Marks the field that maps to the subject id.
 */
export function id(pattern=String)
{
	function _id(data, root, path) {
		return assertFails(data, pattern, root, path)
	}
	return withMeta(_id, {
		kind: 'id',
		pattern
	})
}

/**
 * Maps a JavaScript string to an OLDM NamedNode.
 */
export function uri(pattern=looksLikeURI)
{
	function _uri(data, root, path) {
		const problems = []
		if (typeof data != 'string' && !(data instanceof String) && !(data instanceof URL)) {
			problems.push(error('data is not a string, URL, or short URI', data, 'uri', path))
			return problems
		}
		const value = data instanceof URL ? data.href : String(data)
		const result = assertFails(value, pattern, root, path)
		return result || false
	}
	return withMeta(_uri, {
		kind: 'uri',
		pattern
	})
}

/**
 * Maps a JavaScript literal value to an OLDM typed literal.
 */
export function typed(datatype, pattern=String)
{
	if (!datatype) {
		throw new Error('typed() expects a datatype such as xsd$date')
	}
	function _typed(data, root, path) {
		return assertFails(data, pattern, root, path)
	}
	return withMeta(_typed, {
		kind: 'typed',
		datatype,
		pattern
	})
}

/**
 * Maps a nested JavaScript object to a nested OLDM node.
 */
export function node(nodeShape)
{
	if (isPlainObject(nodeShape)) {
		nodeShape = shape(nodeShape)
	}
	if (!isShape(nodeShape)) {
		throw new Error('node() expects a shape or field definition object')
	}
	function _node(data, root, path) {
		return nodeShape(data, root, path)
	}
	return withMeta(_node, {
		kind: 'node',
		shape: nodeShape
	})
}

/**
 * Maps a JavaScript array to an RDF collection value.
 */
export function collection(pattern)
{
	function _collection(data, root, path) {
		if (!Array.isArray(data)) {
			return error('data is not an array', data, 'collection', path)
		}
		return assertFails(data, [pattern], root, path)
	}
	return withMeta(_collection, {
		kind: 'collection',
		pattern
	})
}

/**
 * Tests the wrapped pattern only when the value is not null or undefined.
 *
 * This mirrors @muze-nl/assert Optional(), but preserves OLDM mapping metadata.
 */
export function Optional(pattern)
{
	function _Optional(data, root, path) {
		if (data != null && typeof data != 'undefined' && typeof pattern != 'undefined') {
			return assertFails(data, pattern, root, path)
		}
	}
	return withWrapperMeta(_Optional, pattern, { optional: true })
}

/**
 * Tests the wrapped pattern and fails when the value is null or undefined.
 *
 * This mirrors @muze-nl/assert Required(), but preserves OLDM mapping metadata.
 */
export function Required(pattern)
{
	function _Required(data, root, path) {
		if (data == null || typeof data == 'undefined') {
			return error('data is required', data, pattern || 'any value', path)
		}
		if (typeof pattern != 'undefined') {
			return assertFails(data, pattern, root, path)
		}
		return false
	}
	return withWrapperMeta(_Required, pattern, { required: true })
}

export function isShape(value)
{
	return rootMeta(value)?.kind == 'shape'
}

export function isDescriptor(value)
{
	return Boolean(rootMeta(value))
}

function validateShape(data, info, root, path='', options={})
{
	const problems = []
	if (!data || typeof data != 'object' || Array.isArray(data)) {
		problems.push(error('data is not an object', data, 'shape', path))
		return problems
	}

	for (const [key, pattern] of Object.entries(info.fields)) {
		const result = assertFails(data[key], pattern, root, appendPath(path, key))
		if (result) {
			problems.push(...asProblems(result))
		}
	}

	if (options.extra == 'error') {
		for (const key of Object.keys(data)) {
			if (!(key in info.fields)) {
				problems.push(error('data contains a field that is not defined by this shape', data[key], 'no extra fields', appendPath(path, key)))
			}
		}
	}

	return problems.length ? problems : false
}

function toOldm(info, data, graph, options={}, idEntry)
{
	if (!(graph instanceof Graph)) {
		throw new Error('toOldm() expects an OLDM Graph as its second argument')
	}

	const extra = options.extra ?? 'error'
	const problems = validateShape(data, info, data, '', { extra })
	if (problems) {
		throw shapeError('OLDM shape validation failed', problems, data)
	}

	const prefixProblems = validatePrefixUse(info, data, graph)
	if (prefixProblems) {
		throw shapeError('OLDM shape prefix validation failed', prefixProblems, data)
	}

	const subject = createSubject(info, data, graph, idEntry)

	if (info.type) {
		graph.set(subject, 'a', info.type)
	}

	for (const [key, pattern] of Object.entries(info.fields)) {
		const meta = mappingMeta(pattern)
		if (!meta || meta.kind == 'id') {
			continue
		}

		const hasValue = Object.hasOwn(data, key) && data[key] != null
		if (!hasValue) {
			if (options.clearMissing && meta.predicate) {
				graph.delete(subject, meta.predicate)
			}
			continue
		}

		const value = valueToOldm(meta.pattern, data[key], graph, options, key)
		graph.set(subject, meta.predicate, value)
	}

	return subject
}

function fromOldm(info, subject, options={})
{
	if (!subject || typeof subject != 'object') {
		throw new Error('fromOldm() expects an OLDM subject object')
	}
	if (info.type && options.requireType !== false && !hasType(subject, info.type)) {
		const problems = [error('subject does not have the expected RDF type', subject.a, info.type, 'a')]
		throw shapeError('OLDM shape conversion failed', problems, subject)
	}

	const data = {}
	const problems = []

	for (const [key, pattern] of Object.entries(info.fields)) {
		const meta = mappingMeta(pattern)
		if (!meta) {
			continue
		}

		if (meta.kind == 'id') {
			if (subject.id) {
				data[key] = subject.id
			}
			continue
		}

		const value = subject[meta.predicate]
		if (value == null) {
			continue
		}

		try {
			data[key] = valueFromOldm(meta.pattern, value, options, key)
		} catch(err) {
			problems.push(error(err.message, value, meta.pattern, key))
		}
	}

	const validation = validateShape(data, info, data, '', { extra: 'ignore' })
	if (validation) {
		problems.push(...validation)
	}
	if (problems.length) {
		throw shapeError('OLDM shape conversion failed', problems, subject)
	}

	return data
}


function validatePrefixUse(info, data, graph)
{
	const problems = []
	validatePatternPrefixes(info, graph, 'shape', problems)
	validateDataPrefixes(info, data, graph, '', problems)
	return problems.length ? problems : false
}

function validatePatternPrefixes(info, graph, path, problems)
{
	if (info.type) {
		checkShortURIPrefix(info.type, graph, `${path}.type`, problems)
	}
	for (const [key, pattern] of Object.entries(info.fields)) {
		checkPatternPrefixes(pattern, graph, appendPath(path, key), problems)
	}
}

function checkPatternPrefixes(pattern, graph, path, problems)
{
	const meta = rootMeta(pattern)
	if (meta?.kind == 'optional' || meta?.kind == 'required') {
		checkPatternPrefixes(meta.pattern, graph, path, problems)
		return
	}
	if (meta?.kind == 'field') {
		checkShortURIPrefix(meta.predicate, graph, `${path}.predicate`, problems)
		checkPatternPrefixes(meta.pattern, graph, path, problems)
		return
	}
	if (meta?.kind == 'id') {
		checkPatternPrefixes(meta.pattern, graph, path, problems)
		return
	}
	if (meta?.kind == 'typed') {
		checkShortURIPrefix(meta.datatype, graph, `${path}.datatype`, problems)
		checkPatternPrefixes(meta.pattern, graph, path, problems)
		return
	}
	if (meta?.kind == 'node') {
		const shapeInfo = rootMeta(meta.shape)
		if (shapeInfo) {
			validatePatternPrefixes(shapeInfo, graph, path, problems)
		}
		return
	}
	if (meta?.kind == 'collection') {
		checkPatternPrefixes(meta.pattern, graph, path, problems)
		return
	}
	if (Array.isArray(pattern) && pattern.length == 1) {
		checkPatternPrefixes(pattern[0], graph, `${path}[]`, problems)
	}
}

function validateDataPrefixes(info, data, graph, path, problems)
{
	for (const [key, pattern] of Object.entries(info.fields)) {
		const meta = mappingMeta(pattern)
		if (!meta) {
			continue
		}

		const value = data?.[key]
		if (value == null) {
			continue
		}

		const valuePath = appendPath(path, key)
		if (meta.kind == 'id') {
			checkShortURIPrefix(value, graph, valuePath, problems)
		}
		checkValuePrefixes(meta.pattern, value, graph, valuePath, problems)
	}

	if (info.options?.id && data?.[info.options.id]) {
		checkShortURIPrefix(data[info.options.id], graph, info.options.id, problems)
	}
}

function checkValuePrefixes(pattern, value, graph, path, problems)
{
	const meta = rootMeta(pattern)
	if (meta?.kind == 'optional' || meta?.kind == 'required') {
		checkValuePrefixes(meta.pattern, value, graph, path, problems)
		return
	}
	if (meta?.kind == 'uri') {
		checkShortURIPrefix(value, graph, path, problems)
		return
	}
	if (meta?.kind == 'typed') {
		return
	}
	if (meta?.kind == 'node') {
		const shapeInfo = rootMeta(meta.shape)
		if (shapeInfo) {
			validateDataPrefixes(shapeInfo, value, graph, path, problems)
		}
		return
	}
	if (meta?.kind == 'collection') {
		if (!Array.isArray(value)) {
			return
		}
		for (const [index, item] of value.entries()) {
			checkValuePrefixes(meta.pattern, item, graph, `${path}[${index}]`, problems)
		}
		return
	}
	if (Array.isArray(pattern) && pattern.length == 1 && Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			checkValuePrefixes(pattern[0], item, graph, `${path}[${index}]`, problems)
		}
	}
}

function checkShortURIPrefix(value, graph, path, problems)
{
	const shortURI = shortURIInfo(value, graph)
	if (!shortURI || hasKnownPrefix(shortURI.prefix, graph)) {
		return
	}
	problems.push(error(
		`unknown OLDM prefix "${shortURI.prefix}"`,
		String(value),
		'known OLDM prefix',
		path
	))
}

function shortURIInfo(value, graph)
{
	if (value instanceof URL) {
		return null
	}
	if (value instanceof NamedNode) {
		return null
	}
	if (typeof value != 'string' && !(value instanceof String)) {
		return null
	}
	const text = String(value)
	if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
		return null
	}
	const separator = graph?.context?.separator ?? '$'
	const index = text.indexOf(separator)
	if (index <= 0 || index == text.length - separator.length) {
		return null
	}
	return {
		prefix: text.slice(0, index),
		path: text.slice(index + separator.length)
	}
}

function hasKnownPrefix(prefix, graph)
{
	return Boolean(
		graph?.context?.prefixes?.[prefix]
		|| graph?.prefixes?.[prefix]
	)
}

function createSubject(info, data, graph, idEntry)
{
	if (idEntry) {
		const [key] = idEntry
		if (data[key]) {
			return graph.ensureSubject(data[key])
		}
	}
	if (info.options?.id && data[info.options.id]) {
		return graph.ensureSubject(data[info.options.id])
	}
	return graph.addBlankNode(`oldm-shape-${++blankNodeId}`)
}

function valueToOldm(pattern, value, graph, options, path)
{
	const meta = rootMeta(pattern)
	if (meta?.kind == 'optional' || meta?.kind == 'required') {
		return valueToOldm(meta.pattern, value, graph, options, path)
	}
	if (meta?.kind == 'uri') {
		return value instanceof URL ? value.href : String(value)
	}
	if (meta?.kind == 'typed') {
		return graph.setType(value, meta.datatype)
	}
	if (meta?.kind == 'node') {
		return meta.shape.toOldm(value, graph, {
			...options,
			extra: options.extraNested ?? 'error'
		})
	}
	if (meta?.kind == 'collection') {
		const result = new Collection(graph)
		for (const [index, item] of value.entries()) {
			result.push(valueToOldm(meta.pattern, item, graph, options, `${path}[${index}]`))
		}
		return result
	}
	if (Array.isArray(pattern)) {
		if (pattern.length != 1) {
			throw new Error('OLDM shape array mappings need exactly one item pattern')
		}
		return value.map((item, index) => valueToOldm(pattern[0], item, graph, options, `${path}[${index}]`))
	}
	if (isShape(pattern)) {
		throw new Error('Use node(shape) for nested OLDM object mappings')
	}
	return value
}

function valueFromOldm(pattern, value, options, path)
{
	const meta = rootMeta(pattern)
	if (meta?.kind == 'optional' || meta?.kind == 'required') {
		return valueFromOldm(meta.pattern, value, options, path)
	}
	if (meta?.kind == 'uri') {
		return namedNodeID(value)
	}
	if (meta?.kind == 'typed') {
		return literalValue(value)
	}
	if (meta?.kind == 'node') {
		return meta.shape.fromOldm(value, options)
	}
	if (meta?.kind == 'collection') {
		if (!(value instanceof Collection) && !Array.isArray(value)) {
			throw new Error('expected an RDF collection value')
		}
		return [...value].map((item, index) => valueFromOldm(meta.pattern, item, options, `${path}[${index}]`))
	}
	if (Array.isArray(pattern)) {
		if (pattern.length != 1) {
			throw new Error('OLDM shape array mappings need exactly one item pattern')
		}
		return manyOldm(value).map((item, index) => valueFromOldm(pattern[0], item, options, `${path}[${index}]`))
	}
	if (Array.isArray(value) && !(value instanceof Collection)) {
		throw new Error('expected one value but found multiple values')
	}
	return literalValue(value)
}

function mappingMeta(pattern)
{
	const meta = rootMeta(pattern)
	if (!meta) {
		return null
	}
	if (meta.kind == 'field') {
		return meta
	}
	if ((meta.kind == 'optional' || meta.kind == 'required') && rootMeta(meta.pattern)?.kind == 'field') {
		return {
			...rootMeta(meta.pattern),
			optional: meta.optional,
			required: meta.required
		}
	}
	if (meta.kind == 'id') {
		return meta
	}
	if ((meta.kind == 'optional' || meta.kind == 'required') && rootMeta(meta.pattern)?.kind == 'id') {
		return rootMeta(meta.pattern)
	}
	return null
}

function rootMeta(value)
{
	return value?.[metadata] ?? null
}

function withMeta(fn, meta)
{
	Object.defineProperty(fn, metadata, {
		value: meta,
		enumerable: false
	})
	return fn
}

function withWrapperMeta(fn, pattern, extras)
{
	const child = rootMeta(pattern)
	return withMeta(fn, {
		kind: extras.optional ? 'optional' : 'required',
		pattern,
		...extras,
		child
	})
}

function hasType(subject, type)
{
	if (!type) {
		return true
	}
	const types = manyOldm(subject.a)
	return types.some(item => item == type || item?.id == type)
}

function namedNodeID(value)
{
	if (value instanceof NamedNode || value?.id) {
		return value.id
	}
	return String(value)
}

function literalValue(value)
{
	if (value instanceof String || value instanceof Number || value instanceof Boolean) {
		return value.valueOf()
	}
	return value
}

function manyOldm(value)
{
	if (Array.isArray(value) && !(value instanceof Collection)) {
		return value
	}
	if (value == null) {
		return []
	}
	return [value]
}

function asProblems(result)
{
	return Array.isArray(result) ? result : [result]
}

function appendPath(path, key)
{
	return path ? `${path}.${key}` : key
}

function shapeError(message, problems, source)
{
	return new Error(message, {
		cause: {
			problems,
			source
		}
	})
}

function looksLikeURI(data, root, path)
{
	if (typeof data != 'string' && !(data instanceof String) && !(data instanceof URL)) {
		return error('data is not a URI string', data, 'uri', path)
	}
	const value = data instanceof URL ? data.href : String(data)
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
		return false
	}
	if (/^[a-z][a-z0-9_-]*\$.+$/i.test(value)) {
		return false
	}
	return error('data does not look like an absolute or short URI', data, 'uri', path)
}

function isPlainObject(value)
{
	return Boolean(value) && typeof value == 'object' && value.constructor == Object
}

export default {
	shape,
	field,
	id,
	uri,
	typed,
	node,
	collection,
	Optional,
	Required,
	isShape,
	isDescriptor,
	assert: assertValue
}
