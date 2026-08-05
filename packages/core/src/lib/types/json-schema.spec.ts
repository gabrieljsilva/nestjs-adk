import { z } from "zod";
import { isJsonSchema, pruneByProperties } from "./json-schema";

describe("isJsonSchema", () => {
	it("tells a Zod object and a plain schema apart", () => {
		expect(isJsonSchema(z.object({ a: z.string() }))).toBe(false);
		expect(isJsonSchema({ type: "object" })).toBe(true);
	});
});

describe("pruneByProperties: the strip without Zod", () => {
	it("drops keys the model invented when the schema encloses itself", () => {
		const schema = { type: "object", properties: { query: { type: "string" } }, required: ["query"] };

		const pruned = pruneByProperties({ query: "invoices", workspaceId: "someone-elses" }, schema);

		// the server has tenancy of its own: a forged scope key must not reach it
		expect(pruned).toEqual({ query: "invoices" });
	});

	it("keeps a free-form payload intact", () => {
		expect(pruneByProperties({ anything: true }, { type: "object" })).toEqual({ anything: true });
	});

	it("keeps the payload intact when additionalProperties opens the schema", () => {
		const schema = { type: "object", properties: { q: { type: "string" } }, additionalProperties: true };

		// stripping never costs correctness: an open schema legitimately accepts extra keys
		expect(pruneByProperties({ q: "a", extra: 1 }, schema)).toEqual({ q: "a", extra: 1 });
	});

	it("passes non-object inputs through untouched", () => {
		const schema = { type: "object", properties: {} };
		expect(pruneByProperties(null, schema)).toBeNull();
		expect(pruneByProperties([1], schema)).toEqual([1]);
		expect(pruneByProperties("x", schema)).toBe("x");
	});
});
