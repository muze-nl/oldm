import oldm from '@muze-nl/oldm'

export default function oldmmw(options)
{
	options = Object.assign({
		contentType: 'text/turtle',
		parser: oldm.n3Parser,
		writer: oldm.n3Writer
	}, options)

	const context = options.context ?? oldm.context(options)

	async function oldmmw(req, next) {
		if (!req.headers.get('Accept')) {
			req = req.with({
				headers: {
					'Accept': options.accept ?? options.contentType
				}
			})
		}
		if (req.method!=='GET' && req.method!=='HEAD') {
			//https://developer.mozilla.org/en-US/docs/Web/API/Request/body
			if (req.data && typeof req.data=='object' && !(req.data instanceof ReadableStream)) {
				const contentType = req.headers.get('Content-Type')
				if (!contentType || isPlainText(contentType)) {
					req = req.with({
						headers: {
							'Content-Type': options.contentType,
						}
					})
				}
				if (isLinkedData(req.headers.get('Content-Type'))) {
					req = req.with({
						body: await writeRequestData(req)
					})
				}
			}
		}
		let res = await next(req)
		if (res && isLinkedData(res.headers?.get('Content-Type'))) {
			return res.with({
				body: await parseResponseData(req, res)
			})
		}
		return res
	}

	async function writeRequestData(req)
	{
		try {
			return await context.writer(req.data)
		}
		catch(error) {
			let message = 'oldmmw: could not write request data as '
				+ req.headers.get('Content-Type') + ' for ' + req.url
			if (context.writer === oldm.n3Writer) {
				message += '; the default writer expects an OLDM Graph'
			}
			throw linkedDataError(message, error, req)
		}
	}

	async function parseResponseData(req, res)
	{
		const contentType = res.headers.get('Content-Type')
		const body = await res.clone().text()
		try {
			return context.parse(body, req.url, contentType)
		}
		catch(error) {
			// the status already reports an HTTP failure, so an
			// unparseable error body is left as text
			if (!res.ok) {
				return body
			}
			const message = 'oldmmw: could not parse ' + contentType
				+ ' response from ' + req.url
			throw linkedDataError(message, error, req, res)
		}
	}

	oldmmw.context = context
	return oldmmw
}

/**
 * The error's cause is the parser or writer error. The request and, for
 * parse errors, the unparsed response remain available for inspection.
 */
function linkedDataError(message, cause, request, response)
{
	const error = new Error(message, { cause })
	error.request = request
	if (response) {
		error.response = response
	}
	return error
}

const mimetypes = [
	/^text\/turtle\b/,
	/^application\/n-quads\b/,
	/^text\/x-nquads\b/,
	/^application\/n-triples\b/,
	/^application\/trig\b/
]

function isLinkedData(contentType) {
	for (const re of mimetypes) {
		if (re.exec(contentType)) {
			return true
		}
	}
	return false
}
function isPlainText(contentType) {
	return /^text\/plain\b/.exec(contentType)
}
