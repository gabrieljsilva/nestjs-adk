import { describe, expect, it } from "vitest";
import { JsonOutline } from "./json-outline.service";

const outline = new JsonOutline();

describe("JsonOutline", () => {
	it("names the keys of an object and the type behind each one", () => {
		expect(outline.build({ id: 1, name: "ada", active: true, tags: null }, 1)).toEqual({
			type: "object",
			keys: 4,
			properties: { id: "number", name: "string(3 characters)", active: "boolean", tags: "null" },
			omittedKeys: 0,
		});
	});

	it("counts an array instead of listing what is in it", () => {
		const built = outline.build([1, 2, 3], 1) as Record<string, unknown>;

		expect(built.type).toBe("array");
		expect(built.length).toBe(3);
	});

	it("stops at the depth it was given, saying what it stopped on", () => {
		const built = outline.build({ orders: [{ id: 1 }] }, 2) as Record<string, unknown>;

		expect((built.properties as Record<string, unknown>).orders).toEqual({
			type: "array",
			length: 1,
			items: ["object(1 keys)"],
			omittedItems: 0,
		});
	});

	it("says what a container is even when there is no room to open it", () => {
		expect(outline.build({ a: 1, b: 2 }, 0)).toBe("object(2 keys)");
		expect(outline.build([1, 2, 3], 0)).toBe("array(3 items)");
	});

	it("names a bounded number of entries and counts the rest, so a wide object stays small", () => {
		const wide: Record<string, number> = {};
		for (let at = 0; at < 100; at += 1) wide[`key-${at}`] = at;

		const built = outline.build(wide, 1) as Record<string, unknown>;

		expect(built.keys).toBe(100);
		expect(Object.keys(built.properties as Record<string, unknown>)).toHaveLength(40);
		expect(built.omittedKeys).toBe(60);
	});

	it("never carries a value, which is the thing that did not fit in the first place", () => {
		expect(JSON.stringify(outline.build({ secret: "hunter2" }, 3))).not.toContain("hunter2");
	});
});
