import {readFile, writeFile} from 'node:fs/promises'
import {compile} from '@ohm-js/compiler'

const grammarFile = new URL('../packages/oldm-turtle/experimental/turtle.ohm', import.meta.url)
const outputFile = new URL('../packages/oldm-turtle/experimental/turtle-ohm18.wasm', import.meta.url)

const source = await readFile(grammarFile, 'utf8')
const bytes = compile(source, {grammarName: 'TurtleSubset'})
await writeFile(outputFile, bytes)

console.log(`Compiled ${grammarFile.pathname} -> ${outputFile.pathname} (${bytes.length} bytes)`)
