import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { SessionStore } from "../abstracts/session-store";
import { Agent } from "../decorators/agent.decorator";
import { Skill } from "../decorators/skill.decorator";
import { OutputValidationError } from "../errors";
import { AdkModule } from "../module/adk.module";
import { AdkPrompt, type PromptContext } from "../prompts/adk-prompt";
import { AgentRegistry } from "../registry/agent-registry";
import { ScriptedEngine, callTool, text } from "../testing/scripted-engine";
import type { ToolContext } from "../types/tool-context";

const promptsDir = mkdtempSync(join(tmpdir(), "adk-prompts-"));
writeFileSync(join(promptsDir, "weather.prompt.md"), "Weather assistant. Unit: {{unit}}.");
writeFileSync(join(promptsDir, "static.prompt.md"), "Plain static prompt.");
writeFileSync(join(promptsDir, "contextual.prompt.md"), "Report for tenant {{tenantId}}.");

@Injectable()
class Config {
	public readonly unit = "celsius";
}

@Injectable()
class WeatherFilePrompt extends AdkPrompt {
	constructor(private readonly config: Config) {
		super();
	}

	build() {
		return this.fromFile("weather.prompt.md", { unit: this.config.unit });
	}
}

@Agent({ name: "template_agent", model: "m", description: "d", prompt: WeatherFilePrompt })
class TemplateAgent extends AdkAgent {}

@Agent({ name: "static_agent", model: "m", description: "d", promptFile: "static.prompt.md" })
class StaticAgent extends AdkAgent {}

@Injectable()
class ContextualPrompt extends AdkPrompt {
	build(ctx: PromptContext) {
		return this.fromFile("contextual.prompt.md", { tenantId: ctx.state.get<string>("tenantId") ?? "unknown" });
	}
}

@Agent({ name: "contextual_agent", model: "m", description: "d", prompt: ContextualPrompt })
class ContextualAgent extends AdkAgent {}

@Agent({ name: "skilled_agent", model: "m", description: "d" })
class SkilledAgent extends AdkAgent {
	@Skill({ name: "tax_rules", description: "Tax rules." })
	tax() {
		return "Current table: 2026.";
	}
}

const reportSchema = z.object({ city: z.string(), tempC: z.number() });

@Agent({ name: "reporter", model: "m", description: "d", output: reportSchema, outputKey: "report" })
class ReporterAgent extends AdkAgent<typeof reportSchema> {}

@Module({
	providers: [
		Config,
		WeatherFilePrompt,
		ContextualPrompt,
		TemplateAgent,
		StaticAgent,
		ContextualAgent,
		SkilledAgent,
		ReporterAgent,
	],
})
class FeatureModule {}

describe("F6: prompt file, load_skill and structured output", () => {
	let app: TestingModule;
	let engine: ScriptedEngine;
	let registry: AgentRegistry;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m", prompts: { dir: promptsDir } }),
				FeatureModule,
			],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as ScriptedEngine;
		registry = app.get(AgentRegistry);
	});

	afterEach(async () => {
		await app.close();
	});

	it("@Prompt('file.md') with variables from the method (DI)", async () => {
		engine.enqueue([text("ok")]);
		await registry.getRef(TemplateAgent).ask({ message: "hi" });
		expect(engine.lastAgent?.instruction).toContain("Weather assistant. Unit: celsius.");
	});

	it("@Prompt method receives the run ToolContext (per-run data in the instruction)", async () => {
		engine.enqueue([text("ok")]);
		await registry.getRef(ContextualAgent).ask({ message: "hi", state: { tenantId: "tenant-42" } });
		expect(engine.lastAgent?.instruction).toContain("Report for tenant tenant-42.");
	});

	it("@Prompt('file.md') plain (empty method)", async () => {
		engine.enqueue([text("ok")]);
		await registry.getRef(StaticAgent).ask({ message: "hi" });
		expect(engine.lastAgent?.instruction).toContain("Plain static prompt.");
	});

	it("on-demand skill: catalog in the instruction + load_skill tool returns the content", async () => {
		engine.enqueue([callTool("load_skill", { name: "tax_rules" }), text("ok")]);
		const run = await registry.getRef(SkilledAgent).ask({ message: "hi" });

		expect(engine.lastAgent?.instruction).toContain("tax_rules: Tax rules.");
		const result = run.events.find((e) => e.type === "tool_result");
		expect(result && "result" in result ? result.result : null).toMatchObject({
			name: "tax_rules",
			content: "Current table: 2026.",
		});
	});

	it("load_skill with a nonexistent name returns an error TO THE LLM (not an exception)", async () => {
		engine.enqueue([callTool("load_skill", { name: "ghost" }), text("ok")]);
		const run = await registry.getRef(SkilledAgent).ask({ message: "hi" });

		const result = run.events.find((e) => e.type === "tool_result");
		expect(JSON.stringify(result && "result" in result ? result.result : null)).toContain("ghost");
	});

	it("structured output: valid JSON → typed output + outputKey in the session state", async () => {
		engine.enqueue([text('{"city": "SP", "tempC": 25}')]);
		const run = await registry.getRef(ReporterAgent).ask({ sessionId: "s1", message: "weather?" });

		expect(run.output).toEqual({ city: "SP", tempC: 25 });

		const session = await app.get(SessionStore).get("s1");
		expect(session?.state.report).toEqual({ city: "SP", tempC: 25 });
	});

	it("structured output: payload outside the schema → OutputValidationError with the raw output attached", async () => {
		engine.enqueue([text('{"city": "SP"}')]);
		await expect(registry.getRef(ReporterAgent).ask({ message: "weather?" })).rejects.toBeInstanceOf(
			OutputValidationError,
		);

		engine.enqueue([text("not json")]);
		const error = await registry
			.getRef(ReporterAgent)
			.ask({ message: "weather?" })
			.catch((e: OutputValidationError) => e);
		expect(error).toBeInstanceOf(OutputValidationError);
		expect((error as OutputValidationError).rawOutput).toBe("not json");
	});
});
