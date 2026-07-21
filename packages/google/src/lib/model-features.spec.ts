import "@nestjs-adk/testing/matchers";
import { Gemini as NativeGemini } from "@google/adk";
import {
	AdkAgent,
	AdkEngine,
	Agent,
	AgentRegistry,
	AgentRunner,
	Gemini,
	ModelRouter,
	OpenAiLike,
	ScriptedModel,
	fail,
	text,
} from "@nestjs-adk/core";
import { AdkModule } from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { GoogleAdkEngine } from "./google-adk-engine";

const routedModel = new ModelRouter({
	targets: {
		primary: new ScriptedModel([fail("429 resource exhausted")]),
		fallback: new ScriptedModel([text("fallback response")]),
	},
});

@Agent({ name: "routed_agent", model: routedModel, description: "d" })
class RoutedAgent extends AdkAgent {}

@Agent({
	name: "gemini_agent",
	model: new Gemini("gemini-2.5-flash", {
		apiKey: "test-key",
		labels: { team: "growth" },
		cache: { content: "cachedContents/abc" },
		config: { temperature: 0.2 },
	}),
	description: "d",
})
class GeminiAgent extends AdkAgent {}

@Agent({
	name: "openai_agent",
	model: new OpenAiLike("gpt-4o-mini", { apiKeyEnv: "TEST_OPENAI_KEY" }),
	description: "d",
})
class OpenAiAgent extends AdkAgent {}

const labeledModel = new ScriptedModel();

@Agent({ name: "labeled_agent", model: labeledModel, description: "d" })
class LabeledAgent extends AdkAgent {}

const reportSchema = z.object({ city: z.string(), tempC: z.number() });
const outputModel = new ScriptedModel();

@Agent({ name: "structured_agent", model: outputModel, description: "d", output: reportSchema })
class StructuredAgent extends AdkAgent<typeof reportSchema> {}

@Module({ providers: [RoutedAgent, GeminiAgent, OpenAiAgent, LabeledAgent, StructuredAgent] })
class FeatureModule {}

describe("GoogleAdkEngine — model specs (F6)", () => {
	let app: TestingModule;
	let registry: AgentRegistry;
	let engine: GoogleAdkEngine;

	beforeEach(async () => {
		process.env.TEST_OPENAI_KEY = "test-key";
		labeledModel.scripts.length = 0;
		outputModel.scripts.length = 0;
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" }), FeatureModule],
		}).compile();
		await app.init();
		registry = app.get(AgentRegistry);
		engine = app.get(AdkEngine) as GoogleAdkEngine;
	});

	afterEach(async () => {
		await app.close();
	});

	it("modelRouter: failover on a pre-1st-chunk error switches targets and emits model_rerouted", async () => {
		const run = await registry.getRef(RoutedAgent).ask({ message: "hi" });

		expect(run.text).toBe("fallback response");
		const reroute = run.events.find((e) => e.type === "model_rerouted");
		expect(reroute).toMatchObject({ from: "primary", to: "fallback" });
		expect(reroute && "reason" in reroute ? reroute.reason : "").toContain("429");
	});

	it("new Gemini(): spec becomes a native Gemini with labels/cachedContent/config in generateContentConfig", async () => {
		const resolved = await app.get(AgentRunner).resolve(GeminiAgent);
		const llmAgent = await engine.toNative(resolved);

		expect(llmAgent.model).toBeInstanceOf(NativeGemini);
		const config = (llmAgent as unknown as { generateContentConfig?: Record<string, unknown> }).generateContentConfig;
		expect(config).toMatchObject({
			labels: { team: "growth" },
			cachedContent: "cachedContents/abc",
			temperature: 0.2,
		});
	});

	it("new OpenAiLike(): spec becomes an OpenAI-compatible model via the bridge", async () => {
		const resolved = await app.get(AgentRunner).resolve(OpenAiAgent);
		const llmAgent = await engine.toNative(resolved);
		expect((llmAgent.model as { constructor: { name: string } }).constructor.name).toBe("CustomLlm");
	});

	it("per-run labels (ask({ labels })) are merged into the request via beforeModelCallback", async () => {
		labeledModel.enqueue([text("ok")]);
		await registry.getRef(LabeledAgent).ask({ message: "hi", labels: { run_tag: "t1" } });

		expect(engine.lastRequest?.config?.labels).toMatchObject({ run_tag: "t1" });
	});

	it("structured output: outputSchema arrives as responseSchema in the request (no tools)", async () => {
		outputModel.enqueue([text('{"city": "SP", "tempC": 25}')]);
		const run = await registry.getRef(StructuredAgent).ask({ message: "weather?" });

		expect(run.output).toEqual({ city: "SP", tempC: 25 });
		expect(engine.lastRequest?.config?.responseSchema).toBeDefined();
		expect(engine.lastRequest?.config?.responseMimeType).toBe("application/json");
	});
});
