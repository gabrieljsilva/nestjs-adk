import { join } from "node:path";
import {
	AdkAgent,
	AdkEngine,
	AdkModule,
	Agent,
	AgentRegistry,
	AgentRunner,
	McpConnectionError,
	ScriptedEngine,
	UnresolvedToolsetError,
	callTool,
	text,
	toolset,
} from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { mcpTools } from "../index";
import { McpModule } from "./mcp.module";

const FIXTURE = join(__dirname, "../../test/fixtures/echo-server.mjs");
const fixtureServer = {
	name: "fixture",
	transport: { type: "stdio" as const, command: process.execPath, args: [FIXTURE] },
};

@Agent({ name: "mcp_agent", model: "m", description: "d", tools: [mcpTools("fixture")] })
class McpAgent extends AdkAgent {}

@Agent({ name: "filtered_agent", model: "m", description: "d", tools: [mcpTools("fixture", ["echo"])] })
class FilteredAgent extends AdkAgent {}

@Module({ providers: [McpAgent, FilteredAgent] })
class FeatureModule {}

describe("@nestjs-adk/mcp — integration with a real MCP server (stdio)", () => {
	let app: TestingModule;
	let engine: ScriptedEngine;
	let registry: AgentRegistry;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" }),
				McpModule.forRoot({ servers: [fixtureServer] }),
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

	it("MCP tool runs end-to-end through the agent's normal pipeline", async () => {
		engine.enqueue([callTool("echo", { message: "hi" }), text("echoed")]);
		const run = await registry.getRef(McpAgent).ask({ message: "echo hi" });

		const result = run.events.find((e) => e.type === "tool_result" && e.tool === "echo");
		expect(result && "result" in result ? result.result : null).toBe("echo:hi");
	});

	it("MCP tool with isError returns { error } TO THE LLM (not an exception)", async () => {
		engine.enqueue([callTool("boom", {}), text("handled")]);
		const run = await registry.getRef(McpAgent).ask({ message: "blow up" });

		const result = run.events.find((e) => e.type === "tool_result" && e.tool === "boom");
		expect(result && "result" in result ? result.result : null).toEqual({ error: "kaboom" });
	});

	it("catalog with converted schema (JSON Schema → Zod) and tool filtering", async () => {
		const runner = app.get(AgentRunner);

		const full = await runner.resolve(McpAgent);
		const names = full.tools.map((tool) => tool.name);
		expect(names).toContain("echo");
		expect(names).toContain("boom");

		const echo = full.tools.find((tool) => tool.name === "echo");
		expect(echo?.schema.safeParse({ message: "x" }).success).toBe(true);
		expect(echo?.schema.safeParse({}).success).toBe(false);

		const filtered = await runner.resolve(FilteredAgent);
		const filteredNames = filtered.tools.map((tool) => tool.name);
		expect(filteredNames).toContain("echo");
		expect(filteredNames).not.toContain("boom");
	});
});

describe("@nestjs-adk/mcp — boot resilience", () => {
	const downServer = {
		name: "down",
		transport: { type: "stdio" as const, command: process.execPath, args: ["-e", "process.exit(1)"] },
	};

	it("server down + optional: true → boot succeeds and the agent ends up without those tools", async () => {
		@Agent({ name: "opt_agent", model: "m", description: "d", tools: [toolset("down")] })
		class OptAgent extends AdkAgent {}

		const app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" }),
				McpModule.forRoot({ servers: [{ ...downServer, optional: true }] }),
			],
			providers: [OptAgent],
		}).compile();
		await app.init();

		const resolved = await app.get(AgentRunner).resolve(OptAgent);
		expect(resolved.tools.filter((tool) => tool.name !== "read_artifact")).toHaveLength(0);
		await app.close();
	});

	it("server down without optional → boot fails with McpConnectionError", async () => {
		const module = Test.createTestingModule({
			imports: [
				AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" }),
				McpModule.forRoot({ servers: [downServer] }),
			],
		}).compile();

		await expect(module.then((m) => m.init())).rejects.toBeInstanceOf(McpConnectionError);
	});

	it("toolset referenced without McpModule → UnresolvedToolsetError at boot", async () => {
		@Agent({ name: "ghost_ts", model: "m", description: "d", tools: [toolset("nope")] })
		class GhostAgent extends AdkAgent {}

		const module = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" })],
			providers: [GhostAgent],
		}).compile();

		await expect(module.init()).rejects.toBeInstanceOf(UnresolvedToolsetError);
	});
});
