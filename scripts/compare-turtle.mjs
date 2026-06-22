import {gzipSync} from 'node:zlib'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'
import {build} from 'esbuild'
import oldm from '@muze-nl/oldm-core'
import {n3Parser, n3Writer} from '@muze-nl/oldm-n3'
import {turtleParser, turtleWriter} from '@muze-labs/oldm-turtle'

const outputDir = new URL('../.tmp/turtle-comparison/', import.meta.url)
await rm(outputDir, {recursive: true, force: true})
await mkdir(outputDir, {recursive: true})

const turtleEntry = new URL('oldm-turtle-entry.mjs', outputDir)
const turtleGlobalEntry = new URL('oldm-turtle-global.mjs', outputDir)
await writeFile(turtleEntry, `
import oldmCore, * as core from '@muze-nl/oldm-core'
import * as turtle from '@muze-labs/oldm-turtle'

const oldm = {
\tcontext(options = {}) {
\t\treturn oldmCore({
\t\t\tparser: turtle.turtleParser,
\t\t\twriter: turtle.turtleWriter,
\t\t\t...options
\t\t})
\t},
\t...core,
\t...turtle
}

globalThis.oldm = oldm

export default oldm
`)
await writeFile(turtleGlobalEntry, `
import oldm from './oldm-turtle-entry.mjs'
globalThis.oldm = oldm
`)

const bundles = [
	{
		name: 'oldm + oldm-n3 ESM',
		entry: 'packages/oldm/src/index.mjs',
		format: 'esm',
		outfile: new URL('oldm-n3.min.js', outputDir).pathname
	},
	{
		name: 'oldm + oldm-turtle ESM',
		entry: turtleEntry.pathname,
		format: 'esm',
		outfile: new URL('oldm-turtle.min.js', outputDir).pathname
	},
	{
		name: 'oldm + oldm-n3 IIFE',
		entry: 'packages/oldm/src/global.mjs',
		format: 'iife',
		outfile: new URL('oldm-n3.global.min.js', outputDir).pathname
	},
	{
		name: 'oldm + oldm-turtle IIFE',
		entry: turtleGlobalEntry.pathname,
		format: 'iife',
		outfile: new URL('oldm-turtle.global.min.js', outputDir).pathname
	}
]

const sizeRows = []
for (const bundle of bundles) {
	await build({
		entryPoints: [bundle.entry],
		bundle: true,
		format: bundle.format,
		outfile: bundle.outfile,
		minify: true,
		logLevel: 'silent'
	})
	const code = await readFile(bundle.outfile)
	sizeRows.push({
		bundle: bundle.name,
		bytes: code.length,
		gzipBytes: gzipSync(code).length
	})
}

const docs = representativeDocuments()
const iterations = 1000
const warmup = 100
const benchmarkRows = []
for (const adapter of [
	{name: 'oldm-n3', parser: n3Parser, writer: n3Writer},
	{name: 'oldm-turtle', parser: turtleParser, writer: turtleWriter}
]) {
	for (const document of docs) {
		for (let i=0; i<warmup; i++) {
			const context = oldm({parser: adapter.parser, writer: adapter.writer})
			const graph = context.parse(document.turtle, document.url, 'text/turtle')
			await graph.write()
		}

		let parseTime = 0
		let writeTime = 0
		let quads = 0
		let outputBytes = 0
		for (let i=0; i<iterations; i++) {
			const context = oldm({parser: adapter.parser, writer: adapter.writer})
			let start = performance.now()
			const graph = context.parse(document.turtle, document.url, 'text/turtle')
			parseTime += performance.now() - start
			quads = graph.data.reduce((count, subject) => count + Object.keys(subject).filter(key => key != 'id').length, 0)

			start = performance.now()
			const output = await graph.write()
			writeTime += performance.now() - start
			outputBytes = output.length
		}
		benchmarkRows.push({
			adapter: adapter.name,
			document: document.name,
			inputBytes: document.turtle.length,
			approxProperties: quads,
			parseMs: parseTime / iterations,
			writeMs: writeTime / iterations,
			outputBytes
		})
	}
}

console.log('\nBundle size comparison')
console.table(sizeRows.map(row => ({
	bundle: row.bundle,
	kb: round(row.bytes / 1024),
	gzipKb: round(row.gzipBytes / 1024)
})))

const esmN3 = sizeRows.find(row => row.bundle == 'oldm + oldm-n3 ESM')
const esmTurtle = sizeRows.find(row => row.bundle == 'oldm + oldm-turtle ESM')
const iifeN3 = sizeRows.find(row => row.bundle == 'oldm + oldm-n3 IIFE')
const iifeTurtle = sizeRows.find(row => row.bundle == 'oldm + oldm-turtle IIFE')
console.log(`\nESM reduction: ${round((esmN3.bytes - esmTurtle.bytes) / 1024)} kB minified, ${round((esmN3.gzipBytes - esmTurtle.gzipBytes) / 1024)} kB gzip`)
console.log(`IIFE reduction: ${round((iifeN3.bytes - iifeTurtle.bytes) / 1024)} kB minified, ${round((iifeN3.gzipBytes - iifeTurtle.gzipBytes) / 1024)} kB gzip`)

console.log('\nSmall Solid-style document benchmark')
console.table(benchmarkRows.map(row => ({
	adapter: row.adapter,
	document: row.document,
	inputKb: round(row.inputBytes / 1024),
	properties: row.approxProperties,
	parseMs: round(row.parseMs),
	writeMs: round(row.writeMs),
	outputKb: round(row.outputBytes / 1024)
})))

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

	let contacts = `
@prefix : <#> .
@prefix schema: <http://schema.org/> .
@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .

`
	for (let i=1; i<=20; i++) {
		contacts += `:contact${i} a schema:Person ;\n`
		contacts += `\tvcard:fn "Contact ${i}" ;\n`
		contacts += `\tvcard:hasEmail [ vcard:value <mailto:contact${i}@example.org> ] ;\n`
		contacts += `\tvcard:note "Small note ${i}" .\n\n`
	}

	return [
		{name: 'profile', url: 'https://example.org/profile/card#me', turtle: profile},
		{name: 'preferences', url: 'https://example.org/settings/prefs.ttl', turtle: preferences},
		{name: '20 contacts', url: 'https://example.org/contacts/index.ttl', turtle: contacts}
	]
}
