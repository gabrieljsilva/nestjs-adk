import { LlmModel } from "../llm-model.contract";

const MARKER = "__adkModelSpec";

/**
 * A provider model, declared by name and options. It is an `LlmModel` rather than a
 * description of one: `new GeminiModel("gemini-2.5-flash", { apiKey })` is already the
 * model the agent calls. Each provider ships its own spec in its own package.
 */
export abstract class ModelSpec extends LlmModel {
	public abstract readonly provider: string;

	public abstract readonly model: string;

	public static is(value: unknown): value is ModelSpec {
		if (typeof value !== "object" || value === null) return false;
		return Reflect.get(value, MARKER) === true;
	}

	public static readId(value: unknown): string | undefined {
		if (typeof value === "string") return value;
		if (!ModelSpec.is(value)) return undefined;
		return value.model;
	}

	protected constructor() {
		super();
		Object.defineProperty(this, MARKER, { value: true, enumerable: false });
	}
}
