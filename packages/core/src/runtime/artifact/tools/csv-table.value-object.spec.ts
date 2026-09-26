import { describe, expect, it } from "vitest";
import { CsvTable } from "./csv-table.value-object";

describe("CsvTable", () => {
	it("reads the header and the rows under it", () => {
		const table = CsvTable.fromText("id,name,total\n1,ada,349\n2,bob,12");

		expect(table?.header).toEqual(["id", "name", "total"]);
		expect(table?.rowCount).toBe(2);
		expect(table?.rows[1]).toEqual(["2", "bob", "12"]);
	});

	it("keeps a comma, a quote and a line break that sit inside quotes", () => {
		const table = CsvTable.fromText('id,note\n1,"late, very"\n2,"she said ""no"""\n3,"two\nlines"');

		expect(table?.rows.map((row) => row[1])).toEqual(["late, very", 'she said "no"', "two\nlines"]);
	});

	it("accepts Windows line endings and a trailing newline", () => {
		const table = CsvTable.fromText("a,b\r\n1,2\r\n");

		expect(table?.rowCount).toBe(1);
		expect(table?.rows[0]).toEqual(["1", "2"]);
	});

	it("answers a column by name and by position", () => {
		const table = CsvTable.fromText("id,total\n1,349\n2,12");

		expect(table?.columnIndex("total")).toBe(1);
		expect(table?.columnIndex("missing")).toBe(-1);
		expect(table?.column(1)).toEqual(["349", "12"]);
	});

	it("is not a table when there is one column, because prose has no commas either", () => {
		expect(CsvTable.fromText("# Title\n\nsome prose\nmore prose")).toBeUndefined();
	});

	it("is not a table when the rows do not agree with the header on how many cells there are", () => {
		expect(CsvTable.fromText("a,b\nx\ny, z, w\nq\nr")).toBeUndefined();
	});
});
