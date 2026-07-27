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
                        body: await context.writer(req.data)
                    })
                }
            }
        }
        let res = await next(req)
        if (res && isLinkedData(res.headers?.get('Content-Type'))) {
        	let tempRes = res.clone()
        	let body = await tempRes.text()
        	try {
        		let ld = context.parse(body, req.url, res.headers.get('Content-Type'))
        		return res.with({
        			body: ld
        		})
        	} catch(e) {
        		// ignore parse errors
        	}
        }
        return res
	}

	oldmmw.context = context
	return oldmmw
}

const mimetypes = [
	/^text\/turtle\b/,
	/^application\/n-quads\b/,
	/^text\/x-nquads\b/,
	/^appliction\/n-triples\b/,
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
