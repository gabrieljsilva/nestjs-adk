import { describe, expect, it } from "vitest";
import { InvalidStoredRowError } from "./errors/invalid-stored-row.error";
import { SqliteRow } from "./sqlite-row";

describe("SqliteRow", () => {
	it("reads text and integers a driver handed back", () => {
		const row = new SqliteRow({ id: "s-1", revision: 4 });

		expect(row.text("id")).toBe("s-1");
		expect(row.integer("revision")).toBe(4);
	});

	it("accepts a bigint the driver used for an integer column", () => {
		expect(new SqliteRow({ revision: 7n }).integer("revision")).toBe(7);
	});

	it("says which column broke instead of failing later as undefined", () => {
		expect(() => new SqliteRow({ id: 4 }).text("id")).toThrow(InvalidStoredRowError);
		expect(() => new SqliteRow({}).integer("revision")).toThrow(/revision/);
	});

	it("treats a null optional column as absent", () => {
		expect(new SqliteRow({ owner: null }).optionalText("owner")).toBeUndefined();
		expect(new SqliteRow({ owner: "gabriel" }).optionalText("owner")).toBe("gabriel");
	});

	it("parses a json column into a plain record, refusing anything else", () => {
		expect(new SqliteRow({ payload: '{"a":1}' }).json("payload")).toEqual({ a: 1 });
		expect(() => new SqliteRow({ payload: "[1]" }).json("payload")).toThrow(InvalidStoredRowError);
	});

	it("refuses to read from something that is not a row at all", () => {
		expect(() => new SqliteRow(undefined).text("id")).toThrow(InvalidStoredRowError);
	});
});
