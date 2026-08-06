import { describe, expect, it } from "vitest";
import { NonStrictJsonSchemaError } from "./errors/non-strict-json-schema.error";
import { StrictSchemaValidator } from "./strict-schema-validator";

const validator = new StrictSchemaValidator();

function closed(properties: Record<string, unknown>): Record<string, unknown> {
	return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

describe("StrictSchemaValidator", () => {
	it("accepts a closed object that requires everything it declares", () => {
		expect(() => validator.validate(closed({ score: { type: "number" } }))).not.toThrow();
	});

	/** The one that cost a red suite: OpenAI answers 400 and names this exact field. */
	it("refuses an object left open, naming what is missing", () => {
		const schema = { type: "object", properties: { score: { type: "number" } }, required: ["score"] };

		expect(() => validator.validate(schema)).toThrow(NonStrictJsonSchemaError);
		expect(() => validator.validate(schema)).toThrow(/root object does not set "additionalProperties" to false/);
	});

	it("refuses a property left out of required, naming the property", () => {
		const schema = { ...closed({ score: { type: "number" }, reason: { type: "string" } }), required: ["score"] };

		expect(() => validator.validate(schema)).toThrow(/leaves "reason" out of "required"/);
	});

	it("names the path of a nested object rather than the root", () => {
		const schema = closed({ customer: { type: "object", properties: { name: { type: "string" } } } });

		expect(() => validator.validate(schema)).toThrow(/at properties.customer does not set/);
	});

	it("walks into the items of an array", () => {
		const schema = closed({ orders: { type: "array", items: { type: "object", properties: { id: {} } } } });

		expect(() => validator.validate(schema)).toThrow(/at properties.orders.items does not set/);
	});

	it("walks into each alternative of a union", () => {
		const schema = closed({ answer: { anyOf: [closed({ text: {} }), { type: "object", properties: { code: {} } }] } });

		expect(() => validator.validate(schema)).toThrow(/at properties.answer.anyOf\[1\] does not set/);
	});

	it("walks into a definition, which is where an inlined shape ends up", () => {
		const schema = { ...closed({ at: { type: "string" } }), $defs: { Address: { type: "object", properties: {} } } };

		expect(() => validator.validate(schema)).toThrow(/at \$defs.Address does not set/);
	});

	/** A schema that names no properties describes a scalar, and strict mode has nothing to enforce. */
	it("leaves a schema that describes no object alone", () => {
		expect(() => validator.validate({ type: "string" })).not.toThrow();
	});

	/** An object that declares nothing still has to be closed, which is what the provider checks. */
	it("still requires a closed object when it declares no properties", () => {
		expect(() => validator.validate({ type: "object", properties: {}, additionalProperties: false })).not.toThrow();
		expect(() => validator.validate({ type: "object" })).toThrow(NonStrictJsonSchemaError);
	});

	it("carries the path and the problem as facts, not only inside the message", () => {
		const error = new NonStrictJsonSchemaError("properties.customer", 'leaves "name" out of "required"');

		expect(error.code).toBe("OPENAI_NON_STRICT_JSON_SCHEMA");
		expect(error.path).toBe("properties.customer");
		expect(error.problem).toContain("name");
	});
});
