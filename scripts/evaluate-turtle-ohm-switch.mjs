import {gzipSync} from 'node:zlib'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {build} from 'esbuild'

const outputDir = new URL('../.tmp/turtle-ohm-switch/', import.meta.url)
await rm(outputDir, {recursive: true, force: true})
await mkdir(outputDir, {recursive: true})

const handwrittenEntry = new URL('oldm-turtle-entry.mjs', outputDir)
const ohmEntry = new URL('oldm-turtle-reference-entry.mjs', outputDir)

await writeFile(handwrittenEntry, `
import oldmCore, * as core from '@muze-nl/oldm-core'
import * as turtle from '@muze-labs/oldm-turtle'

export default {
	context(options = {}) {
		return oldmCore({
			parser: turtle.turtleParser,
			writer: turtle.turtleWriter,
			...options
		})
	},
	...core,
	...turtle
}
`)

await writeFile(ohmEntry, `
import oldmCore, * as core from '@muze-nl/oldm-core'
import * as turtle from '@muze-labs/oldm-turtle/reference'

export default {
	context(options = {}) {
		return oldmCore({
			parser: turtle.turtleReferenceParser,
			writer: turtle.turtleWriter,
			...options
		})
	},
	...core,
	...turtle
}
`)

const bundleRows = []
for (const bundle of [
	{name: 'oldm + handwritten turtle parser', entry: handwrittenEntry, outfile: new URL('oldm-turtle.min.js', outputDir)},
	{name: 'oldm + reference turtle parser', entry: ohmEntry, outfile: new URL('oldm-turtle-reference.min.js', outputDir)}
]) {
	await build({
		entryPoints: [bundle.entry.pathname],
		bundle: true,
		format: 'esm',
		outfile: bundle.outfile.pathname,
		minify: true,
		logLevel: 'silent'
	})
	const code = await readFile(bundle.outfile)
	bundleRows.push({
		bundle: bundle.name,
		bytes: code.length,
		gzipBytes: gzipSync(code).length
	})
}

const currentSource = await readFile(new URL('../packages/oldm-turtle/src/oldm-turtle.mjs', import.meta.url), 'utf8')
const currentParserSource = currentSource.slice(0, currentSource.indexOf('export const turtleWriter'))
const ohmParserSource = await readFile(new URL('../packages/oldm-turtle/src/oldm-turtle-reference.mjs', import.meta.url), 'utf8')
const grammarSource = await readFile(new URL('../packages/oldm-turtle/experimental/turtle.ohm', import.meta.url), 'utf8')
const generatedSource = await readFile(new URL('../packages/oldm-turtle/src/generated/turtle-ohm18-wasm.mjs', import.meta.url), 'utf8')

const maintainRows = [
	{
		part: 'handwritten parser source',
		files: 'src/oldm-turtle.mjs parser section only',
		...measure(currentParserSource)
	},
	{
		part: 'ohm18 grammar',
		files: 'experimental/turtle.ohm',
		...measure(grammarSource)
	},
	{
		part: 'reference parser walker/source',
		files: 'src/oldm-turtle-reference.mjs',
		...measure(ohmParserSource)
	},
	{
		part: 'reference maintained total',
		files: 'grammar + parser walker/source',
		...measure(grammarSource+'\n'+ohmParserSource)
	},
	{
		part: 'ohm18 generated wasm module',
		files: 'src/generated/turtle-ohm18-wasm.mjs',
		...measure(generatedSource)
	}
]

console.log('\nMaintained code comparison')
console.table(maintainRows.map(row => ({
	part: row.part,
	files: row.files,
	lines: row.lines,
	nonBlankNonComment: row.nonBlankNonComment,
	kb: round(row.bytes / 1024),
	gzipKb: round(row.gzipBytes / 1024)
})))

const handwritten = bundleRows[0]
const ohm = bundleRows[1]
console.log('\nESM browser bundle comparison')
console.table(bundleRows.map(row => ({
	bundle: row.bundle,
	kb: round(row.bytes / 1024),
	gzipKb: round(row.gzipBytes / 1024)
})))
console.log(`\nReference parser bundle cost vs handwritten: +${round((ohm.bytes - handwritten.bytes) / 1024)} kB minified, +${round((ohm.gzipBytes - handwritten.gzipBytes) / 1024)} kB gzip`)
console.log('\nNotes')
console.log('- The maintained-code comparison excludes the generated WebAssembly artifact from the reference parser total, but shows it separately.')
console.log('- The bundle comparison includes the Ohm runtime and the generated Wasm bytes inlined through the generated module.')
console.log('- The writer is shared and is not part of the parser-maintenance comparison.')

function measure(source) {
	const lines = source.split('\n')
	return {
		lines: lines.length,
		nonBlankNonComment: lines.filter(line => {
			const trimmed = line.trim()
			return trimmed && !trimmed.startsWith('//')
		}).length,
		bytes: Buffer.byteLength(source),
		gzipBytes: gzipSync(source).length
	}
}

function round(value) {
	return Math.round(value * 100) / 100
}
