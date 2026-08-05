import { AdkError } from "@nestjs-adk/core";

/**
 * A schema that reached the adapter is not a JSON Schema object.
 * Sending it anyway would fail at the provider with a message about a request nobody
 * wrote by hand, so it fails here, naming what declared it.
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
