import { toGeminiSchema } from "./gemini-schema";

describe("toGeminiSchema: filter, not translator", () => {
	it("keeps what Gemini accepts exactly as the server wrote it", () => {
		const out = toGeminiSchema({
			type: "object",
			properties: {
				id: { anyOf: [{ type: "string" }, { type: "number" }] },
				when: { type: "string", format: "date-time", pattern: "^2", minLength: 1, maxLength: 30 },
				mode: { type: "string", enum: ["fast", "slow"], description: "speed", default: "fast" },
				tags: { type: "array", items: { type: "string" }, minItems: 1 },
			},
			required: ["id"],
		});

		expect(out).toEqual({
			type: "object",
			properties: {
				id: { anyOf: [{ type: "string" }, { type: "number" }] },
				when: { type: "string", format: "date-time", pattern: "^2", minLength: 1, maxLength: 30 },
				mode: { type: "string", enum: ["fast", "slow"], description: "speed", default: "fast" },
				tags: { type: "array", items: { type: "string" }, minItems: 1 },
			},
			required: ["id"],
		});
	});

	it("drops the keywords the API refuses, unknown ones included", () => {
		const out = toGeminiSchema({
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			additionalProperties: false,
			properties: {
				n: { type: "integer", multipleOf: 2, exclusiveMinimum: 1, minimum: 1 },
				s: { type: "string", contentEncoding: "base64", readOnly: true, someFutureKeyword: true },
			},
		});

		// the declaration travels with every tool of the turn: an unknown keyword must lose itself, not the turn
		expect(out).toEqual({
			type: "object",
			properties: {
				n: { type: "integer", minimum: 1 },
				s: { type: "string" },
			},
		});
	});

	it("repairs an array without items, which the API refuses whole-request", () => {
		const out = toGeminiSchema({ type: "object", properties: { list: { type: "array" } } });

		expect(out.properties).toEqual({ list: { type: "array", items: { type: "string" } } });
	});

	it("repairs items that lost every keyword in sanitization", () => {
		const out = toGeminiSchema({ type: "object", properties: { list: { type: "array", items: { const: "x" } } } });

		expect(out.properties).toEqual({ list: { type: "array", items: { type: "string" } } });
	});

	it("turns a nullable type union into type plus nullable", () => {
		const out = toGeminiSchema({ type: "object", properties: { name: { type: ["string", "null"] } } });

		expect(out.properties).toEqual({ name: { type: "string", nullable: true } });
	});

	it("inlines $ref from $defs and from definitions", () => {
		const out = toGeminiSchema({
			type: "object",
			properties: { a: { $ref: "#/$defs/name" }, b: { $ref: "#/definitions/name" } },
			$defs: { name: { type: "string", minLength: 1 } },
			definitions: { name: { type: "number" } },
		});

		expect(out.properties).toEqual({ a: { type: "string", minLength: 1 }, b: { type: "number" } });
	});

	it("stops a recursive $ref instead of overflowing", () => {
		const out = toGeminiSchema({
			type: "object",
			properties: { node: { $ref: "#/$defs/node" } },
			$defs: { node: { type: "object", properties: { child: { $ref: "#/$defs/node" } } } },
		});

		// the expansion is finite and the innermost reference degrades to {}
		expect(JSON.stringify(out).length).toBeLessThan(10_000);
		expect((out.properties as Record<string, { type?: string }>).node?.type).toBe("object");
	});

	it("degrades an unresolvable or external $ref to an empty schema", () => {
		const out = toGeminiSchema({
			type: "object",
			properties: { a: { $ref: "#/$defs/missing" }, b: { $ref: "https://elsewhere/schema.json" } },
		});

		expect(out.properties).toEqual({ a: {}, b: {} });
	});

	it("recurses through anyOf, oneOf, allOf and not", () => {
		const out = toGeminiSchema({
			type: "object",
			properties: {
				p: {
					anyOf: [{ type: "string", const: "x" }],
					oneOf: [{ type: "number", multipleOf: 3 }],
					allOf: [{ type: "string" }],
					not: { type: "boolean", readOnly: true },
				},
			},
		});

		expect((out.properties as Record<string, unknown>).p).toEqual({
			anyOf: [{ type: "string" }],
			oneOf: [{ type: "number" }],
			allOf: [{ type: "string" }],
			not: { type: "boolean" },
		});
	});

	it("keeps the first schema of a tuple-form items", () => {
		const out = toGeminiSchema({
			type: "object",
			properties: { pair: { type: "array", items: [{ type: "string" }, { type: "number" }] } },
		});

		expect(out.properties).toEqual({ pair: { type: "array", items: { type: "string" } } });
	});

	it("gives a root without type the object it has to be", () => {
		expect(toGeminiSchema({}).type).toBe("object");
	});

	it("never mutates the server's declaration, which raw points at", () => {
		const original = {
			type: "object",
			properties: { list: { type: "array" }, x: { $ref: "#/$defs/x" } },
			$defs: { x: { type: "string" } },
			additionalProperties: false,
		};
		const frozen = JSON.stringify(original);

		toGeminiSchema(original);

		expect(JSON.stringify(original)).toBe(frozen);
	});
});
