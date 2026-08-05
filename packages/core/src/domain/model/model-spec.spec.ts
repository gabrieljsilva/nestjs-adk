import { describe, expect, it } from "vitest";
import { LlmModel } from "./llm-model";
import { ModelCapabilities } from "./model-capabilities";
import { ModelChunk } from "./model-chunk";
import { ModelContextWindow } from "./model-context-window";
import { ModelDescriptor } from "./model-descriptor";
import { ModelIdentity } from "./model-identity";
import { ModelSpec } from "./model-spec";
import { TokenCount } from "./token-count";

interface AcmeOptions {
	apiKey?: string;
}

/** What a provider package writes: a model declared by name and options, and nothing about the core. */
class AcmeModel extends ModelSpec {
	public readonly provider = "acme";

	public constructor(
		public readonly model: string,
		public readonly options: AcmeOptions = {},
	) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of(this.provider, this.model),
			ModelContextWindow.of(1000, 100),
			ModelCapabilities.none(),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		yield ModelChunk.finish("stop");
	}

	public async countTokens(): Promise<TokenCount> {
		return TokenCount.measured(0);
	}
}

describe("ModelSpec", () => {
	it("is a model, not a description of one", () => {
		expect(new AcmeModel("m-1")).toBeInstanceOf(LlmModel);
	});

	it("declares provider and model name", () => {
		const spec = new AcmeModel("m-1");

		expect(spec.provider).toBe("acme");
		expect(spec.model).toBe("m-1");
	});

	it("recognises a spec without instanceof, so a second copy of the class still matches", () => {
		expect(ModelSpec.is(new AcmeModel("m-1"))).toBe(true);
	});

	it("recognises a spec that arrived from another copy of the core", () => {
		const foreign = { __adkModelSpec: true, provider: "acme", model: "m-1" };

		expect(ModelSpec.is(foreign)).toBe(true);
	});

	it("refuses anything that is not a spec", () => {
		expect(ModelSpec.is(undefined)).toBe(false);
		expect(ModelSpec.is(null)).toBe(false);
		expect(ModelSpec.is("m-1")).toBe(false);
		expect(ModelSpec.is({ model: "m-1" })).toBe(false);
	});

	it("keeps the marker out of enumeration, so serializing a spec does not leak it", () => {
		expect(Object.keys(new AcmeModel("m-1"))).not.toContain("__adkModelSpec");
	});

	it("answers the model name behind a name or a spec", () => {
		expect(ModelSpec.idOf("gemini-2.5-flash")).toBe("gemini-2.5-flash");
		expect(ModelSpec.idOf(new AcmeModel("m-1"))).toBe("m-1");
	});

	it("answers nothing for a value that names no model", () => {
		expect(ModelSpec.idOf({ nothing: true })).toBeUndefined();
		expect(ModelSpec.idOf(undefined)).toBeUndefined();
	});
});
