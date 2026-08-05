import { describe, expect, it } from "vitest";
import { DeepFreeze } from "./deep-freeze";

describe("DeepFreeze", () => {
	it("freezes the object itself", () => {
		expect(Object.isFrozen(DeepFreeze.apply({ a: 1 }))).toBe(true);
	});

	it("freezes nested objects and arrays", () => {
		const frozen = DeepFreeze.apply({ list: [{ deep: 1 }] });

		expect(Object.isFrozen(frozen.list)).toBe(true);
		expect(Object.isFrozen(frozen.list[0])).toBe(true);
	});

	it("freezes class instances reachable from the value", () => {
		class Inner {
			public value = 1;
		}
		const frozen = DeepFreeze.apply({ inner: new Inner() });

		expect(Object.isFrozen(frozen.inner)).toBe(true);
	});

	it("returns primitives untouched", () => {
		expect(DeepFreeze.apply(42)).toBe(42);
		expect(DeepFreeze.apply(null)).toBe(null);
	});

	it("stops at an already frozen object, so a cycle cannot spin forever", () => {
		const cyclic: Record<string, unknown> = { name: "root" };
		cyclic.self = cyclic;

		expect(Object.isFrozen(DeepFreeze.apply(cyclic))).toBe(true);
	});
});
