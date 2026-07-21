import "reflect-metadata";
import { join } from "node:path";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkSkill } from "../abstracts/adk-skill";
import { AdkTool } from "../abstracts/adk-tool";
import { AdkWorkflow } from "../abstracts/adk-workflow";
import {
	AGENT_METADATA,
	INLINE_SKILLS_METADATA,
	INLINE_TOOLS_METADATA,
	SKILL_METADATA,
	TOOL_METADATA,
	WORKFLOW_METADATA,
} from "../constants";
import { Agent } from "./agent.decorator";
import { Skill } from "./skill.decorator";
import { Tool } from "./tool.decorator";
import { WorkflowAgent } from "./workflow-agent.decorator";

const weatherSchema = z.object({ city: z.string() });

@Tool({ name: "get_weather", description: "Current weather.", schema: weatherSchema })
class GetWeatherTool extends AdkTool<typeof weatherSchema> {
	execute(input: z.infer<typeof weatherSchema>) {
		return { city: input.city, tempC: 25 };
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
	prompt: "You are a weather assistant.",
	description: "Answers about the weather.",
	tools: [GetWeatherTool],
	skills: [TaxSkill],
})
class WeatherAgent extends AdkAgent {
	@Tool({ description: "Converts temperature.", schema: z.object({ value: z.number() }) })
	convert(input: { value: number }) {
		return input.value * 1.8 + 32;
	}

	@Skill({ name: "tone", description: "Tone of voice.", mode: "always" })
	tone() {
		return "Answer in English.";
	}
}

@WorkflowAgent({ name: "pipeline", mode: "sequential", agents: [WeatherAgent] })
class Pipeline extends AdkWorkflow {}

describe("decorators", () => {
	it("@Agent registers the options on the class", () => {
		const meta = Reflect.getMetadata(AGENT_METADATA, WeatherAgent);
		expect(meta).toMatchObject({ name: "weather_assistant", model: "gemini-2.5-flash", tools: [GetWeatherTool] });
	});

	it("@Tool on a class registers options and requires execute via the contract", () => {
		const meta = Reflect.getMetadata(TOOL_METADATA, GetWeatherTool);
		expect(meta).toMatchObject({ name: "get_weather", description: "Current weather." });
		expect(meta.schema).toBe(weatherSchema);
	});

	it("@Tool on a method registers an inline list with the name defaulting to the method", () => {
		const meta = Reflect.getMetadata(INLINE_TOOLS_METADATA, WeatherAgent);
		expect(meta).toHaveLength(1);
		expect(meta[0]).toMatchObject({ method: "convert", options: { description: "Converts temperature." } });
	});

	it("@Skill on a class and on a method register metadata with the default mode on-demand", () => {
		expect(Reflect.getMetadata(SKILL_METADATA, TaxSkill)).toMatchObject({ name: "tax_rules", mode: "on-demand" });
		const inline = Reflect.getMetadata(INLINE_SKILLS_METADATA, WeatherAgent);
		expect(inline[0]).toMatchObject({ method: "tone", options: { name: "tone", mode: "always" } });
	});

	it("@Agent normalizes a relative promptFile to an absolute path (relative to THIS file)", () => {
		@Agent({ name: "rel", description: "d", promptFile: "./fixtures/rel.prompt.md" })
		class RelAgent extends AdkAgent {}

		const meta = Reflect.getMetadata(AGENT_METADATA, RelAgent);
		expect(meta.promptFile).toBe(join(__dirname, "fixtures/rel.prompt.md"));
	});

	it("@Agent keeps a plain promptFile untouched (resolved later against prompts.dir)", () => {
		@Agent({ name: "plain", description: "d", promptFile: "agents/support/main.prompt.md" })
		class PlainAgent extends AdkAgent {}

		expect(Reflect.getMetadata(AGENT_METADATA, PlainAgent).promptFile).toBe("agents/support/main.prompt.md");
	});

	it("@WorkflowAgent registers mode and agents", () => {
		expect(Reflect.getMetadata(WORKFLOW_METADATA, Pipeline)).toMatchObject({
			name: "pipeline",
			mode: "sequential",
			agents: [WeatherAgent],
		});
	});

	it("class decorators apply @Injectable (Nest watermark)", () => {
		for (const cls of [WeatherAgent, GetWeatherTool, TaxSkill, Pipeline]) {
			expect(Reflect.getMetadata("__injectable__", cls)).toBe(true);
		}
	});
});
