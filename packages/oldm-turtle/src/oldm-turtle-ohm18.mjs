// Compatibility entry point for the original Ohm 18 experiment.
// Prefer ./oldm-turtle-reference.mjs or the package export ./reference for new tests.
export {
	turtleReferenceParser,
	turtleReferenceParser as turtleOhm18Parser,
	turtleReferenceParser as turtleParser,
	turtleWriter
} from './oldm-turtle-reference.mjs'
