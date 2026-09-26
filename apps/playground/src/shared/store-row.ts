import { InvalidRowError } from "./errors/invalid-row.error";

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

	public decimal(column: string): number {
		const value = this.raw(column);
		if (typeof value !== "number" || !Number.isFinite(value)) throw new InvalidRowError(column, "a number");
		return value;
	}

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
