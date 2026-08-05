import { InvalidStoredRowError } from "./errors/invalid-stored-row.error";

/**
 * Reads a row a driver handed back as loose data.
 *
 * A database returns values, not types: a column can be missing, null, or hold whatever
 * an older version of this code wrote there. Every read is checked here so nothing
 * untyped travels further, and a row that cannot be trusted says which column broke it
 * rather than failing three layers later as an undefined.
 */
export class SqliteRow {
	public constructor(private readonly row: unknown) {}

	public text(column: string): string {
		const value = this.raw(column);
		if (typeof value !== "string") throw new InvalidStoredRowError(column, "text");
		return value;
	}

	public integer(column: string): number {
		const value = this.raw(column);
		if (typeof value === "number" && Number.isSafeInteger(value)) return value;
		if (typeof value === "bigint" && value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) {
			return Number(value);
		}
		throw new InvalidStoredRowError(column, "integer");
	}

	public optionalText(column: string): string | undefined {
		const value = this.raw(column);
		return typeof value === "string" ? value : undefined;
	}

	public json(column: string): Record<string, unknown> {
		const parsed: unknown = JSON.parse(this.text(column));
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new InvalidStoredRowError(column, "json object");
		}
		return { ...parsed };
	}

	private raw(column: string): unknown {
		if (typeof this.row !== "object" || this.row === null) throw new InvalidStoredRowError(column, "a row");
		return Reflect.get(this.row, column);
	}
}
