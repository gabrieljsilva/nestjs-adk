import { LlmModel } from "./llm-model";

const MARKER = "__adkModelSpec";

/**
 * A provider model, declared by name and options.
 *
 * It is an `LlmModel` and not a description of one: in the native runtime there is no
 * engine in the middle turning a declaration into a model later, so declaring
 * `new GeminiModel("gemini-2.5-flash", { apiKey })` is already the model the agent
 * will call.
 *
 * The core knows this shape and nothing about any provider. Gemini lives in
 * `@nestjs-adk/google`, OpenAI in `@nestjs-adk/openai`, and adding a third one needs
 * no change here.
 */
export abstract class ModelSpec extends LlmModel {
	/** Which provider answers, as it appears in logs, events and pricing. */
	public abstract readonly provider: string;

	/** The model name the provider knows, verbatim. */
	public abstract readonly model: string;

	/**
	 * Structural check instead of `instanceof`.
	 * A spec built by a provider package can meet a second copy of this class when the
	 * core is loaded as both CommonJS and ESM, and `instanceof` would answer no to
	 * something that is unmistakably a spec.
	 */
	public static is(value: unknown): value is ModelSpec {
		if (typeof value !== "object" || value === null) return false;
		return Reflect.get(value, MARKER) === true;
	}

	/** The model name behind a value, whether it is already a name or a spec. */
	public static idOf(value: unknown): string | undefined {
		if (typeof value === "string") return value;
		if (!ModelSpec.is(value)) return undefined;
		return value.model;
	}

	protected constructor() {
		super();
		Object.defineProperty(this, MARKER, { value: true, enumerable: false });
	}
}
