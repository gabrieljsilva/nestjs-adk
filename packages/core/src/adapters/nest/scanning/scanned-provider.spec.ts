import { describe, expect, it } from "vitest";
import { ScannedProvider } from "./scanned-provider";

describe("ScannedProvider", () => {
	it("keeps the class and the instance together", () => {
		class SupportAgent {}
		const instance = new SupportAgent();

		const provider = new ScannedProvider("SupportAgent", SupportAgent, instance);

		expect(provider.name).toBe("SupportAgent");
		expect(provider.type).toBe(SupportAgent);
		expect(provider.instance).toBe(instance);
	});
});
