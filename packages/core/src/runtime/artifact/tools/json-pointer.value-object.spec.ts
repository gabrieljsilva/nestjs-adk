import { describe, expect, it } from "vitest";
import { JsonPointer } from "./json-pointer.value-object";

const document = {
	orders: [{ id: "A-1", total: 349 }, { id: "A-2" }],
	"a/b": "slash",
	"m~n": "tilde",
	empty: "",
	nothing: null,
};

/** The examples of RFC 6901, which is what "JSON Pointer only" has to mean. */
describe("JsonPointer", () => {
	it("reads the whole document for the empty pointer", () => {
		expect(JsonPointer.fromText("")?.resolve(document)).toBe(document);
	});

	it("walks names and indices", () => {
		expect(JsonPointer.fromText("/orders/0/total")?.resolve(document)).toBe(349);
		expect(JsonPointer.fromText("/orders/1/id")?.resolve(document)).toBe("A-2");
	});

	it("unescapes a slash and a tilde in a name", () => {
		expect(JsonPointer.fromText("/a~1b")?.resolve(document)).toBe("slash");
		expect(JsonPointer.fromText("/m~0n")?.resolve(document)).toBe("tilde");
	});

	it("answers nothing for an address the document does not have", () => {
		expect(JsonPointer.fromText("/orders/9")?.resolve(document)).toBeUndefined();
		expect(JsonPointer.fromText("/orders/1/total")?.resolve(document)).toBeUndefined();
		expect(JsonPointer.fromText("/missing")?.resolve(document)).toBeUndefined();
		expect(JsonPointer.fromText("/nothing/deeper")?.resolve(document)).toBeUndefined();
	});

	it("tells a value that is there from one that is not", () => {
		expect(JsonPointer.fromText("/empty")?.resolve(document)).toBe("");
		expect(JsonPointer.fromText("/nothing")?.resolve(document)).toBeNull();
	});

	it("refuses an index that is not one, so nothing walks into a prototype", () => {
		expect(JsonPointer.fromText("/orders/01")?.resolve(document)).toBeUndefined();
		expect(JsonPointer.fromText("/orders/length")?.resolve(document)).toBeUndefined();
		expect(JsonPointer.fromText("/orders/0/constructor")?.resolve(document)).toBeUndefined();
		expect(JsonPointer.fromText("/__proto__")?.resolve(document)).toBeUndefined();
	});

	it("is not a pointer unless it is written as one", () => {
		expect(JsonPointer.fromText("orders/0")).toBeUndefined();
		expect(JsonPointer.fromText("$.orders[?(@.total>100)]")).toBeUndefined();
	});

	it("reads back as it was written", () => {
		expect(JsonPointer.fromText("/a~1b")?.toString()).toBe("/a~1b");
		expect(JsonPointer.fromText("/orders/0/total")?.toString()).toBe("/orders/0/total");
		expect(JsonPointer.fromText("")?.toString()).toBe("");
	});
});
