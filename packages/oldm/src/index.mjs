import oldmCore, * as coreModule from '@muze-nl/oldm-core'
import * as n3Module from '@muze-nl/oldm-n3'

const {default: _coreDefault, ...core} = coreModule

const oldm = {
	context(options = {}) {
		const {
			parser = n3Module.n3Parser,
			writer = n3Module.n3Writer,
			patchWriter = n3Module.n3PatchWriter,
			...contextOptions
		} = options

		return oldmCore({
			...contextOptions,
			parser,
			writer,
			patchWriter
		})
	},
	...core,
	...n3Module
}

globalThis.oldm = oldm

export default oldm
