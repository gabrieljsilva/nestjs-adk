import { InvalidRowError } from "./errors/invalid-row.error";

/**
 * Reads one row the driver handed back as loose data.
 *
 * SQLite answers values, not types: a column can be missing, null, or hold whatever an
 * older version of this application wrote there. Checking every read here is what keeps
 * `unknown` from travelling into the services as an implicit type.
 */
export class StoreRow {
	public constructor(private readonly row: unknown) {}

	public text(column: string): string {
		const value = this.raw(column);
		if (typeof value !== "string") throw new InvalidRowError(column, "text");
		return value;
	}

	public integer(column: string): number {
		const value = this.raw(column);
		if (typeof value === "number" && Number.isSafeInteger(value)) return value;
		if (typeof value === "bigint" && value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) {
			return Number(value);
		}
		throw new InvalidRowError(column, "an integer");
	}

	/** A price per token is a fraction, so it is stored and read as a real number. */
	public decimal(column: string): number {
		const value = this.raw(column);
		if (typeof value !== "number" || !Number.isFinite(value)) throw new InvalidRowError(column, "a number");
		return value;
	}

	/** SQLite has no boolean: what was written as 1 or 0 comes back as an integer. */
	public flag(column: string): boolean {
		return this.integer(column) !== 0;
	}

	public optionalText(column: string): string | undefined {
		const value = this.raw(column);
		return typeof value === "string" ? value : undefined;
	}

	private raw(column: string): unknown {
		if (typeof this.row !== "object" || this.row === null) throw new InvalidRowError(column, "a row");
		return Reflect.get(this.row, column);
	}
}
