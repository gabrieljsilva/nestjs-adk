import type { RunContext } from "../../domain/run/run-context.value-object";

/**
 * Turns the text of a structured answer into the value the caller asked for.
 *
 * The schema arrives as `unknown` so the core takes no side on how schemas are written. It
 * throws rather than returning a failure. The context is absent only for a model call made
 * outside a run.
 */
export abstract class StructuredOutputValidator {
	public abstract validate(context: RunContext | undefined, schema: unknown, answer: string): unknown;
}
