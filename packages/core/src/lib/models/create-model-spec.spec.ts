import { createModelSpec } from "./create-model-spec";
import { Gemini, type GeminiOptions, isModelSpec } from "./model-specs";

type RestrictedMap = {
	"no-temp-model": Omit<GeminiOptions, "temperature">;
	"full-model": GeminiOptions;
};

describe("createModelSpec (type-only factory)", () => {
	const MyGemini = createModelSpec(Gemini)<RestrictedMap>();

	it("returns the same constructor — zero runtime behavior", () => {
		expect(MyGemini).toBe(Gemini);
	});

	it("instances are regular specs (model + options preserved)", () => {
		const spec = new MyGemini("full-model", { temperature: 0.2 });
		expect(isModelSpec(spec)).toBe(true);
		expect(spec.model).toBe("full-model");
		expect((spec as Gemini).temperature).toBe(0.2);
	});

	it("models in the map are restricted at compile time; outside the map keep full options", () => {
		// @ts-expect-error — "no-temp-model" forbids temperature per the map
		new MyGemini("no-temp-model", { temperature: 0.2 });
		new MyGemini("no-temp-model", { topP: 0.9 });
		new MyGemini("outside-the-map", { temperature: 0.7 });
		expect(true).toBe(true);
	});
});
