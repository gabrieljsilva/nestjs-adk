import { Embedder, EmbeddingVector } from "@nestjs-adk/core";

const DIMENSIONS = 64;

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/**
 * Deterministic vectors derived from the text itself, so a similarity assertion costs nothing
 * and answers the same on every run. Similar texts land near each other; the numbers mean
 * nothing outside a comparison.
 */
export class TestingEmbedder extends Embedder {
	public async embed(text: string): Promise<EmbeddingVector> {
		const buckets = new Array<number>(DIMENSIONS).fill(0);
		for (const word of this.splitWords(text)) {
			const hash = this.calculateHash(word);
			const bucket = hash % DIMENSIONS;
			buckets[bucket] = (buckets[bucket] ?? 0) + (hash % 2 === 0 ? 1 : -1);
		}
		return new EmbeddingVector(buckets.every((value) => value === 0) ? this.hashOnly(text) : buckets);
	}

	private splitWords(text: string): readonly string[] {
		return text
			.toLowerCase()
			.split(/[^\p{L}\p{N}]+/u)
			.filter((word) => word.length > 0);
	}

	private hashOnly(text: string): readonly number[] {
		const buckets = new Array<number>(DIMENSIONS).fill(0);
		const hash = this.calculateHash(text);
		buckets[hash % DIMENSIONS] = 1;
		return buckets;
	}

	private calculateHash(value: string): number {
		let hash = FNV_OFFSET;
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, FNV_PRIME);
		}
		return Math.abs(hash);
	}
}
