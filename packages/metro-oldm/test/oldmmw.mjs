import tap from 'tap'
import metro from '@muze-nl/metro'
import oldm from '@muze-nl/oldm'
import oldmmw from '../src/oldmmw.mjs'

const turtle = `@prefix schema: <https://schema.org/> .
<#me> schema:name "Ada" .
`

function mockLinkedDataServer(t, options = {}) {
	return async (req) => {
		if (req.url.endsWith('/people.ttl')) {
			t.equal(req.headers.get('Accept'), options.accept || 'text/turtle')
			return metro.response({
				status: 200,
				statusText: 'OK',
				headers: {
					'Content-Type': options.contentType || 'text/turtle'
				},
				body: options.body || turtle
			})
		}
		if (req.url.endsWith('/save.ttl')) {
			t.equal(req.method, 'POST')
			t.equal(req.headers.get('Content-Type'), options.contentType || 'text/turtle')
			t.equal(await req.clone().text(), options.expectedBody || turtle)
			return metro.response({
				status: 201,
				statusText: 'Created',
				body: 'created'
			})
		}
		return metro.response({
			status: 404,
			statusText: 'Not Found',
			body: 'not found'
		})
	}
}

tap.test('GET adds an Accept header and parses Turtle responses into OLDM data', async t => {
	const linkedData = oldmmw()
	const client = metro.client().with(mockLinkedDataServer(t)).with(linkedData)

	const res = await client.get('https://example.test/people.ttl')
	t.ok(res.ok)
	t.equal(res.data.constructor.name, 'Graph')
	t.ok(res.data.subjects['https://example.test/people.ttl#me'])
	t.equal(res.data.subjects['https://example.test/people.ttl#me']['schema$name'].toString(), 'Ada')
	t.equal(linkedData.context.graph('https://example.test/people.ttl'), res.data)
})

tap.test('oldmmw can use a caller-owned OLDM context', async t => {
	const context = oldm.context()
	const linkedData = oldmmw({ context })
	const client = metro.client().with(mockLinkedDataServer(t)).with(linkedData)

	const res = await client.get('https://example.test/people.ttl')

	t.equal(linkedData.context, context)
	t.equal(context.graph('https://example.test/people.ttl'), res.data)
	t.equal(context.get('https://example.test/people.ttl#me')['schema$name'].toString(), 'Ada')
})

tap.test('GET leaves non-linked-data responses unchanged', async t => {
	const client = metro.client().with(mockLinkedDataServer(t, {
		contentType: 'text/plain',
		body: turtle
	})).with(oldmmw())

	const res = await client.get('https://example.test/people.ttl')
	t.ok(res.ok)
	t.equal(await res.text(), turtle)
	t.equal(res.data, turtle)
})

tap.test('POST serializes object data with the configured writer', async t => {
	const body = '@prefix schema: <https://schema.org/> .\n<#me> schema:name "Grace" .\n'
	const data = { example: true }
	const client = metro.client()
		.with(mockLinkedDataServer(t, { expectedBody: body }))
		.with(oldmmw({
			writer: async value => {
				t.equal(value, data)
				return body
			}
		}))

	const res = await client.post('https://example.test/save.ttl', { body: data })
	t.equal(res.status, 201)
	t.equal(await res.text(), 'created')
})

tap.test('POST leaves explicit non-linked-data content alone', async t => {
	const data = { hello: 'world' }
	const client = metro.client()
		.with(async req => {
			t.equal(req.headers.get('Content-Type'), 'application/json')
			t.equal(await req.clone().text(), '[object Object]')
			return metro.response({ status: 200, body: 'ok' })
		})
		.with(oldmmw())

	const res = await client.post('https://example.test/save.ttl', {
		body: data,
		headers: {
			'Content-Type': 'application/json'
		}
	})
	t.ok(res.ok)
})

tap.test('GET rejects a Linked Data response that cannot be parsed', async t => {
	const client = metro.client().with(mockLinkedDataServer(t, {
		body: '<#me> <https://schema.org/name> "unterminated .'
	})).with(oldmmw())

	const error = await client.get('https://example.test/people.ttl')
		.then(() => null, error => error)

	t.ok(error, 'the request rejects')
	t.match(error.message, /could not parse text\/turtle response from https:\/\/example\.test\/people\.ttl/)
	t.ok(error.cause, 'the parser error is the cause')
	t.equal(error.response.status, 200)
	t.equal(error.request.url, 'https://example.test/people.ttl')
	t.match(await error.response.text(), /unterminated/)
})

tap.test('GET parses N-Triples responses', async t => {
	const client = metro.client().with(async () => metro.response({
		status: 200,
		headers: {
			'Content-Type': 'application/n-triples'
		},
		body: '<https://example.test/people#me> <https://schema.org/name> "Ada" .\n'
	})).with(oldmmw())

	const res = await client.get('https://example.test/people')
	t.equal(res.data.constructor.name, 'Graph')
	t.equal(res.data.subjects['https://example.test/people#me']['schema$name'].toString(), 'Ada')
})

tap.test('POST explains that the default writer needs an OLDM Graph', async t => {
	const client = metro.client()
		.with(async () => {
			t.fail('the request must not be sent')
			return metro.response({ status: 201 })
		})
		.with(oldmmw())

	const error = await client.post('https://example.test/save.ttl', {
		body: { name: 'Ada' }
	}).then(() => null, error => error)

	t.ok(error, 'the request rejects')
	t.match(error.message, /could not write request data as text\/turtle for https:\/\/example\.test\/save\.ttl/)
	t.match(error.message, /expects an OLDM Graph/)
	t.ok(error.cause)
	t.equal(error.request.url, 'https://example.test/save.ttl')
})

tap.test('POST reports custom writer failures without the default-writer hint', async t => {
	const failure = new Error('writer failed')
	const client = metro.client()
		.with(async () => metro.response({ status: 201 }))
		.with(oldmmw({
			writer: async () => {
				throw failure
			}
		}))

	const error = await client.post('https://example.test/save.ttl', {
		body: { name: 'Ada' }
	}).then(() => null, error => error)

	t.equal(error.cause, failure)
	t.notMatch(error.message, /OLDM Graph/)
})

tap.test('GET keeps an unparseable error response as text', async t => {
	const client = metro.client().with(async () => metro.response({
		status: 500,
		statusText: 'Internal Server Error',
		headers: {
			'Content-Type': 'text/turtle'
		},
		body: 'Something went wrong'
	})).with(oldmmw())

	const res = await client.get('https://example.test/people.ttl')
	t.equal(res.status, 500)
	t.equal(res.data, 'Something went wrong')
})
