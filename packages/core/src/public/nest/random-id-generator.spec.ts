import { describe, expect, it } from "vitest";
import { RandomIdGenerator } from "./random-id-generator";

describe("RandomIdGenerator", () => {
	it("never answers with the same id twice", () => {
		const ids = new RandomIdGenerator();

		const seen = new Set([ids.next(), ids.next(), ids.next()]);

		expect(seen.size).toBe(3);
	});
});
