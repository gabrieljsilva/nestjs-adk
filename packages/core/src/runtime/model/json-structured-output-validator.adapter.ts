import { StructuredOutputValidator } from "../../contracts/model/structured-output-validator.contract";
import { InvalidStructuredOutputError } from "../../domain/model/errors/invalid-structured-output.error";
import type { RunContext } from "../../domain/run/run-context.value-object";

export class JsonStructuredOutputValidator extends StructuredOutputValidator {
	public validate(_context: RunContext | undefined, _schema: unknown, answer: string): unknown {
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
