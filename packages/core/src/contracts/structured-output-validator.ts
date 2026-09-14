import type { RunContext } from "../domain/run/run-context";

/**
 * Turns the text of a structured answer into the value the caller asked for.
 *
 * The schema arrives as `unknown` because the core takes no side on how schemas are
 * written: a consumer using zod registers a validator that understands zod, one using
 * JSON Schema registers one that understands that. The default only guarantees the
 * answer is a JSON object, which is the part every schema language agrees on.
 *
 * It throws rather than returning a failure: an answer outside its shape is not a
 * decision anyone takes, it is a broken call.
 *
 * The context is the run the answer came back in. It is absent only for a model call made
 * outside a run, such as a judge grading an answer in a test, which has a request and a
 * response but no conversation to name.
 */
export abstract class StructuredOutputValidator {
	public abstract validate(context: RunContext | undefined, schema: unknown, answer: string): unknown;
}
