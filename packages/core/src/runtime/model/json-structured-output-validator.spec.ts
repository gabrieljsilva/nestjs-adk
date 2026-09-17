import { describe, expect, it } from "vitest";
import { StructuredOutputValidator } from "../../contracts/model/structured-output-validator";
import { InvalidStructuredOutputError } from "../../domain/model/errors/invalid-structured-output.error";
import type { RunContext } from "../../domain/run/run-context";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { JsonStructuredOutputValidator } from "./json-structured-output-validator";

const validator = new JsonStructuredOutputValidator();
const SCHEMA = { type: "object" };

const RUN = RunContextFixture.run();

describe("JsonStructuredOutputValidator", () => {
	it("parses an object answer", () => {
		expect(validator.validate(RUN, SCHEMA, '{"refunded":true}')).toEqual({ refunded: true });
	});

	it("ignores surrounding whitespace", () => {
		expect(validator.validate(RUN, SCHEMA, '  {"a":1}\n')).toEqual({ a: 1 });
	});

	it("refuses an answer written in words", () => {
		expect(() => validator.validate(RUN, SCHEMA, "I cannot do that")).toThrow(InvalidStructuredOutputError);
	});

	it("refuses truncated JSON", () => {
		expect(() => validator.validate(RUN, SCHEMA, '{"refunded":')).toThrow(InvalidStructuredOutputError);
	});

	it("refuses JSON that is not an object", () => {
		expect(() => validator.validate(RUN, SCHEMA, "42")).toThrow(InvalidStructuredOutputError);
		expect(() => validator.validate(RUN, SCHEMA, '"text"')).toThrow(InvalidStructuredOutputError);
	});

	it("refuses an empty answer", () => {
		expect(() => validator.validate(RUN, SCHEMA, "   ")).toThrow(InvalidStructuredOutputError);
	});

	it("attaches the answer to the failure, since the cause is usually visible in it", () => {
		const failure = (() => {
			try {
				validator.validate(RUN, SCHEMA, "I cannot do that");
				return undefined;
			} catch (error) {
				return error;
			}
		})();

		expect(failure).toBeInstanceOf(InvalidStructuredOutputError);
		if (!(failure instanceof InvalidStructuredOutputError)) return;
		expect(failure.answer).toBe("I cannot do that");
	});

	it("accepts an array, which is JSON and an object", () => {
		expect(validator.validate(RUN, SCHEMA, "[1,2]")).toEqual([1, 2]);
	});

	it("is a structured output validator", () => {
		expect(validator).toBeInstanceOf(StructuredOutputValidator);
	});
});
