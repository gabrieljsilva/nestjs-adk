import { describe, expect, it } from "vitest";
import { CanonicalJson } from "./canonical-json";

describe("CanonicalJson", () => {
	it("orders keys so insertion order cannot change the text", () => {
		expect(CanonicalJson.stringify({ b: 1, a: 2 })).toBe(CanonicalJson.stringify({ a: 2, b: 1 }));
	});

	it("orders keys of nested objects too", () => {
		expect(CanonicalJson.stringify({ outer: { z: 1, a: 2 } })).toBe('{"outer":{"a":2,"z":1}}');
	});

	it("omits undefined instead of writing null", () => {
		expect(CanonicalJson.stringify({ a: undefined, b: 1 })).toBe('{"b":1}');
	});

	it("keeps array order, which is content and not layout", () => {
		expect(CanonicalJson.stringify([3, 1, 2])).toBe("[3,1,2]");
	});

	it("normalizes objects inside arrays", () => {
		expect(CanonicalJson.stringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
	});

	it("passes primitives through", () => {
		expect(CanonicalJson.stringify("text")).toBe('"text"');
		expect(CanonicalJson.stringify(42)).toBe("42");
		expect(CanonicalJson.stringify(null)).toBe("null");
	});
});
