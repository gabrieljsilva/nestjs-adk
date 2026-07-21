import {
	AdkAgent,
	AdkEngine,
	AdkModule,
	AdkTool,
	Agent,
	ScriptedModel,
	SessionStore,
	Tool,
	callTool,
	text,
} from "@nestjs-adk/core";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import "@nestjs-adk/testing/matchers";
import { GoogleAdkEngine } from "./google-adk-engine";

@Injectable()
class WeatherService {
	public fetch(city: string) {
		return { city, tempC: 25 };
	}
}

const weatherSchema = z.object({ city: z.string() });
const model = new ScriptedModel();

@Tool({ name: "get_weather", description: "Current weather for a city.", schema: weatherSchema })
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
	model,
	description: "Answers about the weather.",
	prompt: "You are a weather assistant.",
	tools: [GetWeatherTool],
})
class WeatherAgent extends AdkAgent {}

@Injectable()
class ChatService {
	constructor(public readonly weather: WeatherAgent) {}
}

@Module({ providers: [WeatherService, GetWeatherTool, WeatherAgent, ChatService] })
class FeatureModule {}

describe("GoogleAdkEngine — the ADK's REAL loop with ScriptedModel", () => {
	let app: TestingModule;
	let chat: ChatService;

	beforeEach(async () => {
		model.scripts.length = 0;
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" }), FeatureModule],
		}).compile();
		await app.init();
		chat = app.get(ChatService);
	});

	afterEach(async () => {
		await app.close();
	});

	it("ask(): tool executed by the ADK's LOOP via DI — normalized events, text and usage", async () => {
		model.enqueue([callTool("get_weather", { city: "SP" }), text("It's 25°C in SP.")]);

		const run = await chat.weather.ask({ message: "weather in SP?" });

		expect(run.text).toBe("It's 25°C in SP.");
		const types = run.events.map((e) => e.type);
		expect(types[0]).toBe("run_start");
		expect(types.at(-1)).toBe("final");
		expect(run).toHaveCalledTool("get_weather", { city: "SP" });
		expect(run).toHaveCalledToolTimes("get_weather", 1);

		const toolResult = run.events.find((e) => e.type === "tool_result");
		expect(toolResult && "result" in toolResult ? toolResult.result : null).toMatchObject({ city: "SP", tempC: 25 });
		expect(run.usage.totalTokens).toBeGreaterThan(0);
	});

	it("raw.event preserves the ADK's native Event on every normalized event", async () => {
		model.enqueue([text("hello")]);

		const run = await chat.weather.ask({ message: "hi" });
		const normalized = run.events.filter((e) => e.type !== "run_start" && e.type !== "final");
		expect(normalized.length).toBeGreaterThan(0);
		for (const event of normalized) {
			expect(event.raw?.event).toBeDefined();
		}
	});

	it("the prompt instruction reaches the model (systemInstruction)", async () => {
		model.enqueue([text("ok")]);
		await chat.weather.ask({ message: "hi" });

		const engine = app.get(AdkEngine) as GoogleAdkEngine;
		expect(JSON.stringify(engine.lastRequest?.config?.systemInstruction ?? "")).toContain("You are a weather assistant.");
	});

	it("persistent session: the 2nd turn hydrates the history into the model's context", async () => {
		model.enqueue([text("It's 25°C in SP.")]);
		model.enqueue([text("You're welcome!")]);

		await chat.weather.ask({ sessionId: "chat-1", userId: "u1", message: "weather in SP?" });
		await chat.weather.ask({ sessionId: "chat-1", userId: "u1", message: "thanks" });

		const engine = app.get(AdkEngine) as GoogleAdkEngine;
		const contents = engine.lastRequest?.contents ?? [];
		// history: user("weather in SP?") + model("It's 25°C...") + user("thanks")
		expect(contents.length).toBeGreaterThanOrEqual(3);
		expect(JSON.stringify(contents)).toContain("weather in SP?");
		expect(JSON.stringify(contents)).toContain("It's 25°C in SP.");

		const store = app.get(SessionStore);
		const session = await store.get("chat-1");
		expect(session?.events.filter((e) => e.type === "message")).toHaveLength(4);
	});
});
