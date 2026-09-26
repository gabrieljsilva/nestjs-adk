const MIN_COLUMNS = 2;
const SAMPLED_LINES = 20;
const MIN_REGULAR_SHARE = 0.8;

export class CsvTable {
	private constructor(
		public readonly header: readonly string[],
		public readonly rows: readonly (readonly string[])[],
	) {}

	public static fromText(text: string): CsvTable | undefined {
		const records = CsvTable.parse(text);
		const header = records[0];
		if (header === undefined || header.length < MIN_COLUMNS) return undefined;
		const sampled = records.slice(0, SAMPLED_LINES);
		const regular = sampled.filter((record) => record.length === header.length).length;
		if (regular / sampled.length < MIN_REGULAR_SHARE) return undefined;
		return new CsvTable(header, records.slice(1));
	}

	public get rowCount(): number {
		return this.rows.length;
	}

	public columnIndex(name: string): number {
		return this.header.indexOf(name);
	}

	public column(index: number): readonly string[] {
		return this.rows.map((row) => row[index] ?? "");
	}

	private static parse(text: string): string[][] {
		const records: string[][] = [];
		let record: string[] = [];
		let cell = "";
		let quoted = false;
		for (let at = 0; at < text.length; at += 1) {
			const character = text[at];
			if (quoted) {
				if (character === '"' && text[at + 1] === '"') {
					cell += '"';
					at += 1;
				} else if (character === '"') quoted = false;
				else cell += character;
				continue;
			}
			if (character === '"') quoted = true;
			else if (character === ",") {
				record.push(cell);
				cell = "";
			} else if (character === "\n" || character === "\r") {
				if (character === "\r" && text[at + 1] === "\n") at += 1;
				record.push(cell);
				records.push(record);
				record = [];
				cell = "";
			} else cell += character;
		}
		if (cell.length > 0 || record.length > 0) {
			record.push(cell);
			records.push(record);
		}
		return records;
	}
}
