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

	it("builds from a literal without restating the optional ports", () => {
		const model = new ScriptedModel("primary");
		const options = AdkModuleOptions.from({ defaultModel: model });

		expect(options.defaultModel).toBe(model);
		expect(options.storage).toBeUndefined();
	});

	it("patches only the named fields and keeps every other one", () => {
		const storage = new InMemorySessionStorage();
		const declared = AdkModuleOptions.from({ defaultModel: new ScriptedModel("primary"), storage });
		const replacement = new ScriptedModel("replacement");

		const patched = declared.with({ defaultModel: replacement });

		expect(patched.defaultModel).toBe(replacement);
		expect(patched.storage).toBe(storage);
		expect(declared.defaultModel).not.toBe(replacement);
	});
});
