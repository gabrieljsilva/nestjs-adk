/**
 * Whether a model of this name signs the function calls it asks for.
 *
 * Gemini 3 attaches a thought signature to the calls it generates and then validates that
 * they come back, which changes what a request built from someone else's history may contain.
 * Gemini 2.5 signs nothing and validates nothing.
 *
 * A name that does not state a generation counts as signing, and that default was measured
 * rather than chosen. Google publishes moving aliases: `gemini-flash-latest` answered as
 * `gemini-3.6-flash` and refused an unsigned call with a 400, so reading an alias as an old
 * model reopens the bug for anyone who follows Google's own naming. The opposite mistake
 * costs nothing: `gemini-2.5-flash-lite` was sent a signature it never issued and answered
 * normally.
 */
export function signsFunctionCalls(model: string): boolean {
	const generation = /(?:^|\/)gemini-(\d+)/.exec(model)?.[1];
	return generation === undefined || Number(generation) >= 3;
}
