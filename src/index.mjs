import oldmCore, * as oldmUtil from './oldm.mjs'
import * as oldmN3 from './oldm-n3.mjs'

const oldm = {
	context: oldmCore,
	...oldmUtil,
	...oldmN3
}

globalThis.oldm = oldm

export default oldm