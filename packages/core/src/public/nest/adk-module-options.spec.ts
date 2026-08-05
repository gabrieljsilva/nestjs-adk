import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AdkModuleOptions } from "./adk-module-options";

describe("AdkModuleOptions", () => {
	it("needs only the model an agent falls back to", () => {
		const model = new ScriptedModel("primary");
		const options = new AdkModuleOptions(model);

		expect(options.defaultModel).toBe(model);
		expect(options.storage).toBeUndefined();
		expect(options.artifacts).toBeUndefined();
	});

	it("carries the ports an application decided to replace", () => {
		const storage = new InMemorySessionStorage();
		const options = new AdkModuleOptions(new ScriptedModel("primary"), storage);

		expect(options.storage).toBe(storage);
	});
});
