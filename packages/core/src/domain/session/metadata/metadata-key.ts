import { InvalidMetadataKeyError } from "../errors/invalid-metadata-key.error";
import type { MetadataValue } from "./metadata-value";

/**
 * The name one piece of session metadata is kept under, with the type it holds.
 *
 * A raw string would make every read answer `MetadataValue`, and every caller would then
 * narrow it again at the point of use, which is the one place that has the least to go on. A
 * key declared once, next to whatever owns the concept, carries that decision instead.
 *
 * The guard is what makes the type honest. Declared without one, a key trusts whoever wrote
 * the value, which is fine for a key an application writes and reads itself; declared with
 * one, a value that came back as something else reads as absent rather than as the wrong
 * type, which is what a journal written by an older build can hand back.
 */
export class MetadataKey<T extends MetadataValue = MetadataValue> {
	private constructor(
		public readonly name: string,
		private readonly guard: (value: MetadataValue) => value is T,
	) {}

	public static fromName<T extends MetadataValue = MetadataValue>(
		name: string,
		guard: (value: MetadataValue) => value is T = MetadataKey.anyValue,
	): MetadataKey<T> {
		const trimmed = name.trim();
		if (trimmed.length === 0) throw new InvalidMetadataKeyError(name);
		return new MetadataKey(trimmed, guard);
	}

	/** Whether a stored value is the one this key promised, which is what a read is allowed to return. */
	public accepts(value: MetadataValue): value is T {
		return this.guard(value);
	}

	public equals(other: MetadataKey): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}

	/** The default: a key with no guard trusts what it reads, and says so by being the default. */
	private static anyValue<T extends MetadataValue>(_value: MetadataValue): _value is T {
		return true;
	}
}
