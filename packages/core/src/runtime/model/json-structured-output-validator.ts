import { StructuredOutputValidator } from "../../contracts/structured-output-validator";
import { InvalidStructuredOutputError } from "../../domain/model/errors/invalid-structured-output.error";

/**
 * The default: the answer has to be a JSON object, and nothing further is checked.
 *
 * Checking the schema itself needs a schema language, and the core does not pick one.
 * What this does guarantee is the part that fails most often in practice: a model that
 * wrapped its JSON in prose, truncated it, or answered a refusal in words fails here
 * with the answer attached, instead of reaching the caller as a shape nobody validated.
 */
export class JsonStructuredOutputValidator extends StructuredOutputValidator {
	public validate(_schema: unknown, answer: string): unknown {
		const text = answer.trim();
		if (text.length === 0) throw new InvalidStructuredOutputError("the model answered nothing", answer);

		const parsed = this.parse(text);
		if (parsed === undefined) throw new InvalidStructuredOutputError("the answer is not valid JSON", answer);
		if (typeof parsed !== "object" || parsed === null) {
			throw new InvalidStructuredOutputError("the answer is JSON but not an object", answer);
		}
		return parsed;
	}

	private parse(text: string): unknown {
		try {
			return JSON.parse(text);
		} catch {
			return undefined;
		}
	}
}
