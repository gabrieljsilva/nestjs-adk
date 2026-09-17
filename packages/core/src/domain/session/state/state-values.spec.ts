import { describe, expect, it } from "vitest";
import { StateValues } from "./state-values";

describe("StateValues", () => {
	it("starts empty", () => {
		expect(StateValues.empty().size).toBe(0);
	});

	it("never mutates the instance it came from", () => {
		const first = StateValues.empty();
		const second = first.with("plan", "premium");

		expect(first.size).toBe(0);
		expect(second.get("plan")).toBe("premium");
		expect(second).not.toBe(first);
	});

	it("replaces the value of an existing key", () => {
		const values = StateValues.of([["plan", "free"]]).with("plan", "premium");

		expect(values.get("plan")).toBe("premium");
		expect(values.size).toBe(1);
	});

	it("removes a key without touching the previous instance", () => {
		const before = StateValues.of([
			["a", "1"],
			["b", "2"],
		]);
		const after = before.without("a");

		expect(after.get("a")).toBeUndefined();
		expect(before.get("a")).toBe("1");
	});

	it("answers undefined for a key it does not hold", () => {
		expect(StateValues.empty().get("missing")).toBeUndefined();
	});

	it("orders entries by key so serialization is stable", () => {
		const values = StateValues.of([
			["zeta", "3"],
			["alpha", "1"],
			["mid", "2"],
		]);

		expect(values.entries()).toEqual([
			["alpha", "1"],
			["mid", "2"],
			["zeta", "3"],
		]);
	});

	it("produces the same entries regardless of insertion order", () => {
		const one = StateValues.empty().with("b", "2").with("a", "1");
		const other = StateValues.empty().with("a", "1").with("b", "2");

		expect(one.entries()).toEqual(other.entries());
	});
});
