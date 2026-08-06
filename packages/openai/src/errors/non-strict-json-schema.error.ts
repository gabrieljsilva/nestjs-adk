import { AdkError } from "@nestjs-adk/core";

/**
 * A structured output schema OpenAI would refuse, caught before it is sent.
 *
 * Strict mode is what makes the provider enforce the shape rather than suggest it, and
 * it only accepts a subset: every object closed, every property required. A schema
 * outside it comes back as a 400 about a request nobody wrote by hand, so it fails
 * here instead, naming the object and what is missing from it.
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
