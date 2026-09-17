import { InvalidDigestError } from "../errors/invalid-digest.error";

export class ContentDigest {
	public readonly algorithm: string;
	public readonly value: string;

	public constructor(algorithm: string, value: string) {
		const normalizedAlgorithm = algorithm.trim().toLowerCase();
		const normalizedValue = value.trim();
		if (normalizedAlgorithm.length === 0 || normalizedValue.length === 0) {
			throw new InvalidDigestError(algorithm, value);
		}
		this.algorithm = normalizedAlgorithm;
		this.value = normalizedValue;
	}

	public equals(other: ContentDigest): boolean {
		return this.algorithm === other.algorithm && this.value === other.value;
	}

	public toString(): string {
		return `${this.algorithm}:${this.value}`;
	}
}
