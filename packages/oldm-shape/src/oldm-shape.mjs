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
	const idEntry = fieldEntries.find(([, pattern]) => mappingMeta(pattern)?.kind == 'id')
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
	_shape.describe = () => describe(_shape)
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


/**
 * Returns a plain descriptor for a shape or pattern.
 *
 * The descriptor is intentionally data-only. It exposes the mapping metadata
 * that converters, form generators, and schema exporters need without making
 * them depend on the private metadata symbol used internally by oldm-shape.
 */
export function describe(value)
{
	const descriptor = describePattern(value, { seen: new Map() })
	if (!descriptor) {
		throw new Error('describe() expects an oldm-shape shape or pattern')
	}
	return descriptor
}


function describeShape(info, ctx)
{
	if (ctx.seen.has(info)) {
		return {
			kind: 'shape-ref',
			type: info.type ?? null
		}
	}

	ctx.seen.set(info, true)
	const fields = {}
	for (const [key, pattern] of Object.entries(info.fields)) {
		fields[key] = describeShapeField(key, pattern, ctx)
	}
	ctx.seen.delete(info)

	const descriptor = {
		kind: 'shape',
		type: info.type ?? null,
		fields,
		options: describeOptions(info.options)
	}
	descriptor.portable = fieldsPortable(fields)
	return descriptor
}

function describeShapeField(key, pattern, ctx)
{
	const presence = describePresence(pattern)
	const unwrapped = unwrapWrappers(pattern)
	const meta = rootMeta(unwrapped)

	if (meta?.kind == 'field') {
		const value = describePattern(meta.pattern, ctx)
		return withPortable({
			kind: 'field',
			key,
			predicate: meta.predicate,
			required: presence.required,
			optional: presence.optional,
			cardinality: cardinalityFor(value, presence),
			value
		})
	}

	if (meta?.kind == 'id') {
		const value = describePattern(meta.pattern, ctx)
		return withPortable({
			kind: 'id',
			key,
			required: presence.required,
			optional: presence.optional,
			cardinality: cardinalityFor(value, presence),
			value
		})
	}

	const value = describePattern(pattern, ctx)
	return withPortable({
		kind: 'validator',
		key,
		required: presence.required,
		optional: presence.optional,
		cardinality: cardinalityFor(value, presence),
		mapped: false,
		value
	})
}

const metaDescriptorRegistry = new Map()
const patternDescriptorRegistry = []

function registerMetaDescriptor(kind, handler)
{
	metaDescriptorRegistry.set(kind, handler)
}

function registerPatternDescriptor(test, handler)
{
	patternDescriptorRegistry.push({ test, handler })
}

registerMetaDescriptor('shape', (pattern, meta, ctx) => describeShape(meta, ctx))

registerMetaDescriptor('optional', describeWrapperPattern)
registerMetaDescriptor('required', describeWrapperPattern)

registerMetaDescriptor('field', (pattern, meta, ctx) => withPortable({
	kind: 'field-pattern',
	predicate: meta.predicate,
	value: describePattern(meta.pattern, ctx)
}))

registerMetaDescriptor('id', (pattern, meta, ctx) => withPortable({
	kind: 'id-pattern',
	value: describePattern(meta.pattern, ctx)
}))

registerMetaDescriptor('uri', (pattern, meta, ctx) => {
	const descriptor = {
		kind: 'uri'
	}
	if (meta.pattern && meta.pattern !== looksLikeURI) {
		descriptor.value = describePattern(meta.pattern, ctx)
	}
	return withPortable(descriptor)
})

registerMetaDescriptor('typed', (pattern, meta, ctx) => withPortable({
	kind: 'typed',
	datatype: meta.datatype,
	value: describePattern(meta.pattern, ctx)
}))

registerMetaDescriptor('node', (pattern, meta, ctx) => withPortable({
	kind: 'node',
	shape: describePattern(meta.shape, ctx)
}))

registerMetaDescriptor('collection', (pattern, meta, ctx) => withPortable({
	kind: 'collection',
	ordered: true,
	item: describePattern(meta.pattern, ctx)
}))

registerPatternDescriptor(Array.isArray, describeArrayPattern)
registerPatternDescriptor(pattern => pattern === String, () => literalDescriptor('string'))
registerPatternDescriptor(pattern => pattern === Number, () => literalDescriptor('number'))
registerPatternDescriptor(pattern => pattern === Boolean, () => literalDescriptor('boolean'))
registerPatternDescriptor(pattern => pattern instanceof RegExp, describeRegExpPattern)
registerPatternDescriptor(isPlainObject, describeObjectPattern)
registerPatternDescriptor(pattern => typeof pattern == 'function', describeFunctionPattern)
registerPatternDescriptor(pattern => pattern == null || isJSONValue(pattern), describeConstantPattern)

function describePattern(pattern, ctx)
{
	const meta = rootMeta(pattern)
	if (meta) {
		const handler = metaDescriptorRegistry.get(meta.kind)
		if (handler) {
			return handler(pattern, meta, ctx)
		}
	}

	for (const { test, handler } of patternDescriptorRegistry) {
		if (test(pattern)) {
			return handler(pattern, ctx)
		}
	}

	return {
		kind: 'unknown',
		name: Object.prototype.toString.call(pattern),
		portable: false
	}
}

function describeWrapperPattern(pattern, meta, ctx)
{
	return withPortable({
		kind: meta.kind,
		value: describePattern(meta.pattern, ctx)
	})
}

function describeArrayPattern(pattern, ctx)
{
	if (pattern.length == 1) {
		return withPortable({
			kind: 'array',
			item: describePattern(pattern[0], ctx)
		})
	}
	return {
		kind: 'tuple',
		items: pattern.map(item => describePattern(item, ctx)),
		portable: false
	}
}

function literalDescriptor(type)
{
	return {
		kind: 'literal',
		type,
		portable: true
	}
}

function describeRegExpPattern(pattern)
{
	return {
		kind: 'regexp',
		source: pattern.source,
		flags: pattern.flags,
		portable: true
	}
}

function describeObjectPattern(pattern, ctx)
{
	const fields = {}
	for (const [key, value] of Object.entries(pattern)) {
		fields[key] = describePattern(value, ctx)
	}
	return {
		kind: 'object',
		fields,
		portable: fieldsPortable(fields)
	}
}

function describeFunctionPattern(pattern)
{
	return {
		kind: 'custom',
		name: pattern.name || null,
		portable: false
	}
}

function describeConstantPattern(pattern)
{
	return {
		kind: 'constant',
		value: pattern,
		portable: true
	}
}

function describePresence(pattern)
{
	const meta = rootMeta(pattern)
	if (meta?.kind == 'optional') {
		return {
			optional: true,
			required: false,
			explicit: true
		}
	}
	if (meta?.kind == 'required') {
		return {
			optional: false,
			required: true,
			explicit: true
		}
	}
	return {
		optional: false,
		required: true,
		explicit: false
	}
}

function unwrapWrappers(pattern)
{
	let result = pattern
	let meta = rootMeta(result)
	while (meta?.kind == 'optional' || meta?.kind == 'required') {
		result = meta.pattern
		meta = rootMeta(result)
	}
	return result
}

function cardinalityFor(value, presence)
{
	return {
		min: presence.required ? 1 : 0,
		max: value?.kind == 'array' || value?.kind == 'collection' ? null : 1
	}
}

function withPortable(descriptor)
{
	descriptor.portable = descriptorPortable(descriptor)
	return descriptor
}

function descriptorPortable(descriptor)
{
	if (!descriptor) {
		return false
	}
	if (descriptor.portable === false) {
		return false
	}
	if (descriptor.value && descriptor.value.portable === false) {
		return false
	}
	if (descriptor.item && descriptor.item.portable === false) {
		return false
	}
	if (descriptor.shape && descriptor.shape.portable === false) {
		return false
	}
	if (descriptor.fields && !fieldsPortable(descriptor.fields)) {
		return false
	}
	return true
}

function fieldsPortable(fields)
{
	return Object.values(fields).every(field => descriptorPortable(field))
}

function describeOptions(options)
{
	if (!options || !Object.keys(options).length) {
		return {}
	}
	return describeOptionValue(options)
}

function describeOptionValue(value)
{
	if (Array.isArray(value)) {
		return value.map(describeOptionValue)
	}
	if (isPlainObject(value)) {
		const result = {}
		for (const [key, item] of Object.entries(value)) {
			result[key] = describeOptionValue(item)
		}
		return result
	}
	if (isJSONValue(value)) {
		return value
	}
	if (typeof value == 'function') {
		return {
			kind: 'function',
			name: value.name || null,
			portable: false
		}
	}
	return {
		kind: 'value',
		name: Object.prototype.toString.call(value),
		portable: false
	}
}

function isJSONValue(value)
{
	return value === null || ['string', 'number', 'boolean'].includes(typeof value)
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
	describe,
	isShape,
	isDescriptor,
	assert: assertValue
}
