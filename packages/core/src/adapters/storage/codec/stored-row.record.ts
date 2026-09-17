import { InvalidStoredRowError } from "./errors/invalid-stored-row.error";

/**
 * One row a storage adapter read, with a typed accessor per column. Every accessor raises
 * `InvalidStoredRowError` naming the column and what was expected, so a codec never has to
 * narrow an `unknown` by hand.
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
