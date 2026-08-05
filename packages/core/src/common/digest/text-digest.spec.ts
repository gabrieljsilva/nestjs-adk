import { describe, expect, it } from "vitest";
import { TextDigest } from "./text-digest";

describe("TextDigest", () => {
	it("fingerprints the same text the same way, every time", () => {
		expect(TextDigest.of("hello").equals(TextDigest.of("hello"))).toBe(true);
	});

	it("fingerprints a single changed character differently", () => {
		expect(TextDigest.of("hello").equals(TextDigest.of("hellO"))).toBe(false);
	});

	it("names the algorithm in the digest, so nothing compares across algorithms by accident", () => {
		expect(TextDigest.of("hello").algorithm).toBe("sha256");
	});

	it("fingerprints empty text rather than refusing it", () => {
		expect(TextDigest.of("").value.length).toBeGreaterThan(0);
	});
});
