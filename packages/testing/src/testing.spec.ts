import "./matchers";
import {
	AdkAgent,
	AdkModule,
	AdkTool,
	Agent,
	Embedder,
	type EmbeddingResult,
	ScriptedEngine,
	Skill,
	Tool,
	text,
} from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { z } from "zod";
import { engineJudge, expectJudged } from "./judge";
import { TestAgent } from "./test-agent";

@Injectable()
class WeatherService {
	public fetch(city: string) {
		return { city, tempC: 25 };
	}
}

const weatherSchema = z.object({ city: z.string() });

@Tool({ name: "get_weather", description: "Current weather.", schema: weatherSchema })
class GetWeatherTool extends AdkTool<typeof weatherSchema> {
	constructor(private readonly weather: WeatherService) {
		super();
	}

	execute(input: z.infer<typeof weatherSchema>) {
		return this.weather.fetch(input.city);
	}
}

@Agent({
	name: "weather_assistant",
	model: "test",
	description: "Weather.",
	prompt: "Weather assistant.",
	tools: [GetWeatherTool],
})
class WeatherAgent extends AdkAgent {
	@Skill({ name: "tone", description: "Tone of voice.", mode: "always" })
	tone() {
		return "Answer briefly.";
	}
}

/** A service consuming the agent — proves the setup tests YOUR code, not just the agent. */
@Injectable()
class ForecastService {
	constructor(private readonly agent: WeatherAgent) {}

	public forecast(city: string) {
		return this.agent.ask({ message: `weather in ${city}?` });
	}
}

/** Plain @nestjs/testing — overrides and mocks are the Nest-native ones. */
async function bootstrap() {
	const module = await Test.createTestingModule({
		imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model" })],
		// plain Nest: the agent and its tools are providers like any other class
		providers: [WeatherAgent, GetWeatherTool, WeatherService, ForecastService],
	}).compile();
	await module.init();
	return module;
}

describe("TestAgent", () => {
	it("mock* only stacks; ask() consumes the stack as the run script (real tools via DI)", async () => {
		const module = await bootstrap();
		const weatherAgent = new TestAgent(module, WeatherAgent);

		weatherAgent.mockCallTool("get_weather", { city: "SP" }).mockText("It's 25°C in SP.");

		const run = await weatherAgent.ask({ message: "weather in SP?" });

		expect(run.text).toBe("It's 25°C in SP.");
		expect(run).toHaveCalledTool("get_weather", { city: "SP" });
		await module.close();
	});

	it("stacking again applies to the NEXT run", async () => {
		const module = await bootstrap();
		const weatherAgent = new TestAgent(module, WeatherAgent);

		weatherAgent.mockText("first");
		const first = await weatherAgent.ask({ message: "1" });

		weatherAgent.mockCallTool("get_weather", { city: "RJ" }).mockText("second");
		const second = await weatherAgent.ask({ message: "2" });

		expect(first.text).toBe("first");
		expect(first).not.toHaveCalledTool("get_weather");
		expect(second.text).toBe("second");
		expect(second).toHaveCalledTool("get_weather", { city: "RJ" });
		await module.close();
	});

	it("Nest-native overrideProvider reaches the real tool's dependencies", async () => {
		const fake = { fetch: vi.fn().mockReturnValue({ city: "SP", tempC: -99 }) };
		const module = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model" })],
			providers: [WeatherAgent, GetWeatherTool, WeatherService],
		})
			.overrideProvider(WeatherService)
			.useValue(fake)
			.compile();
		await module.init();

		const weatherAgent = new TestAgent(module, WeatherAgent);
		weatherAgent.mockCallTool("get_weather", { city: "SP" }).mockText("ok");
		const run = await weatherAgent.ask({ message: "?" });

		expect(fake.fetch).toHaveBeenCalledWith("SP");
		expect(run).toHaveCalledToolTimes("get_weather", 1);
		await module.close();
	});

	it("a service consuming the agent runs against the same stacked script", async () => {
		const module = await bootstrap();
		const weatherAgent = new TestAgent(module, WeatherAgent);

		weatherAgent.mockCallTool("get_weather", { city: "RJ" }).mockText("Sunny in RJ.");
		const run = await module.get(ForecastService).forecast("RJ");

		expect(run.text).toBe("Sunny in RJ.");
		expect(run).toHaveCalledTool("get_weather", { city: "RJ" });
		await module.close();
	});

	it("lastInstruction() exposes the composed prompt (prompt + skills) — snapshotable", async () => {
		const module = await bootstrap();
		const weatherAgent = new TestAgent(module, WeatherAgent);

		weatherAgent.mockText("hi");
		await weatherAgent.ask({ message: "?" });

		const instruction = weatherAgent.lastInstruction();
		expect(instruction).toContain("Weather assistant.");
		expect(instruction).toContain("Answer briefly.");
		expect(instruction).toMatchSnapshot();
		await module.close();
	});
});

describe("matchers", () => {
	async function runScript(setup: (agent: TestAgent<WeatherAgent>) => void) {
		const module = await bootstrap();
		const weatherAgent = new TestAgent(module, WeatherAgent);
		setup(weatherAgent);
		const run = await weatherAgent.ask({ message: "?" });
		await module.close();
		return run;
	}

	it("toHaveCalledTool: name and args; fails with a useful trace", async () => {
		const run = await runScript((agent) => agent.mockCallTool("get_weather", { city: "SP" }).mockText("ok"));

		expect(run).toHaveCalledTool("get_weather");
		expect(run).toHaveCalledTool("get_weather", { city: "SP" });
		expect(run).not.toHaveCalledTool("get_weather", { city: "RJ" });
		expect(run).not.toHaveCalledTool("ghost_tool");

		expect(() => expect(run).toHaveCalledTool("ghost_tool")).toThrow(/ghost_tool.*get_weather/s);
	});

	it("toHaveCalledToolTimes and toHaveCalledToolsInOrder (subsequence)", async () => {
		const run = await runScript((agent) =>
			agent.mockCallTool("get_weather", { city: "SP" }).mockCallTool("get_weather", { city: "RJ" }).mockText("ok"),
		);

		expect(run).toHaveCalledToolTimes("get_weather", 2);
		expect(run).not.toHaveCalledToolTimes("get_weather", 1);
		expect(run).toHaveCalledToolsInOrder(["get_weather", "get_weather"]);
		expect(run).not.toHaveCalledToolsInOrder(["get_weather", "ghost", "get_weather"]);
	});

	it("toHaveUsedAtMostTokens: token budget as a regression assertion", async () => {
		const run = await runScript((agent) =>
			agent.mockText("ok", { promptTokens: 100, outputTokens: 50, totalTokens: 150 }),
		);

		expect(run).toHaveUsedAtMostTokens(150);
		expect(run).not.toHaveUsedAtMostTokens(149);
		expect(() => expect(run).toHaveUsedAtMostTokens(10)).toThrow(/at most 10 tokens, used 150/);
	});

	it("toMatchOutput validates the run output against a Zod schema", async () => {
		const run = await runScript((agent) => agent.mockText('{"city":"SP","tempC":25}'));

		expect(run).toMatchOutput(z.object({ city: z.string(), tempC: z.number() }));
		expect(run).not.toMatchOutput(z.object({ city: z.number() }));
	});

	it("toHavePausedForApproval: HITL pause with the pending tool", async () => {
		const refundSchema = z.object({ amount: z.number() });

		@Agent({ name: "hitl_agent", model: "test", description: "HITL." })
		class HitlAgent extends AdkAgent {
			@Tool({ description: "Refunds.", schema: refundSchema, requiresApproval: true })
			refund(input: { amount: number }) {
				return { refunded: input.amount };
			}
		}

		const module = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model" })],
			providers: [HitlAgent],
		}).compile();
		await module.init();

		const hitlAgent = new TestAgent(module, HitlAgent);
		hitlAgent.mockCallTool("refund", { amount: 500 }).mockText("awaiting approval");
		const run = await hitlAgent.ask({ sessionId: "s1", message: "refund 500" });

		expect(run).toHavePausedForApproval();
		expect(run).toHavePausedForApproval("refund");
		expect(run).not.toHavePausedForApproval("ghost");
		await module.close();
	});
});

/** Deterministic bag-of-words embedder — word overlap drives similarity, no API involved. */
@Injectable()
class FakeEmbedder extends Embedder {
	public async embed(texts: string[]): Promise<EmbeddingResult> {
		const embeddings = texts.map((input) => {
			const vector = new Array<number>(128).fill(0);
			for (const word of input.toLowerCase().match(/\w+/g) ?? []) {
				let hash = 0;
				for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) % 128;
				vector[hash] = (vector[hash] ?? 0) + 1;
			}
			return vector;
		});
		return { embeddings, usage: { promptTokens: texts.join(" ").split(/\s+/).length } };
	}
}

describe("toBeSemanticallySimilarTo", () => {
	async function bootstrapEmbedder(embedder?: typeof FakeEmbedder) {
		const module = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model", embedder })],
			providers: [WeatherAgent, GetWeatherTool, WeatherService],
		}).compile();
		await module.init();
		return module;
	}

	it("uses the module-configured embedder; word overlap passes, unrelated text fails with the score", async () => {
		const module = await bootstrapEmbedder(FakeEmbedder);

		await expect("the order 123 was shipped yesterday").toBeSemanticallySimilarTo("order 123 was shipped", {
			threshold: 0.7,
		});
		await expect(
			expect("the order was shipped").toBeSemanticallySimilarTo("quantum physics lecture notes", { threshold: 0.7 }),
		).rejects.toThrow(/cosine similarity: 0\./);

		await module.close();
	});

	it("accepts a RunResult directly (uses run.text)", async () => {
		const module = await bootstrapEmbedder(FakeEmbedder);
		const weatherAgent = new TestAgent(module, WeatherAgent);
		weatherAgent.mockText("the order 123 was shipped yesterday");

		const run = await weatherAgent.ask({ message: "?" });
		await expect(run).toBeSemanticallySimilarTo("order 123 was shipped", { threshold: 0.7 });
		await module.close();
	});

	it("without a configured embedder → setup hint", async () => {
		const module = await bootstrapEmbedder(undefined);
		await expect(expect("a").toBeSemanticallySimilarTo("b")).rejects.toThrow(/No Embedder configured/);
		await module.close();
	});
});

describe("LLM as judge", () => {
	it("expectJudged approves/rejects based on the judge's JSON verdict", async () => {
		const approve = async () => '{"pass": true, "reasoning": "answers in English"}';
		const reject = async () => '{"pass": false, "reasoning": "does not mention the temperature"}';

		await expectJudged("It's 25°C in SP.").toSatisfy("answers in English", { judge: approve });
		await expect(expectJudged("hello").toSatisfy("answers in English", { judge: reject })).rejects.toThrow(
			/does not mention the temperature/,
		);
	});

	it("engineJudge runs the judge via the AdkEngine contract (agnostic)", async () => {
		const engine = new ScriptedEngine();
		engine.enqueue([text('{"pass": true, "reasoning": "ok"}')]);

		const judge = engineJudge(engine, "judge-model");
		await expectJudged("It's 25°C.").toSatisfy("mentions the temperature", { judge });
	});
});
