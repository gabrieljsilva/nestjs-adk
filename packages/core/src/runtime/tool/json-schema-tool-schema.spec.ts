import { describe, expect, it } from "vitest";
import { JsonSchemaToolSchema } from "./json-schema-tool-schema";

const SCHEMA = {
	type: "object",
	properties: { orderId: { type: "string" }, reason: { type: "string" } },
	required: ["orderId"],
};

describe("JsonSchemaToolSchema", () => {
	it("shows the model the schema it arrived with", () => {
		expect(new JsonSchemaToolSchema(SCHEMA).declaration()).toBe(SCHEMA);
	});

	it("accepts a call that names the declared properties", () => {
		const parsed = new JsonSchemaToolSchema(SCHEMA).parse({ orderId: "42", reason: "damaged" });

		expect(parsed.isValid).toBe(true);
		expect(parsed.values).toEqual({ orderId: "42", reason: "damaged" });
	});

	it("prunes a property the schema never declared", () => {
		const parsed = new JsonSchemaToolSchema(SCHEMA).parse({ orderId: "42", internalNote: "drop me" });

		expect(parsed.values).toEqual({ orderId: "42" });
	});

	it("refuses a call missing something the schema requires", () => {
		const parsed = new JsonSchemaToolSchema(SCHEMA).parse({ reason: "damaged" });

		expect(parsed.isValid).toBe(false);
		expect(parsed.reason).toContain("orderId");
	});

	it("keeps everything when the schema declared no properties", () => {
		const parsed = new JsonSchemaToolSchema({ type: "object" }).parse({ anything: 1 });

		expect(parsed.values).toEqual({ anything: 1 });
	});

	it("refuses arguments that are not an object", () => {
		expect(new JsonSchemaToolSchema(SCHEMA).parse(["orderId"]).isValid).toBe(false);
		expect(new JsonSchemaToolSchema(SCHEMA).parse("orderId").isValid).toBe(false);
	});

	it("ignores a required list that is not a list of names", () => {
		const parsed = new JsonSchemaToolSchema({ type: "object", required: "orderId" }).parse({ a: 1 });

		expect(parsed.isValid).toBe(true);
	});

	it("refuses a value whose declared type it is not, which is what a model gets wrong", () => {
		const parsed = new JsonSchemaToolSchema(SCHEMA).parse({ orderId: 42 });

		expect(parsed.isValid).toBe(false);
		expect(parsed.reason).toContain("orderId");
	});

	it("refuses a fraction where the schema declared an integer", () => {
		const schema = new JsonSchemaToolSchema({ type: "object", properties: { page: { type: "integer" } } });

		expect(schema.parse({ page: 1.5 }).isValid).toBe(false);
		expect(schema.parse({ page: 2 }).isValid).toBe(true);
	});

	it("refuses a value outside the enum the model was shown", () => {
		const schema = new JsonSchemaToolSchema({
			type: "object",
			properties: { status: { enum: ["open", "closed"] } },
		});

		expect(schema.parse({ status: "archived" }).isValid).toBe(false);
		expect(schema.parse({ status: "open" }).isValid).toBe(true);
	});

	it("leaves alone what it does not check, rather than refusing what it cannot judge", () => {
		const schema = new JsonSchemaToolSchema({
			type: "object",
			properties: { filter: { type: "object", properties: { since: { type: "string" } } } },
		});

		expect(schema.parse({ filter: { since: 42, extra: true } }).isValid).toBe(true);
	});
});
