import { Gemini, ModelRouter, OpenAiLike, isModelSpec } from "./model-specs";

describe("model specs (value-object classes)", () => {
	it("new Gemini() loads provider config into the spec", () => {
		const spec = new Gemini("gemini-2.5-flash", {
			vertexai: true,
			project: "proj",
			location: "us-central1",
			labels: { team: "ai" },
			cache: { content: "cachedContents/abc" },
			config: { temperature: 0.2 },
		});
		expect(spec.__adkModelSpec).toBe("gemini");
		expect(spec.model).toBe("gemini-2.5-flash");
		expect(spec.vertexai).toBe(true);
		expect(spec.labels).toEqual({ team: "ai" });
		expect(isModelSpec(spec)).toBe(true);
	});

	it("new Gemini() carries first-class typed generation params alongside the config escape hatch", () => {
		const spec = new Gemini("gemini-2.5-flash", {
			temperature: 0.1,
			topP: 0.9,
			topK: 40,
			maxOutputTokens: 2048,
			frequencyPenalty: 0.5,
			presencePenalty: 0.3,
			stopSequences: ["FIM"],
			config: { candidateCount: 2 },
		});
		expect(spec.temperature).toBe(0.1);
		expect(spec.topP).toBe(0.9);
		expect(spec.topK).toBe(40);
		expect(spec.maxOutputTokens).toBe(2048);
		expect(spec.frequencyPenalty).toBe(0.5);
		expect(spec.presencePenalty).toBe(0.3);
		expect(spec.stopSequences).toEqual(["FIM"]);
		expect(spec.config).toEqual({ candidateCount: 2 });
	});

	it("new OpenAiLike() with declarable defaults", () => {
		const spec = new OpenAiLike("gpt-4o-mini", { baseUrl: "http://localhost:11434/v1", apiKeyEnv: "MY_KEY" });
		expect(spec.__adkModelSpec).toBe("openai-like");
		expect(spec.baseUrl).toBe("http://localhost:11434/v1");
	});

	it("new ModelRouter() normalizes an array of targets into an ordered Record", () => {
		const spec = new ModelRouter({ targets: [new Gemini("a"), new OpenAiLike("b")] });
		expect(Object.keys(spec.targets)).toEqual(["target_0", "target_1"]);
		expect(spec.strategy).toBe("failover");
	});

	it("isModelSpec: plain strings and unrelated objects are not specs", () => {
		expect(isModelSpec("gemini-2.5-flash")).toBe(false);
		expect(isModelSpec({ model: "x" })).toBe(false);
	});
});
