import {readFile, stat} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'
import {performance} from 'node:perf_hooks'
import * as ohm17 from 'ohm-js-17'
import {Grammar} from 'ohm-js'
import oldm from '@muze-nl/oldm-core'
import {n3Parser} from '@muze-nl/oldm-n3'
import {turtleParser} from '@muze-labs/oldm-turtle'

const grammarFile = new URL('../packages/oldm-turtle/experimental/turtle.ohm', import.meta.url)
const wasmFile = new URL('../packages/oldm-turtle/experimental/turtle-ohm18.wasm', import.meta.url)
const baseIterations = Number(process.env.TURTLE_BENCH_ITERATIONS || 100)
const warmupRatio = Number(process.env.TURTLE_BENCH_WARMUP_RATIO || 0.1)

const grammarSource = await readFile(grammarFile, 'utf8')
const wasmBytes = await readFile(wasmFile)

let start = performance.now()
const ohm17Grammar = ohm17.grammar(grammarSource)
const ohm17SetupMs = performance.now() - start

start = performance.now()
const ohm18Grammar = await Grammar.instantiate(wasmBytes)
const ohm18SetupMs = performance.now() - start

const documents = representativeDocuments()
const rows = []
for (const document of documents) {
	const iterations = iterationsFor(document.turtle.length)
	const warmup = Math.max(5, Math.round(iterations * warmupRatio))
	const url = document.url

	rows.push(await benchmark({
		engine: 'oldm-turtle',
		mode: 'parse to quads',
		document,
		iterations,
		warmup,
		fn() {
			const result = turtleParser(document.turtle, url, 'text/turtle')
			if (!result.quads.length) {
				throw new Error(`oldm-turtle produced no quads for ${document.name}`)
			}
		}
	}))

	rows.push(await benchmark({
		engine: 'oldm-turtle',
		mode: 'OLDM parse',
		document,
		iterations,
		warmup,
		fn() {
			const context = oldm({parser: turtleParser})
			const source = context.parse(document.turtle, url, 'text/turtle')
			if (!source.data?.length) {
				throw new Error(`oldm-turtle OLDM parse produced no data for ${document.name}`)
			}
		}
	}))

	rows.push(await benchmark({
		engine: 'oldm-n3',
		mode: 'OLDM parse',
		document,
		iterations,
		warmup,
		fn() {
			const context = oldm({parser: n3Parser})
			const source = context.parse(document.turtle, url, 'text/turtle')
			if (!source.data?.length) {
				throw new Error(`oldm-n3 OLDM parse produced no data for ${document.name}`)
			}
		}
	}))

	rows.push(await benchmark({
		engine: 'ohm-js 17.5.0',
		mode: 'recognize only',
		document,
		iterations,
		warmup,
		fn() {
			const result = ohm17Grammar.match(document.turtle)
			if (!result.succeeded()) {
				throw new SyntaxError(result.message)
			}
		}
	}))

	rows.push(await benchmark({
		engine: 'ohm-js 18 beta',
		mode: 'recognize only',
		document,
		iterations,
		warmup,
		fn() {
			const result = ohm18Grammar.match(document.turtle)
			try {
				if (!result.succeeded()) {
					throw new SyntaxError(result.message)
				}
			} finally {
				result.dispose()
			}
		}
	}))
}

const wasmStats = await stat(wasmFile)
console.log('\nOhm Turtle recognizer setup')
console.table([
	{
		item: 'Ohm v17 grammar source',
		kb: round(Buffer.byteLength(grammarSource) / 1024),
		gzipKb: round(gzipSync(grammarSource).length / 1024),
		setupMs: round(ohm17SetupMs)
	},
	{
		item: 'Ohm v18 compiled wasm',
		kb: round(wasmStats.size / 1024),
		gzipKb: round(gzipSync(wasmBytes).length / 1024),
		setupMs: round(ohm18SetupMs)
	}
])

console.log('\nTurtle parser benchmark')
console.table(rows.map(row => ({
	engine: row.engine,
	mode: row.mode,
	document: row.document,
	inputKb: round(row.inputBytes / 1024),
	iterations: row.iterations,
	meanMs: round(row.meanMs),
	opsPerSec: Math.round(1000 / row.meanMs)
})))

console.log('\nNotes')
console.log('- The Ohm rows are recognition-only. They measure parser-engine speed, not CST walking or OLDM quad creation.')
console.log('- The oldm-turtle parse-to-quads row is the closest current-parser baseline for an eventual Ohm backend.')
console.log('- Run npm run compare:turtle for the existing bundle-size and write benchmark against oldm-n3.')

function iterationsFor(bytes) {
	return Math.max(20, Math.round(baseIterations / Math.max(1, bytes / 5000)))
}

async function benchmark({engine, mode, document, iterations, warmup, fn}) {
	for (let i=0; i<warmup; i++) {
		await fn()
	}
	const started = performance.now()
	for (let i=0; i<iterations; i++) {
		await fn()
	}
	const elapsed = performance.now() - started
	return {
		engine,
		mode,
		document: document.name,
		inputBytes: document.turtle.length,
		iterations,
		meanMs: elapsed / iterations
	}
}

function round(value) {
	return Math.round(value * 100) / 100
}

function representativeDocuments() {
	const profile = `
@prefix : <#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <http://schema.org/> .
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:me
	a schema:Person, foaf:Person ;
	vcard:fn "Auke van Slooten" ;
	schema:name "Auke"@nl ;
	vcard:bday "1972-09-20"^^xsd:date ;
	foaf:img <profile.jpg> ;
	foaf:knows :friend1, :friend2 ;
	solid:oidcIssuer <https://issuer.example/> ;
	schema:knowsAbout ("web" "solid" "linked data") ;
	vcard:hasEmail [ vcard:value <mailto:auke@example.org> ] .

:friend1 vcard:fn "Ada" .
:friend2 vcard:fn "Ben" .
`

	const preferences = `
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix pim: <http://www.w3.org/ns/pim/space#> .
@prefix solid: <http://www.w3.org/ns/solid/terms#> .
@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .

<https://example.org/profile/card#me>
	pim:preferencesFile <https://example.org/settings/prefs.ttl> ;
	solid:privateTypeIndex <https://example.org/settings/privateTypeIndex.ttl> ;
	solid:publicTypeIndex <https://example.org/settings/publicTypeIndex.ttl> ;
	vcard:hasAddress [
		vcard:street-address "Example street" ;
		vcard:locality "Enschede" ;
		vcard:country-name "Netherlands"
	] .
`

	return [
		{name: 'profile', url: 'https://example.org/profile/card#me', turtle: profile},
		{name: 'preferences', url: 'https://example.org/settings/prefs.ttl', turtle: preferences},
		generatedContacts(20),
		generatedContacts(200)
	]
}

function generatedContacts(count) {
	let turtle = `
@prefix : <#> .
@prefix schema: <http://schema.org/> .
@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .

`
	for (let i=1; i<=count; i++) {
		turtle += `:contact${i} a schema:Person ;\n`
		turtle += `\tvcard:fn "Contact ${i}" ;\n`
		turtle += `\tvcard:hasEmail [ vcard:value <mailto:contact${i}@example.org> ] ;\n`
		turtle += `\tvcard:note "Small note ${i}" .\n\n`
	}
	return {
		name: `${count} contacts`,
		url: 'https://example.org/contacts/index.ttl',
		turtle
	}
}
