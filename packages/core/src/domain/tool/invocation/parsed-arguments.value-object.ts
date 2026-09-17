/**
 * What a schema made of the arguments a model wrote. Invalid is a normal outcome and not an
 * exception, `reason` is text written for the model to read, and `values` is empty unless `isValid`.
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
