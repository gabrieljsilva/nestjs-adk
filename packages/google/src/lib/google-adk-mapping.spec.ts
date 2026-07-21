import { Gemini as GeminiSpec, type ResolvedAgent, ScriptedModel, type SessionEvent, text } from "@nestjs-adk/core";
import { GoogleAdkEngine } from "./google-adk-engine";

function resolvedAgent(overrides: Partial<ResolvedAgent> = {}): ResolvedAgent {
	return {
		name: "mapper",
		description: "Mapping under test.",
		instruction: "You map things.",
		model: new ScriptedModel().enqueue([text("ok")]),
		tools: [],
		subAgents: [],
		...overrides,
	};
}

async function drain(engine: GoogleAdkEngine, agent: ResolvedAgent, history?: SessionEvent[]) {
	const events = [];
	for await (const event of engine.run(agent, { message: "hi", sessionId: "s1", history })) events.push(event);
	return events;
}

describe("GoogleAdkEngine — mapping of history, config and model specs", () => {
	it("hydrates message/tool_call/tool_result history into the native session; unknown types are skipped", async () => {
		const engine = new GoogleAdkEngine();
		const history: SessionEvent[] = [
			{ v: 1, id: "e1", at: 1, author: "user", type: "message", data: { text: "weather in SP?" } },
			{
				v: 1,
				id: "e2",
				at: 2,
				author: "agent",
				type: "tool_call",
				data: { callId: "c1", tool: "get_weather", args: { city: "SP" } },
			},
			{
				v: 1,
				id: "e3",
				at: 3,
				author: "tool",
				type: "tool_result",
				data: { callId: "c1", tool: "get_weather", result: { tempC: 25 } },
			},
			{ v: 1, id: "e4", at: 4, author: "agent", type: "message", data: { text: "It's 25°C." } },
			{ v: 1, id: "e5", at: 5, author: "system", type: "custom_marker", data: {} },
		];

		const events = await drain(engine, resolvedAgent(), history);

		expect(events.at(-1)).toMatchObject({ type: "final", text: "ok" });
		const contents = engine.lastRequest?.contents ?? [];
		const serialized = JSON.stringify(contents);
		expect(serialized).toContain("weather in SP?");
		expect(serialized).toContain("get_weather");
		expect(serialized).toContain("It's 25°C.");
		expect(serialized).not.toContain("custom_marker");
	});

	it("Gemini spec with labels/cache/config lands in generateContentConfig", async () => {
		const engine = new GoogleAdkEngine();
		const spec = new GeminiSpec("gemini-2.5-flash", {
			apiKey: "test-key",
			labels: { team: "growth" },
			cache: { content: "cachedContents/abc" },
			config: { temperature: 0.2 },
		});

		const native = await engine.toNative(resolvedAgent({ model: spec }));

		expect(native.generateContentConfig).toMatchObject({
			temperature: 0.2,
			labels: { team: "growth" },
			cachedContent: "cachedContents/abc",
		});
	});

	it("bare Gemini spec (no labels/cache/config) adds nothing to generateContentConfig", async () => {
		const engine = new GoogleAdkEngine();
		const native = await engine.toNative(
			resolvedAgent({ model: new GeminiSpec("gemini-2.5-flash", { apiKey: "test-key" }) }),
		);

		// the native LlmAgent defaults an absent config to {}
		expect(native.generateContentConfig).toEqual({});
	});

	it("unsupported model value fails fast pointing at the spec", async () => {
		const engine = new GoogleAdkEngine();
		const agent = resolvedAgent({ model: { bogus: true } as unknown as ResolvedAgent["model"] });

		await expect(engine.toNative(agent)).rejects.toThrow(/unsupported model spec/);
	});

	it("per-run labels merge into the request config (beforeModelCallback)", async () => {
		const engine = new GoogleAdkEngine();
		const events = [];
		for await (const event of engine.run(resolvedAgent(), { message: "hi", labels: { run: "42" } })) {
			events.push(event);
		}

		expect(events.at(-1)).toMatchObject({ type: "final" });
		expect(engine.lastRequest?.config?.labels).toMatchObject({ run: "42" });
	});
});
