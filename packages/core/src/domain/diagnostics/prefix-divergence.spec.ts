import { describe, expect, it } from "vitest";
import { PrefixDivergence } from "./prefix-divergence";

describe("PrefixDivergence", () => {
	it("says which section broke, where, and what each side had there", () => {
		const divergence = new PrefixDivergence("instructions", 12, 3, ["today is Monday", "today is Tuesday"]);

		expect(divergence.segment).toBe("instructions");
		expect(divergence.offset).toBe(12);
		expect(divergence.segmentOffset).toBe(3);
		expect(divergence.excerpts).toHaveLength(2);
	});
});
