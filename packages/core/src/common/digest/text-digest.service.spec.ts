import { describe, expect, it } from "vitest";
import { TextDigest } from "./text-digest.service";

describe("TextDigest", () => {
	it("fingerprints the same text the same way, every time", () => {
		expect(TextDigest.fromText("hello").equals(TextDigest.fromText("hello"))).toBe(true);
	});

	it("fingerprints a single changed character differently", () => {
		expect(TextDigest.fromText("hello").equals(TextDigest.fromText("hellO"))).toBe(false);
	});

	it("names the algorithm in the digest, so nothing compares across algorithms by accident", () => {
		expect(TextDigest.fromText("hello").algorithm).toBe("sha256");
	});

	it("fingerprints empty text rather than refusing it", () => {
		expect(TextDigest.fromText("").value.length).toBeGreaterThan(0);
	});
});
