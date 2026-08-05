import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { AdkSkill } from "../abstracts/adk-skill";
import { AdkTool } from "../abstracts/adk-tool";
import { SessionStore } from "../abstracts/session-store";
import { Agent } from "../decorators/agent.decorator";
import { Skill } from "../decorators/skill.decorator";
import { Tool } from "../decorators/tool.decorator";
import { AiEmptyResponseError, ToolExecutionError } from "../errors";
import { AdkModule } from "../module/adk.module";
import { ScriptedEngine, callTool, text } from "../testing/scripted-engine";
import type { ToolContext } from "../types/tool-context";

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

	execute(input: z.infer<typeof weatherSchema>, ctx?: ToolContext) {
		ctx?.state.set("lastCity", input.city);
		return this.weather.fetch(input.city);
	}
}

@Skill({ name: "tax_rules", description: "US tax rules." })
class TaxSkill extends AdkSkill {
	content() {
		return "Current table: 2026.";
	}
}

@Agent({
	name: "weather_assistant",
	prompt: "You are a weather assistant.",
	model: "scripted",
	description: "Answers about the weather.",
	tools: [GetWeatherTool],
	skills: [TaxSkill],
})
class WeatherAgent extends AdkAgent {
	@Skill({ name: "tone", description: "Tone of voice.", mode: "always" })
	tone() {
		return "Answer in English.";
	}
}

@Injectable()
class ChatService {
	constructor(public readonly weather: WeatherAgent) {}
}

@Module({ providers: [WeatherService, GetWeatherTool, TaxSkill, WeatherAgent, ChatService] })
class FeatureModule {}

describe("AgentRunner + agent handle (scriptable fake engine)", () => {
	let app: TestingModule;
	let engine: ScriptedEngine;
	let chat: ChatService;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "scripted" }), FeatureModule],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as ScriptedEngine;
		chat = app.get(ChatService);
	});

	afterEach(async () => {
		await app.close();
	});

	it("ask(): full run with a tool via DI, events in order, aggregated text and usage", async () => {
		engine.enqueue([callTool("get_weather", { city: "SP" }), text("It's 25°C in SP.")]);

		const run = await chat.weather.ask({ message: "weather in SP?" });

		expect(run.text).toBe("It's 25°C in SP.");
		expect(run.status).toBe("completed");
		expect(run.events.map((e) => e.type)).toEqual(["run_start", "tool_call", "tool_result", "llm_response", "final"]);

		const toolResult = run.events.find((e) => e.type === "tool_result");
		expect(toolResult && "result" in toolResult ? toolResult.result : null).toEqual({ city: "SP", tempC: 25 });
		expect(run.usage.totalTokens).toBeGreaterThan(0);
	});

	it("stream(): delivers the same events incrementally", async () => {
		engine.enqueue([text("hello")]);

		const types: string[] = [];
		for await (const event of chat.weather.stream.ask({ message: "hi" })) types.push(event.type);

		expect(types).toEqual(["run_start", "llm_response", "final"]);
	});

	it("composed instruction: prompt + always skill + on-demand catalog (stable order)", async () => {
		engine.enqueue([text("ok")]);
		await chat.weather.ask({ message: "hi" });

		const instruction = engine.lastAgent?.instruction ?? "";
		const promptIdx = instruction.indexOf("You are a weather assistant.");
		const alwaysIdx = instruction.indexOf("## Skill: tone");
		const catalogIdx = instruction.indexOf("tax_rules: US tax rules.");

		expect(promptIdx).toBeGreaterThanOrEqual(0);
		expect(alwaysIdx).toBeGreaterThan(promptIdx);
		expect(instruction).toContain("Answer in English.");
		expect(catalogIdx).toBeGreaterThan(alwaysIdx);
	});

	it("empty final response → AiEmptyResponseError", async () => {
		engine.enqueue([text("")]);
		await expect(chat.weather.ask({ message: "hi" })).rejects.toBeInstanceOf(AiEmptyResponseError);
	});

	it("tool that throws → ToolExecutionError surfaces from ask()", async () => {
		engine.enqueue([callTool("get_weather", { city: "__boom__" })]);
		vi.spyOn(app.get(WeatherService), "fetch").mockImplementation(() => {
			throw new Error("api down");
		});

		await expect(chat.weather.ask({ message: "hi" })).rejects.toBeInstanceOf(ToolExecutionError);
	});

	it("persistent session: events accumulate and the tool's stateDelta persists", async () => {
		const store = app.get(SessionStore);
		engine.enqueue([callTool("get_weather", { city: "SP" }), text("25°C.")]);
		engine.enqueue([text("You're welcome!")]);

		await chat.weather.ask({ sessionId: "chat-1", userId: "u1", message: "weather in SP?" });
		await chat.weather.ask({ sessionId: "chat-1", userId: "u1", message: "thanks" });

		const session = await store.get("chat-1");
		expect(session).not.toBeNull();
		expect(session?.state.lastCity).toBe("SP");

		const types = session?.events.map((e) => e.type);
		// turn 1: message(user) + tool_call + tool_result + message(agent); turn 2: message + message
		expect(types).toEqual(["message", "tool_call", "tool_result", "message", "message", "message"]);
	});

	it("ephemeral session: nothing persists in the store", async () => {
		const store = app.get(SessionStore);
		const spy = vi.spyOn(store, "create");
		engine.enqueue([text("ok")]);

		await chat.weather.ask({ message: "hi", state: { tenant: "t1" } });
		expect(spy).not.toHaveBeenCalled();
	});
});
