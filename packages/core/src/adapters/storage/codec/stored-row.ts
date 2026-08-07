import { InvalidStoredRowError } from "./errors/invalid-stored-row.error";

/**
 * Reads a row a driver handed back as loose data.
 *
 * A database returns values, not types: a column can be missing, null, or hold whatever
 * an older version of this code wrote there. Every read is checked here so nothing
 * untyped travels further, and a row that cannot be trusted says which column broke it
 * rather than failing three layers later as an undefined.
 *
 * Drivers disagree about JSON. SQLite hands back the text that was written, a driver with
 * a native json column hands back the parsed value, and both are accepted, because which
 * one a column arrives as is the adapter's business and never the codec's.
 */
export class StoredRow {
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

	public boolean(column: string): boolean {
		const value = this.raw(column);
		if (typeof value === "boolean") return value;
		if (value === 0 || value === 1) return value === 1;
		throw new InvalidStoredRowError(column, "boolean");
	}

	public optionalText(column: string): string | undefined {
		const value = this.raw(column);
		return typeof value === "string" ? value : undefined;
	}

	public json(column: string): Record<string, unknown> {
		const parsed = this.parsed(column);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new InvalidStoredRowError(column, "json object");
		}
		return { ...parsed };
	}

	public array(column: string): unknown[] {
		const parsed = this.parsed(column);
		if (!Array.isArray(parsed)) throw new InvalidStoredRowError(column, "json array");
		return [...parsed];
	}

	private parsed(column: string): unknown {
		const value = this.raw(column);
		if (typeof value !== "string") return value;
		try {
			return JSON.parse(value);
		} catch {
			throw new InvalidStoredRowError(column, "json");
		}
	}

	private raw(column: string): unknown {
		if (typeof this.row !== "object" || this.row === null) throw new InvalidStoredRowError(column, "a row");
		return Reflect.get(this.row, column);
	}
}
