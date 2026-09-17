import { InvalidDigestError } from "../errors/invalid-digest.error";

/**
 * Fingerprint of a piece of content, carrying the algorithm that produced it.
 * Two digests only match when both the algorithm and the value match, so a value
 * computed with a different algorithm never passes as equal.
 */
export class ContentDigest {
	private constructor(
		public readonly algorithm: string,
		public readonly value: string,
	) {}

	public static of(algorithm: string, value: string): ContentDigest {
		const normalizedAlgorithm = algorithm.trim().toLowerCase();
		const normalizedValue = value.trim();
		if (normalizedAlgorithm.length === 0 || normalizedValue.length === 0) {
			throw new InvalidDigestError(algorithm, value);
		}
		return new ContentDigest(normalizedAlgorithm, normalizedValue);
	}

	public equals(other: ContentDigest): boolean {
		return this.algorithm === other.algorithm && this.value === other.value;
	}

	public toString(): string {
		return `${this.algorithm}:${this.value}`;
	}
}
