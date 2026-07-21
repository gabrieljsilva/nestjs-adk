import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { AdkSkill } from "../abstracts/adk-skill";
import { AdkTool } from "../abstracts/adk-tool";
import { AdkWorkflow } from "../abstracts/adk-workflow";
import { Agent } from "../decorators/agent.decorator";
import { Skill } from "../decorators/skill.decorator";
import { Tool } from "../decorators/tool.decorator";
import { WorkflowAgent } from "../decorators/workflow-agent.decorator";
import { AdkModule } from "../module/adk.module";
import { AdkPrompt } from "../prompts/adk-prompt";
import { AgentRef } from "./agent-ref";
import { AgentRegistry } from "./agent-registry";

@Injectable()
class FakeEngine extends AdkEngine {
	public async *run(): AsyncGenerator<never> {}
}

@Injectable()
class WeatherConfig {
	public readonly unit = "celsius";
}

@Injectable()
class WeatherPrompt extends AdkPrompt {
	constructor(private readonly config: WeatherConfig) {
		super();
	}

	build() {
		return `Weather assistant. Unit: ${this.config.unit}.`;
	}
}

const weatherSchema = z.object({ city: z.string() });

@Tool({ name: "get_weather", description: "Current weather.", schema: weatherSchema })
class GetWeatherTool extends AdkTool<typeof weatherSchema> {
	constructor(private readonly config: WeatherConfig) {
		super();
	}

	execute(input: z.infer<typeof weatherSchema>) {
		return { city: input.city, unit: this.config.unit };
	}
}

@Skill({ name: "tax_rules", description: "Tax rules." })
class TaxSkill extends AdkSkill {
	content() {
		return "Current table...";
	}
}

@Agent({
	name: "weather_assistant",
	model: "gemini-2.5-flash",
	description: "Answers about the weather.",
	prompt: WeatherPrompt,
	tools: [GetWeatherTool],
	skills: [TaxSkill],
})
class WeatherAgent extends AdkAgent {
	constructor(private readonly config: WeatherConfig) {
		super();
	}

	@Tool({ description: "Converts temperature.", schema: z.object({ value: z.number() }) })
	convert(input: { value: number }) {
		return input.value * 1.8 + 32;
	}
}

@Agent({ name: "concierge", description: "Coordinates.", subAgents: [WeatherAgent] })
class ConciergeAgent extends AdkAgent {}

@WorkflowAgent({ name: "pipeline", mode: "sequential", agents: [WeatherAgent, ConciergeAgent] })
class Pipeline extends AdkWorkflow {}

@Injectable()
class ChatService {
	constructor(public readonly weather: WeatherAgent) {}
}

@Module({
	providers: [
		WeatherConfig,
		WeatherPrompt,
		GetWeatherTool,
		TaxSkill,
		WeatherAgent,
		ConciergeAgent,
		Pipeline,
		ChatService,
	],
})
class FeatureModule {}

describe("AgentRegistry", () => {
	async function bootstrap() {
		const moduleRef = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: FakeEngine, defaultModel: "gemini-2.5-flash" }), FeatureModule],
		}).compile();
		await moduleRef.init();
		return moduleRef;
	}

	it("discovers agents and builds complete definitions", async () => {
		const app = await bootstrap();
		const registry = app.get(AgentRegistry);

		const weather = registry.get("weather_assistant");
		expect(weather.type).toBe(WeatherAgent);
		expect(weather.promptInstance).toBeInstanceOf(WeatherPrompt);
		expect(weather.tools.map((t) => t.options.name)).toEqual(["get_weather", "convert"]);
		expect(weather.skills.map((s) => s.options.name)).toEqual(["tax_rules"]);

		const concierge = registry.get("concierge");
		expect(concierge.subAgents).toEqual([WeatherAgent]);
		// no model of its own → inherits the module's defaultModel
		expect(concierge.model).toBe("gemini-2.5-flash");

		const pipeline = registry.get("pipeline");
		expect(pipeline.workflow).toMatchObject({ mode: "sequential", agents: [WeatherAgent, ConciergeAgent] });
		await app.close();
	});

	it("class tools are instances resolved via DI", async () => {
		const app = await bootstrap();
		const registry = app.get(AgentRegistry);
		const classTool = registry.get("weather_assistant").tools[0];
		expect(classTool?.kind).toBe("class");
		if (classTool?.kind === "class") {
			expect(classTool.instance).toBeInstanceOf(GetWeatherTool);
			expect(classTool.instance.execute({ city: "SP" })).toEqual({ city: "SP", unit: "celsius" });
		}
		await app.close();
	});

	it("the AdkPrompt builder resolves with full DI", async () => {
		const app = await bootstrap();
		const definition = app.get(AgentRegistry).get("weather_assistant");
		expect(await definition.promptInstance?.build({} as never)).toBe("Weather assistant. Unit: celsius.");
		await app.close();
	});

	it("the agent instance is the handle — plain constructor injection", async () => {
		const app = await bootstrap();
		const chat = app.get(ChatService);
		expect(chat.weather).toBeInstanceOf(WeatherAgent);
		expect(chat.weather).toBe(app.get(WeatherAgent));
		expect(typeof chat.weather.ask).toBe("function");
		await app.close();
	});

	it("getRef still exposes the AgentRef wrapper (registry/testing API)", async () => {
		const app = await bootstrap();
		const ref = app.get(AgentRegistry).getRef(WeatherAgent);
		expect(ref).toBeInstanceOf(AgentRef);
		expect(ref.name).toBe("weather_assistant");
		await app.close();
	});

	it("engine is resolved via the abstract contract", async () => {
		const app = await bootstrap();
		expect(app.get(AdkEngine)).toBeInstanceOf(FakeEngine);
		await app.close();
	});
});
