// RFC 3987 characters, with percent escapes kept verbatim.
const ucschar = '\\u00A0-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF\\u{10000}-\\u{1FFFD}\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}\\u{40000}-\\u{4FFFD}\\u{50000}-\\u{5FFFD}\\u{60000}-\\u{6FFFD}\\u{70000}-\\u{7FFFD}\\u{80000}-\\u{8FFFD}\\u{90000}-\\u{9FFFD}\\u{A0000}-\\u{AFFFD}\\u{B0000}-\\u{BFFFD}\\u{C0000}-\\u{CFFFD}\\u{D0000}-\\u{DFFFD}\\u{E1000}-\\u{EFFFD}'
const iprivate = '\\uE000-\\uF8FF\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}'
const nameChars = `a-zA-Z0-9._~!$&'()*+,;=\\-${ucschar}`
const component = extra => new RegExp(`^(?:[${nameChars}${extra}]|%[0-9a-fA-F]{2})*$`, 'u')
const pathPattern = component(':@/')
const queryPattern = component(':@/?'+iprivate)
const fragmentPattern = component(':@/?')
const userPattern = component(':')
const hostPattern = component('')

function parts(value, requireAbsolute=false) {
	if (typeof value != 'string') throw new TypeError('Expected an IRI string')
	if (/[\u0000-\u0020\u007F-\u009F]/.test(value)) throw new TypeError(`Invalid IRI: ${value}`)
	const match = /^(?:([a-z][a-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/is.exec(value)
	if (!match) throw new TypeError(`Invalid IRI: ${value}`)
	const [, scheme, authority, path, query, fragment] = match
	if (requireAbsolute && !scheme) throw new TypeError(`Expected an absolute IRI: ${value}`)
	if (!pathPattern.test(path) || (query && !queryPattern.test(query.slice(1)))
		|| (fragment && !fragmentPattern.test(fragment.slice(1)))
		|| (!scheme && authority === undefined && path.split('/')[0].includes(':'))) {
		throw new TypeError(`Invalid IRI: ${value}`)
	}
	if (authority !== undefined) {
		const host = authority.slice(authority.lastIndexOf('@')+1)
		const user = authority.includes('@') ? authority.slice(0, authority.lastIndexOf('@')) : ''
		const match = /^(\[[^\]]+\]|[^:]*)(?::([0-9]*))?$/.exec(host)
		if (!userPattern.test(user) || !match) throw new TypeError(`Invalid IRI authority: ${value}`)
		if (match[1].startsWith('[')) {
			// URL is used only to validate IPv6, never to transform an IRI.
			if (!/^\[v[0-9a-f]+\.[a-z0-9._~!$&'()*+,;=:\-]+\]$/i.test(match[1])) {
				try { new URL(`http://${match[1]}/`) }
				catch { throw new TypeError(`Invalid IP literal: ${value}`) }
			}
		} else if (!hostPattern.test(match[1])) throw new TypeError(`Invalid IRI host: ${value}`)
		if (/^https?$/i.test(scheme) && !match[1]) throw new TypeError(`Missing HTTP host: ${value}`)
	} else if (/^https?$/i.test(scheme)) throw new TypeError(`Missing HTTP authority: ${value}`)
	return {scheme, authority, path, query, fragment}
}

// Validation depends only on the string, never on mutable prefixes or bases.
// Bound retention so repeated predicates/datatypes are cheap on large datasets.
const validatedIRIs = new Set()
export function absoluteIRI(value) {
	if (!validatedIRIs.has(value)) {
		parts(value, true)
		if (validatedIRIs.size >= 1024) validatedIRIs.delete(validatedIRIs.values().next().value)
		validatedIRIs.add(value)
	}
	return value
}

function join({scheme, authority, path, query, fragment}) {
	return (scheme ? scheme+':' : '') + (authority === undefined ? '' : '//'+authority)
		+ path + (query ?? '') + (fragment ?? '')
}

// RFC 3986 section 5.2.4. Preserve empty path segments and percent escapes.
function removeDotSegments(path) {
	let output = ''
	while (path) {
		if (path.startsWith('../')) path = path.slice(3)
		else if (path.startsWith('./')) path = path.slice(2)
		else if (path.startsWith('/./') || path == '/.') path = '/'+path.slice(3)
		else if (path.startsWith('/../') || path == '/..') {
			path = '/'+path.slice(4)
			output = output.slice(0, Math.max(0, output.lastIndexOf('/')))
		} else if (path == '.' || path == '..') path = ''
		else {
			const end = path.indexOf('/', path.startsWith('/') ? 1 : 0)
			if (end < 0) { output += path; path = '' }
			else { output += path.slice(0, end); path = path.slice(end) }
		}
	}
	return output
}

export function resolveIRIReference(value, base) {
	if (typeof value == 'string' && /^[a-z][a-z0-9+.-]*:/i.test(value)) return absoluteIRI(value)
	const ref = parts(value)
	if (base == null) throw new TypeError(`Cannot resolve a relative IRI without a base: ${value}`)
	const target = parts(base, true)
	if (ref.authority !== undefined) {
		target.authority = ref.authority
		target.path = removeDotSegments(ref.path)
		target.query = ref.query
	} else if (!ref.path) {
		target.query = ref.query ?? target.query
	} else {
		if (!ref.path.startsWith('/') && target.authority === undefined && !target.path.startsWith('/')) {
			throw new TypeError(`Base IRI does not support relative paths: ${base}`)
		}
		const directory = target.authority !== undefined && !target.path ? '/'
			: target.path.slice(0, target.path.lastIndexOf('/')+1)
		target.path = removeDotSegments(ref.path.startsWith('/') ? ref.path : directory+ref.path)
		target.query = ref.query
	}
	target.fragment = ref.fragment
	return absoluteIRI(join(target))
}

export function expandIRI(value, namespaceFor, separator, base) {
	value = value?.id ?? value
	if (typeof value != 'string') throw new TypeError('Expected an IRI string')
	const index = value.indexOf(separator)
	if (index >= 0) {
		const prefix = value.slice(0, index)
		const namespace = namespaceFor(prefix)
		if (namespace !== undefined) return absoluteIRI(absoluteIRI(namespace)+value.slice(index+separator.length))
		// An unresolved OLDM shorthand must not silently become a relative path.
		if (separator != ':' && !/[:/?#]/.test(prefix)) throw new TypeError(`Unknown prefix: ${prefix}`)
	}
	return resolveIRIReference(value, base)
}

export function shortenIRI(value, entries, separator, canonicalize=value => value) {
	value = canonicalize(value)
	for (const [prefix, iri] of entries) {
		const namespace = canonicalize(iri)
		if (value.startsWith(namespace)) {
			absoluteIRI(iri)
			return prefix+separator+value.slice(namespace.length)
		}
	}
	return value
}

export function relativeIRI(value, base, separator='$') {
	const target = parts(value, true)
	if (base == null) return value
	const origin = parts(base, true)
	if (target.scheme !== origin.scheme || target.authority !== origin.authority) return value
	const suffix = (target.query ?? '')+(target.fragment ?? '')
	const candidates = []
	if (target.path == origin.path) {
		if (target.query == origin.query) candidates.push(target.fragment ?? '')
		if (target.query !== undefined) candidates.push(suffix)
	}
	if (origin.authority !== undefined || origin.path.startsWith('/')) {
		const directory = origin.authority !== undefined && !origin.path ? '/' : origin.path.slice(0, origin.path.lastIndexOf('/')+1)
		const from = directory.split('/').slice(0, -1)
		const to = target.path.split('/')
		let common = 0
		while (common < from.length && common < to.length-1 && from[common] == to[common]) common++
		let path = '../'.repeat(from.length-common)+to.slice(common).join('/')
		if (!path || path.startsWith('/') || path.split('/')[0].includes(':') || path.split('/')[0].includes(separator)) path = './'+path
		candidates.push(path+suffix)
		if (target.path.startsWith('/') && !target.path.startsWith('//')) candidates.push(target.path+suffix)
	}
	// A relative spelling is useful only if it preserves the exact RDF identifier.
	return candidates.filter(candidate => {
		try { return resolveIRIReference(candidate, base) === value }
		catch { return false }
	}).sort((a, b) => a.length-b.length)[0] ?? value
}

// Turtle adapter support: escape reserved local-name characters, preserving %HH.
const pnBase = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}'
const pnChars = pnBase+'0-9_\\-\\u00B7\\u0300-\\u036F\\u203F-\\u2040'
const prefixPattern = new RegExp(`^(?:[${pnBase}](?:[${pnChars}.]*[${pnChars}])?)?$`, 'u')
const firstLocal = new RegExp(`^[${pnBase}_:0-9]$`, 'u')
const restLocal = new RegExp(`^[${pnChars}:]$`, 'u')
export function turtlePrefixedIRI(value, entries) {
	for (const [prefix, namespace] of entries) {
		if (!prefixPattern.test(prefix) || !value.startsWith(namespace)) continue
		const local = Array.from(value.slice(namespace.length))
		let escaped = ''
		let valid = true
		for (let i=0; i<local.length; i++) {
			const char = local[i]
			if (char == '%' && /^[0-9a-f]{2}$/i.test(local.slice(i+1, i+3).join(''))) {
				escaped += local.slice(i, i+3).join(''); i += 2
			} else if ((i ? restLocal : firstLocal).test(char) || (char == '.' && i && i < local.length-1)) escaped += char
			else if ("_~.-!$&'()*+,;=/?#@%".includes(char)) escaped += '\\'+char
			else { valid = false; break }
		}
		if (valid) return prefix+':'+escaped
	}
	return null
}
