import { describe, expect, it } from "vitest";
import { StructuredOutputValidator } from "./structured-output-validator";

class UppercasingValidator extends StructuredOutputValidator {
	public validate(_schema: unknown, answer: string): unknown {
		return { text: answer.toUpperCase() };
	}
}

describe("StructuredOutputValidator", () => {
	it("turns the text of an answer into the value the caller asked for", () => {
		expect(new UppercasingValidator().validate({}, "ok")).toEqual({ text: "OK" });
	});

	it("takes the schema as unknown, so the core picks no schema language", () => {
		expect(new UppercasingValidator().validate({ anything: true }, "ok")).toEqual({ text: "OK" });
	});

	it("is the type the executor depends on", () => {
		expect(new UppercasingValidator()).toBeInstanceOf(StructuredOutputValidator);
	});
});
