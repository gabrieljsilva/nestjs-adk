import { describe, expect, it } from "vitest";
import { InvalidRowError } from "./errors/invalid-row.error";
import { StoreRow } from "./store-row";

describe("StoreRow", () => {
	it("reads the columns it was given", () => {
		const row = new StoreRow({ id: "A-1042", total_cents: 34900, input_cost: 0.00000061, vision: 1 });

		expect(row.text("id")).toBe("A-1042");
		expect(row.integer("total_cents")).toBe(34900);
		expect(row.decimal("input_cost")).toBe(0.00000061);
		expect(row.flag("vision")).toBe(true);
	});

	it("reads an integer the driver answered as a bigint", () => {
		expect(new StoreRow({ total_cents: 34900n }).integer("total_cents")).toBe(34900);
	});

	it("answers false for a flag stored as zero", () => {
		expect(new StoreRow({ vision: 0 }).flag("vision")).toBe(false);
	});

	it("answers undefined for optional text that is not there", () => {
		expect(new StoreRow({ photo_url: null }).optionalText("photo_url")).toBeUndefined();
		expect(new StoreRow({ photo_url: "https://example.test/a.png" }).optionalText("photo_url")).toBe(
			"https://example.test/a.png",
		);
	});

	it("names the column when it does not hold what was asked for", () => {
		const row = new StoreRow({ id: 7, input_cost: "free" });

		expect(() => row.text("id")).toThrow(InvalidRowError);
		expect(() => row.integer("missing")).toThrow(InvalidRowError);
		expect(() => row.decimal("input_cost")).toThrow(InvalidRowError);
	});

	it("refuses to read anything out of something that is not a row", () => {
		expect(() => new StoreRow(undefined).text("id")).toThrow(InvalidRowError);
	});
});
