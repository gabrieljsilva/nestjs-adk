import { Embedder, EmbeddingVector } from "@nestjs-adk/core";

/** Enough buckets to keep unrelated words apart, small enough to stay readable in a failure. */
const DIMENSIONS = 64;

/** FNV-1a, chosen because it is short, stable and identical in every process. */
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/**
 * An embedder that needs no provider, no key and no network.
 *
 * It hashes words into buckets, so texts that share words point in similar directions and
 * texts that share none do not. That is not meaning, but it is the part of meaning a test
 * can assert without paying for a model: an answer that mentions the order and the refund
 * scores close to one that mentions the order and the refund, and far from one about the
 * weather.
 *
 * The same text always produces the same vector, in this process and in any other, which
 * is what makes an expectation about similarity reproducible.
 */
export class TestingEmbedder extends Embedder {
	public async embed(text: string): Promise<EmbeddingVector> {
		const buckets = new Array<number>(DIMENSIONS).fill(0);
		for (const word of this.wordsOf(text)) {
			const hash = this.hashOf(word);
			const bucket = hash % DIMENSIONS;
			// The sign comes from the hash too, so two different words in one bucket do not
			// simply add up into a stronger signal for a word that was never there.
			buckets[bucket] = (buckets[bucket] ?? 0) + (hash % 2 === 0 ? 1 : -1);
		}
		return EmbeddingVector.of(buckets.every((value) => value === 0) ? this.hashOnly(text) : buckets);
	}

	private wordsOf(text: string): readonly string[] {
		return text
			.toLowerCase()
			.split(/[^\p{L}\p{N}]+/u)
			.filter((word) => word.length > 0);
	}

	/** A text with no words still gets a direction of its own, rather than pointing nowhere. */
	private hashOnly(text: string): readonly number[] {
		const buckets = new Array<number>(DIMENSIONS).fill(0);
		const hash = this.hashOf(text);
		buckets[hash % DIMENSIONS] = 1;
		return buckets;
	}

	private hashOf(value: string): number {
		let hash = FNV_OFFSET;
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, FNV_PRIME);
		}
		return Math.abs(hash);
	}
}
