import { AdkError } from "@nestjs-adk/core";

/**
 * Raised before a request leaves, when a tool or structured output declares something that is
 * not a JSON Schema object and OpenAI would refuse it. `subject` names what declared it.
 */
export class InvalidJsonSchemaError extends AdkError {
	public readonly code = "OPENAI_INVALID_JSON_SCHEMA";

	public constructor(
		public readonly subject: string,
		public readonly received: string,
	) {
		super(`Schema of ${subject} is of type ${received}; OpenAI needs a JSON Schema object.`);
	}
}
