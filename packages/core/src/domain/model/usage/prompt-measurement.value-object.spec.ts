import { describe, expect, it } from "vitest";
import { ModelIdentity } from "../descriptor/model-identity.value-object";
import { ModelUsage } from "./model-usage.value-object";
import { PromptMeasurement } from "./prompt-measurement.value-object";

describe("PromptMeasurement", () => {
	it("keeps the usage next to the size of the prompt it was measured over", () => {
		const measurement = PromptMeasurement.from(ModelUsage.fromReport(120, 30), 480);

		expect(measurement?.usage.inputTokens).toBe(120);
		expect(measurement?.characters).toBe(480);
	});

	it("is absent when the provider reported no input, which is unknown rather than empty", () => {
		expect(PromptMeasurement.from(ModelUsage.none(), 480)).toBeUndefined();
	});

	it("truncates a fractional character count instead of carrying it", () => {
		expect(PromptMeasurement.from(ModelUsage.fromReport(10, 1), 12.9)?.characters).toBe(12);
	});

	it("never reports negative characters", () => {
		expect(PromptMeasurement.from(ModelUsage.fromReport(10, 1), -5)?.characters).toBe(0);
	});

	it("belongs to the model that produced it, so a failover does not borrow its number", () => {
		const gemini = new ModelIdentity("google", "gemini-flash");
		const claude = new ModelIdentity("anthropic", "claude");
		const measurement = PromptMeasurement.from(ModelUsage.fromReport(120, 30), 480, gemini);

		expect(measurement?.takenBy(gemini)).toBe(measurement);
		expect(measurement?.takenBy(claude)).toBeUndefined();
	});

	it("is unusable when nobody recorded which model counted it", () => {
		expect(
			PromptMeasurement.from(ModelUsage.fromReport(120, 30), 480)?.takenBy(new ModelIdentity("google", "x")),
		).toBeUndefined();
	});
});
