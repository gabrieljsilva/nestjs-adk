import { InvalidMetadataKeyError } from "../errors/invalid-metadata-key.error";
import type { MetadataValue } from "./metadata-value.value-object";

/**
 * The name one piece of session metadata is kept under, with the type it holds.
 *
 * Declared without a guard, the key trusts whoever wrote the value; declared with one, a value
 * that came back as something else reads as absent rather than as the wrong type.
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

	public accepts(value: MetadataValue): value is T {
		return this.guard(value);
	}

	public equals(other: MetadataKey): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}

	private static anyValue<T extends MetadataValue>(_value: MetadataValue): _value is T {
		return true;
	}
}
