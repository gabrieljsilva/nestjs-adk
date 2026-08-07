import { describe, expect, it } from "vitest";
import { InvalidStoredRowError } from "./errors/invalid-stored-row.error";
import { StoredRow } from "./stored-row";

describe("StoredRow", () => {
	it("reads text and integers a driver handed back", () => {
		const row = new StoredRow({ id: "s-1", revision: 4 });

		expect(row.text("id")).toBe("s-1");
		expect(row.integer("revision")).toBe(4);
	});

	it("accepts a bigint the driver used for an integer column", () => {
		expect(new StoredRow({ revision: 7n }).integer("revision")).toBe(7);
	});

	it("says which column broke instead of failing later as undefined", () => {
		expect(() => new StoredRow({ id: 4 }).text("id")).toThrow(InvalidStoredRowError);
		expect(() => new StoredRow({}).integer("revision")).toThrow(/revision/);
	});

	it("treats a null optional column as absent", () => {
		expect(new StoredRow({ owner: null }).optionalText("owner")).toBeUndefined();
		expect(new StoredRow({ owner: "gabriel" }).optionalText("owner")).toBe("gabriel");
	});

	/** SQLite has no boolean column, so a flag comes back as the integer it was written as. */
	it("reads a boolean written as a boolean or as one and zero", () => {
		expect(new StoredRow({ failed: true }).boolean("failed")).toBe(true);
		expect(new StoredRow({ failed: 1 }).boolean("failed")).toBe(true);
		expect(new StoredRow({ failed: 0 }).boolean("failed")).toBe(false);
		expect(() => new StoredRow({ failed: "yes" }).boolean("failed")).toThrow(InvalidStoredRowError);
	});

	it("parses a json column into a plain record, refusing anything else", () => {
		expect(new StoredRow({ payload: '{"a":1}' }).json("payload")).toEqual({ a: 1 });
		expect(() => new StoredRow({ payload: "[1]" }).json("payload")).toThrow(InvalidStoredRowError);
	});

	/** A driver with a native json column hands the value back already parsed. */
	it("takes a json column the driver already parsed", () => {
		expect(new StoredRow({ payload: { a: 1 } }).json("payload")).toEqual({ a: 1 });
		expect(new StoredRow({ blocks: [{ a: 1 }] }).array("blocks")).toEqual([{ a: 1 }]);
	});

	it("reads a json array, whether it arrived as text or as a value", () => {
		expect(new StoredRow({ blocks: "[1,2]" }).array("blocks")).toEqual([1, 2]);
		expect(() => new StoredRow({ blocks: '{"a":1}' }).array("blocks")).toThrow(InvalidStoredRowError);
	});

	it("refuses text that does not parse as json at all", () => {
		expect(() => new StoredRow({ payload: "not json" }).json("payload")).toThrow(InvalidStoredRowError);
	});

	it("refuses to read from something that is not a row at all", () => {
		expect(() => new StoredRow(undefined).text("id")).toThrow(InvalidStoredRowError);
	});
});
