import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ModelsExhaustedError } from "./models-exhausted.error";

describe("ModelsExhaustedError", () => {
	it("carries a stable code", () => {
		expect(new ModelsExhaustedError("support", ["a"], ["unknown"]).code).toBe("AGENT_MODELS_EXHAUSTED");
	});

	it("names the agent and how many models were tried", () => {
		const error = new ModelsExhaustedError("support", ["acme/a", "acme/b"], ["rate-limited", "unavailable"]);

		expect(error.message).toContain("support");
		expect(error.message).toContain("2 attempt");
	});

	it("spells out the chain, because the order of failures is the useful part", () => {
		const error = new ModelsExhaustedError("support", ["acme/a", "acme/b"], ["rate-limited", "unavailable"]);

		expect(error.message).toContain("acme/a (rate-limited) then acme/b (unavailable)");
	});

	it("survives a chain with fewer failures than models", () => {
		expect(new ModelsExhaustedError("support", ["acme/a"], []).message).toContain("acme/a (unknown)");
	});

	/**
	 * The words the provider used, because a kind alone is not something to act on.
	 *
	 * An `unknown` failure is the case that matters here: it is what a 400 nobody has
	 * classified looks like, and the message is the only thing in it that says what to fix.
	 */
	it("quotes what the provider said, when there is anything to quote", () => {
		const error = new ModelsExhaustedError("support", ["acme/a"], ["unknown"], "400: missing a thought_signature");

		expect(error.message).toContain("The provider said: 400: missing a thought_signature");
		expect(error.lastMessage).toBe("400: missing a thought_signature");
	});

	it("says nothing extra when the failure carried no message", () => {
		expect(new ModelsExhaustedError("support", ["acme/a"], ["unknown"]).message).not.toContain("provider said");
		expect(new ModelsExhaustedError("support", ["acme/a"], ["unknown"], "").message).not.toContain("provider said");
	});

	it("is an adk error", () => {
		expect(new ModelsExhaustedError("support", ["a"], ["unknown"])).toBeInstanceOf(AdkError);
	});
});
