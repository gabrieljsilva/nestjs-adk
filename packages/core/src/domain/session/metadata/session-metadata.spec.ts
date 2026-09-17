import { describe, expect, it } from "vitest";
import { InvalidMetadataValueError } from "../errors/invalid-metadata-value.error";
import { MetadataValueTooLargeError } from "../errors/metadata-value-too-large.error";
import { MetadataKey } from "./metadata-key";
import type { MetadataValue } from "./metadata-value";
import { SessionMetadata } from "./session-metadata";

/** What an unvalidated boundary hands over: a value the compiler would never have accepted. */
function untyped(value: unknown): MetadataValue {
	const box: Record<string, MetadataValue> = {};
	Object.defineProperty(box, "held", { value, enumerable: true });
	return box.held ?? null;
}

const OWNER = MetadataKey.fromName<string>("ownerId", (value): value is string => typeof value === "string");

describe("SessionMetadata", () => {
	it("starts empty", () => {
		expect(SessionMetadata.empty().isEmpty).toBe(true);
		expect(SessionMetadata.empty().size).toBe(0);
	});

	it("never mutates the instance it came from", () => {
		const first = SessionMetadata.empty();
		const second = first.with(OWNER, "ana");

		expect(first.has(OWNER)).toBe(false);
		expect(second.find(OWNER)).toBe("ana");
	});

	it("keeps the last write of a key", () => {
		expect(SessionMetadata.empty().with(OWNER, "ana").with(OWNER, "bruno").find(OWNER)).toBe("bruno");
	});

	it("drops a key it is told to forget", () => {
		expect(SessionMetadata.empty().with(OWNER, "ana").without(OWNER).find(OWNER)).toBeUndefined();
	});

	it("forgetting a key it never had changes nothing", () => {
		expect(SessionMetadata.empty().without("absent").size).toBe(0);
	});

	it("answers nothing for a value its key does not recognise", () => {
		expect(SessionMetadata.empty().with("ownerId", 42).find(OWNER)).toBeUndefined();
	});

	it("reads by a plain name as well as by a key", () => {
		expect(SessionMetadata.empty().with("ownerId", "ana").has("ownerId")).toBe(true);
	});

	it("builds from what an application wrote inline", () => {
		const metadata = SessionMetadata.fromRecord({ ownerId: "ana", locale: "pt-BR" });

		expect(metadata.find(OWNER)).toBe("ana");
		expect(metadata.size).toBe(2);
	});

	it("orders entries by key, so the serialization never depends on write order", () => {
		const metadata = SessionMetadata.empty().with("zeta", 1).with("alpha", 2);

		expect(metadata.entries().map(([key]) => key)).toEqual(["alpha", "zeta"]);
	});

	it("holds nested JSON whole", () => {
		const value: MetadataValue = { tier: "gold", tags: ["a", "b"], active: true, seat: null };

		expect(SessionMetadata.empty().with("plan", value).find(MetadataKey.fromName("plan"))).toEqual(value);
	});

	it("refuses a value that is not JSON", () => {
		expect(() => SessionMetadata.empty().with("opened", untyped(new Date()))).toThrow(InvalidMetadataValueError);
	});

	it("refuses a number no row can hold", () => {
		expect(() => SessionMetadata.empty().with("points", Number.NaN)).toThrow(InvalidMetadataValueError);
	});

	it("refuses something nested far deeper than a value ever is", () => {
		const cycle: Record<string, unknown> = {};
		cycle.self = cycle;

		expect(() => SessionMetadata.empty().with("cycle", untyped(cycle))).toThrow(InvalidMetadataValueError);
	});

	it("refuses a value larger than one session should carry", () => {
		const oversized = "x".repeat(SessionMetadata.maxValueBytes);

		expect(() => SessionMetadata.empty().with("blob", oversized)).toThrow(MetadataValueTooLargeError);
	});

	it("accepts a value that fits exactly", () => {
		const fitting = "x".repeat(SessionMetadata.maxValueBytes - 2);

		expect(SessionMetadata.empty().with("blob", fitting).size).toBe(1);
	});
});
