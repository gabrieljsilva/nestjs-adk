import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { ADK_OPTIONS, AdkModule } from "./adk-module";
import { AdkModuleOptions } from "./adk-module-options";

describe("AdkModule", () => {
	it("is a global module, so an application injects the runtime without importing it again", () => {
		const dynamic = AdkModule.forRoot(new AdkModuleOptions(new ScriptedModel("primary")));

		expect(dynamic.module).toBe(AdkModule);
	});

	it("exports what an application actually holds", () => {
		const dynamic = AdkModule.forRoot(new AdkModuleOptions(new ScriptedModel("primary")));

		expect(dynamic.exports?.length).toBeGreaterThan(0);
	});

	it("keeps the options reachable under a token of their own", () => {
		const options = new AdkModuleOptions(new ScriptedModel("primary"));
		const dynamic = AdkModule.forRoot(options);

		const provided = dynamic.providers?.find(
			(provider) => typeof provider === "object" && Reflect.get(provider, "provide") === ADK_OPTIONS,
		);
		expect(Reflect.get(Object(provided), "useValue")).toBe(options);
	});
});
