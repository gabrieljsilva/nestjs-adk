/**
 * What a schema made of the arguments a model wrote.
 *
 * Invalid is a normal outcome, not an exception. The model wrote the arguments and can
 * usually fix them once it is told what was wrong, so the reason travels as text meant
 * to be read by the model rather than as a stack trace meant for a log.
 *
 * Values are only present when they are valid. There is no half parsed shape: a caller
 * that reads `values` has already been told the parse succeeded.
 */
export class ParsedArguments {
	private constructor(
		public readonly isValid: boolean,
		public readonly values: Record<string, unknown>,
		public readonly reason: string,
	) {}

	public static valid(values: Record<string, unknown>): ParsedArguments {
		return new ParsedArguments(true, values, "");
	}

	public static invalid(reason: string): ParsedArguments {
		return new ParsedArguments(false, {}, reason);
	}
}
