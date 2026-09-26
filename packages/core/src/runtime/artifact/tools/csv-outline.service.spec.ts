import { describe, expect, it } from "vitest";
import { CsvOutline } from "./csv-outline.service";
import { CsvTable } from "./csv-table.value-object";

function tableOf(text: string): CsvTable {
	const table = CsvTable.fromText(text);
	if (table === undefined) throw new Error("expected a table");
	return table;
}

describe("CsvOutline", () => {
	it("names every column with a type read from its values and a few of them as a sample", () => {
		const outline = new CsvOutline().build(
			tableOf("id,total,when,paid,note\n1,3.5,2026-01-02,true,late\n2,4,2026-01-03,false,"),
		);

		expect(outline.rows).toBe(2);
		const columns = outline.columns as { name: string; type: string; empty: number; sample: string[] }[];
		expect(columns.map((column) => column.name)).toEqual(["id", "total", "when", "paid", "note"]);
		expect(columns.map((column) => column.type)).toEqual(["integer", "number", "date", "boolean", "text"]);
		expect(columns[4]?.empty).toBe(1);
		expect(columns[0]?.sample).toEqual(["1", "2"]);
	});

	it("calls a column empty when nothing in it was filled", () => {
		const outline = new CsvOutline().build(tableOf("a,b\n1,\n2,"));

		expect((outline.columns as { type: string }[])[1]?.type).toBe("empty");
	});
});
