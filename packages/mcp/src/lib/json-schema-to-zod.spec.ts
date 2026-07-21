import { describe, expect, it } from "vitest";
import { jsonSchemaToZod } from "./json-schema-to-zod";

describe("jsonSchemaToZod", () => {
	it("empty/absent schema accepts an empty object", () => {
		expect(jsonSchemaToZod(undefined).parse({})).toEqual({});
		expect(jsonSchemaToZod({}).parse({})).toEqual({});
	});

	it("required vs optional: only keys listed in `required` are mandatory", () => {
		const schema = jsonSchemaToZod({
			type: "object",
			properties: { city: { type: "string" }, unit: { type: "string" } },
			required: ["city"],
		});

		expect(schema.parse({ city: "SP" })).toEqual({ city: "SP" });
		expect(() => schema.parse({ unit: "C" })).toThrow();
	});

	it("maps the primitives: string, number, integer, boolean", () => {
		const schema = jsonSchemaToZod({
			type: "object",
			properties: {
				name: { type: "string" },
				score: { type: "number" },
				count: { type: "integer" },
				active: { type: "boolean" },
			},
			required: ["name", "score", "count", "active"],
		});

		expect(schema.parse({ name: "a", score: 1.5, count: 2, active: true })).toBeTruthy();
		expect(() => schema.parse({ name: "a", score: 1.5, count: 2.5, active: true })).toThrow(); // integer rejects float
		expect(() => schema.parse({ name: 1, score: 1.5, count: 2, active: true })).toThrow();
	});

	it("array: typed items when declared, any item otherwise", () => {
		const schema = jsonSchemaToZod({
			type: "object",
			properties: {
				tags: { type: "array", items: { type: "string" } },
				misc: { type: "array" },
			},
			required: ["tags", "misc"],
		});

		expect(schema.parse({ tags: ["a"], misc: [1, "b", true] })).toBeTruthy();
		expect(() => schema.parse({ tags: [1], misc: [] })).toThrow();
	});

	it("nested object: converts recursively with its own `required`", () => {
		const schema = jsonSchemaToZod({
			type: "object",
			properties: {
				address: {
					type: "object",
					properties: { street: { type: "string" }, number: { type: "integer" } },
					required: ["street"],
				},
			},
			required: ["address"],
		});

		expect(schema.parse({ address: { street: "Main" } })).toBeTruthy();
		expect(() => schema.parse({ address: {} })).toThrow();
	});

	it("enum: values coerced to string and validated against the set", () => {
		const schema = jsonSchemaToZod({
			type: "object",
			properties: { status: { enum: ["open", "closed", 3] } },
			required: ["status"],
		});

		expect(schema.parse({ status: "open" })).toBeTruthy();
		expect(schema.parse({ status: "3" })).toBeTruthy();
		expect(() => schema.parse({ status: "other" })).toThrow();
	});

	it("unknown type falls back to z.any()", () => {
		const schema = jsonSchemaToZod({
			type: "object",
			properties: { blob: { type: "null" } },
			required: ["blob"],
		});

		expect(schema.parse({ blob: { anything: true } })).toBeTruthy();
	});

	it("description is preserved on the Zod type (reaches the tool declaration)", () => {
		const schema = jsonSchemaToZod({
			type: "object",
			properties: { city: { type: "string", description: "City name" } },
			required: ["city"],
		});

		expect((schema.shape.city as { description?: string }).description).toBe("City name");
	});
});
