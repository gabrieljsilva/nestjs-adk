import { Similarity } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { TestingEmbedder } from "./testing-embedder";

const embedder = new TestingEmbedder();
const similarity = new Similarity();

async function closeness(left: string, right: string): Promise<number> {
	return similarity.cosine(await embedder.embed(left), await embedder.embed(right));
}

describe("TestingEmbedder", () => {
	it("gives the same text the same vector, every time and in every process", async () => {
		const first = await embedder.embed("the order was refunded");
		const second = await new TestingEmbedder().embed("the order was refunded");

		expect(first.values).toEqual(second.values);
	});

	it("scores one for the same text", async () => {
		expect(await closeness("the order shipped", "the order shipped")).toBeCloseTo(1);
	});

	it("puts texts that share words closer than texts that share none", async () => {
		const related = await closeness("the order was refunded", "the order was refunded yesterday");
		const unrelated = await closeness("the order was refunded", "clouds gather over the mountain");

		expect(related).toBeGreaterThan(unrelated);
	});

	it("ignores case and punctuation, which are not what a text is about", async () => {
		expect(await closeness("Refund the order.", "refund the order")).toBeCloseTo(1);
	});

	it("gives every vector the same dimension, so any two can be compared", async () => {
		const short = await embedder.embed("hi");
		const long = await embedder.embed("a much longer sentence with a good number of words in it");

		expect(short.dimension).toBe(long.dimension);
	});

	it("gives a text with no words a direction of its own", async () => {
		const vector = await embedder.embed("!!!");

		expect(vector.magnitude).toBeGreaterThan(0);
	});
});
