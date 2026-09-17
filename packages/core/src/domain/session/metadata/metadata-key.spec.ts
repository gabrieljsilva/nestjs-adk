import { describe, expect, it } from "vitest";
import { InvalidMetadataKeyError } from "../errors/invalid-metadata-key.error";
import { MetadataKey } from "./metadata-key";
import type { MetadataValue } from "./metadata-value";

const isText = (value: MetadataValue): value is string => typeof value === "string";

describe("MetadataKey", () => {
	it("trims the name it is declared with", () => {
		expect(MetadataKey.fromName("  ownerId  ").name).toBe("ownerId");
	});

	it("refuses a name that holds nothing", () => {
		expect(() => MetadataKey.fromName("   ")).toThrow(InvalidMetadataKeyError);
	});

	it("accepts anything when it was declared without a guard", () => {
		expect(MetadataKey.fromName("ownerId").accepts(42)).toBe(true);
	});

	it("accepts only what its guard recognises", () => {
		const key = MetadataKey.fromName("ownerId", isText);

		expect(key.accepts("ana")).toBe(true);
		expect(key.accepts(42)).toBe(false);
	});

	it("compares by name", () => {
		expect(MetadataKey.fromName("ownerId").equals(MetadataKey.fromName("ownerId"))).toBe(true);
		expect(MetadataKey.fromName("ownerId").equals(MetadataKey.fromName("tenantId"))).toBe(false);
	});

	it("reads as its name", () => {
		expect(`${MetadataKey.fromName("ownerId")}`).toBe("ownerId");
	});
});
