import { projectLiteLlmCatalog } from "./litellm-projection";

const META = { source: "test", asOf: "2026-07-25T00:00:00.000Z", etag: 'W/"abc"' };

function project(payload: unknown) {
	return projectLiteLlmCatalog(payload, META);
}

describe("projectLiteLlmCatalog", () => {
	it("keeps the billable token rates and drops everything else", () => {
		const catalog = project({
			"gemini-2.5-flash": {
				mode: "chat",
				input_cost_per_token: 3e-7,
				output_cost_per_token: 2.5e-6,
				cache_read_input_token_cost: 3e-8,
				cache_creation_input_token_cost: 1e-8,
				max_tokens: 65535,
				max_input_tokens: 1048576,
				supports_vision: true,
				source: "https://ai.google.dev",
			},
		});

		// cache WRITE cost is intentionally absent: no provider reports how many tokens were written
		expect(catalog?.entries["gemini-2.5-flash"]).toEqual({ input: 3e-7, output: 2.5e-6, cacheRead: 3e-8 });
	});

	it("groups the above_Nk fields into ascending bands", () => {
		const catalog = project({
			"gemini-2.5-pro": {
				mode: "chat",
				input_cost_per_token: 1.25e-6,
				output_cost_per_token: 1e-5,
				input_cost_per_token_above_200k_tokens: 2.5e-6,
				output_cost_per_token_above_200k_tokens: 1.5e-5,
				input_cost_per_token_above_128k_tokens: 2e-6,
			},
		});

		expect(catalog?.entries["gemini-2.5-pro"]?.bands).toEqual([
			{ aboveTokens: 128_000, input: 2e-6 },
			{ aboveTokens: 200_000, input: 2.5e-6, output: 1.5e-5 },
		]);
	});

	it("ignores service tiers, batches and every non-text mode", () => {
		const catalog = project({
			"gpt-5": {
				mode: "chat",
				input_cost_per_token: 1.25e-6,
				output_cost_per_token: 1e-5,
				input_cost_per_token_flex: 6.25e-7,
				input_cost_per_token_priority: 2.5e-6,
				input_cost_per_token_batches: 6.25e-7,
			},
			"dall-e-3": { mode: "image_generation", input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 },
			"rerank-v3": { mode: "rerank", input_cost_per_token: 1e-6 },
		});

		expect(Object.keys(catalog?.entries ?? {})).toEqual(["gpt-5"]);
		expect(catalog?.entries["gpt-5"]).toEqual({ input: 1.25e-6, output: 1e-5 });
	});

	it("keeps embeddings, which publish input only", () => {
		const catalog = project({
			"gemini-embedding-001": { mode: "embedding", input_cost_per_token: 1.5e-7, output_cost_per_token: 0 },
		});

		expect(catalog?.entries["gemini-embedding-001"]).toEqual({ input: 1.5e-7, output: 0 });
	});

	it("skips the documentation stub and entries that say nothing about cost", () => {
		const catalog = project({
			sample_spec: { mode: "chat", input_cost_per_token: 1, output_cost_per_token: 1 },
			"github_copilot/gpt-5": { mode: "chat", supports_vision: true },
			"broken-entry": null,
			"gpt-5": { mode: "chat", input_cost_per_token: 1.25e-6, output_cost_per_token: 1e-5 },
		});

		expect(Object.keys(catalog?.entries ?? {})).toEqual(["gpt-5"]);
	});

	it("carries the origin metadata so staleness is visible", () => {
		const catalog = project({ "gpt-5": { mode: "chat", input_cost_per_token: 1e-6, output_cost_per_token: 1e-5 } });

		expect(catalog).toMatchObject({ v: 1, source: META.source, asOf: META.asOf, etag: META.etag });
	});

	it("rejects a payload that is not a model map", () => {
		expect(project("<html>404</html>")).toBeUndefined();
		expect(project([{ "gpt-5": {} }])).toBeUndefined();
		expect(project(null)).toBeUndefined();
	});

	it("rejects a payload where no entry survived: an unexpected format is not an empty catalog", () => {
		expect(project({ "gpt-5": { mode: "chat", supports_vision: true } })).toBeUndefined();
	});
});
