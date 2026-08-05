import { describe, expect, it } from "vitest";
import { Secret } from "./secret";

describe("Secret", () => {
	it("gives the real value only to a caller that asks for it by name", () => {
		expect(Secret.of("sk-live-1").reveal()).toBe("sk-live-1");
	});

	it("masks itself when interpolated into a string", () => {
		expect(`${Secret.of("sk-live-1")}`).toBe("[redacted]");
	});

	it("masks itself when serialized, including inside an object", () => {
		expect(JSON.stringify({ apiKey: Secret.of("sk-live-1") })).toBe('{"apiKey":"[redacted]"}');
	});

	it("compares by the value it hides", () => {
		expect(Secret.of("a").equals(Secret.of("a"))).toBe(true);
		expect(Secret.of("a").equals(Secret.of("b"))).toBe(false);
	});

	it("knows when it holds nothing", () => {
		expect(Secret.of("").isEmpty).toBe(true);
		expect(Secret.of("a").isEmpty).toBe(false);
	});

	it("masks itself in a log, which is where a secret is most often printed by accident", () => {
		const secret = Secret.of("sk-live-1");
		const hook: unknown = Reflect.get(secret, Symbol.for("nodejs.util.inspect.custom"));

		expect(typeof hook).toBe("function");
		expect(typeof hook === "function" ? hook.call(secret) : undefined).toBe("[redacted]");
	});

	it("does not carry the value in a field anything can walk into", () => {
		const secret = Secret.of("sk-live-1");

		expect(Object.keys(secret)).toEqual([]);
		expect(JSON.stringify({ ...secret })).toBe("{}");
	});
});
