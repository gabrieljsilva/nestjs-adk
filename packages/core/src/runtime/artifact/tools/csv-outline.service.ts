import type { CsvTable } from "./csv-table.value-object";

const SAMPLED_ROWS = 50;
const SAMPLE_VALUES = 3;

export class CsvOutline {
	public build(table: CsvTable): Record<string, unknown> {
		return {
			rows: table.rowCount,
			columns: table.header.map((name, index) => this.describeColumn(name, table.column(index))),
		};
	}

	private describeColumn(name: string, values: readonly string[]): Record<string, unknown> {
		const sampled = values.slice(0, SAMPLED_ROWS);
		const filled = sampled.filter((value) => value.trim().length > 0);
		return {
			name,
			type: describeType(filled),
			empty: sampled.length - filled.length,
			sample: filled.slice(0, SAMPLE_VALUES),
		};
	}
}

function describeType(values: readonly string[]): string {
	if (values.length === 0) return "empty";
	if (values.every((value) => /^-?\d+$/.test(value.trim()))) return "integer";
	if (values.every((value) => /^-?\d+(\.\d+)?$/.test(value.trim()))) return "number";
	if (values.every((value) => /^\d{4}-\d{2}-\d{2}/.test(value.trim()))) return "date";
	if (values.every((value) => /^(true|false)$/i.test(value.trim()))) return "boolean";
	return "text";
}
