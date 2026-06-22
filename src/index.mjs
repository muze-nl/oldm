import oldmContext, * as oldmUtil from './oldm.mjs'
import * as oldmN3 from './oldm-n3.mjs'

const oldm = {
	context: function(options) {
		if (!options.parser) {
			options.parser = oldmN3.n3Parser
		}
		if (!options.writer) {
			options.writer = oldmN3.n3Writer
		}
		return oldmContext(options)
	},
	...oldmUtil,
	...oldmN3
}

globalThis.oldm = oldm

export default oldm