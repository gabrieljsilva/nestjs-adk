import { describe, expect, it } from "vitest";
import { ApiKeyGate } from "./api-key-gate";
import { MissingApiKeyError } from "./errors/missing-api-key.error";

describe("ApiKeyGate", () => {
	it("finds the first variable that carries a key", () => {
		const gate = ApiKeyGate.fromEnv(["FIRST", "SECOND"], { SECOND: "sk-second" });

		expect(gate.present).toBe(true);
		expect(gate.keyOrFail()).toBe("sk-second");
	});

	it("prefers the earlier variable when both carry one", () => {
		const gate = ApiKeyGate.fromEnv(["FIRST", "SECOND"], { FIRST: "sk-first", SECOND: "sk-second" });

		expect(gate.keyOrFail()).toBe("sk-first");
	});

	it("treats an empty variable as no key at all", () => {
		expect(ApiKeyGate.fromEnv(["FIRST"], { FIRST: "" }).present).toBe(false);
	});

	it("is absent when nothing is set, so a suite skips instead of failing", () => {
		expect(ApiKeyGate.fromEnv(["FIRST"], {}).present).toBe(false);
	});

	it("fails naming the variables it looked for", () => {
		const gate = ApiKeyGate.fromEnv(["OPENAI_API_KEY", "OPEN_AI_API_KEY"], {});

		expect(() => gate.keyOrFail()).toThrow(MissingApiKeyError);
		expect(() => gate.keyOrFail()).toThrow(/OPENAI_API_KEY/);
	});
});
