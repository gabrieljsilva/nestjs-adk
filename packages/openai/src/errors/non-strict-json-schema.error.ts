import { AdkError } from "@nestjs-adk/core";

/**
 * Raised before a request leaves, when a structured output schema is outside the strict subset
 * OpenAI accepts. `path` points at the offending object and `problem` says what is wrong with
 * it, so the schema can be fixed without paying a round trip to be refused.
 */
export class NonStrictJsonSchemaError extends AdkError {
	public readonly code = "OPENAI_NON_STRICT_JSON_SCHEMA";

	public constructor(
		public readonly path: string,
		public readonly problem: string,
	) {
		super(
			`Structured output needs the strict subset of JSON Schema: ${NonStrictJsonSchemaError.where(path)} ${problem}.`,
		);
	}

	private static where(path: string): string {
		return path === "" ? "the root object" : `the object at ${path}`;
	}
}
