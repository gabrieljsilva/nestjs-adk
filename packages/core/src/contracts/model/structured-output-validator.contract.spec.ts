import { describe, expect, it } from "vitest";
import type { RunContext } from "../../domain/run/run-context.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { StructuredOutputValidator } from "./structured-output-validator.contract";

class UppercasingValidator extends StructuredOutputValidator {
	public validate(_context: RunContext | undefined, _schema: unknown, answer: string): unknown {
		return { text: answer.toUpperCase() };
	}
}

const RUN = RunContextFixture.run();

describe("StructuredOutputValidator", () => {
	it("turns the text of an answer into the value the caller asked for", () => {
		expect(new UppercasingValidator().validate(RUN, {}, "ok")).toEqual({ text: "OK" });
	});

	it("takes the schema as unknown, so the core picks no schema language", () => {
		expect(new UppercasingValidator().validate(RUN, { anything: true }, "ok")).toEqual({ text: "OK" });
	});

	it("is the type the executor depends on", () => {
		expect(new UppercasingValidator()).toBeInstanceOf(StructuredOutputValidator);
	});
});
