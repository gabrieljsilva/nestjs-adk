import { describe, expect, it } from "vitest";
import { createModelSpec } from "./create-model-spec";

interface AcmeOptions {
	temperature?: number;
	apiKey?: string;
}

/** A provider spec written with nothing but the core, which is what a third party would do. */
class AcmeModel {
	public constructor(
		public readonly model: string,
		public readonly options: AcmeOptions = {},
	) {}
}

const TypedAcme = createModelSpec(AcmeModel)<{
	"acme-lite": Omit<AcmeOptions, "temperature">;
}>();

describe("createModelSpec", () => {
	it("returns the very constructor it was given", () => {
		expect(TypedAcme).toBe(AcmeModel);
	});

	it("builds instances that behave exactly like the original spec", () => {
		const model = new TypedAcme("acme-pro", { temperature: 0.2 });

		expect(model).toBeInstanceOf(AcmeModel);
		expect(model.model).toBe("acme-pro");
		expect(model.options.temperature).toBe(0.2);
	});

	it("accepts the options a mapped model still allows", () => {
		const model = new TypedAcme("acme-lite", { apiKey: "k" });

		expect(model.options.apiKey).toBe("k");
	});

	it("restricts nothing at runtime, since the map is a type level statement", () => {
		const model = new AcmeModel("acme-lite", { temperature: 0.2 });

		expect(model.options.temperature).toBe(0.2);
	});
});
