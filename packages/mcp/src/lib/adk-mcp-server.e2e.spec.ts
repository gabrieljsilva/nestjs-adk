import { join } from "node:path";
import { AdkAgent, AdkEngine, AdkModule, Agent, AgentRegistry, ScriptedEngine, callTool, text } from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { AdkMcpServer } from "./adk-mcp-server";
import { EnvAuth } from "./mcp-auth";

const FIXTURE = join(__dirname, "../../test/fixtures/echo-server.mjs");

function fixtureServer(name: string, options: { tools?: string[]; auth?: EnvAuth } = {}): AdkMcpServer {
	return new AdkMcpServer({
		name,
		transport: { type: "stdio", command: process.execPath, args: [FIXTURE] },
		...options,
	});
}

@Agent({ name: "connected", model: "m", description: "Uses the user's integrations.", prompt: "Answer." })
class ConnectedAgent extends AdkAgent {}

@Module({ providers: [ConnectedAgent] })
class FeatureModule {}

describe("@nestjs-adk/mcp: a user's own server, connected per run", () => {
	let app: TestingModule;
	let engine: ScriptedEngine;
	let registry: AgentRegistry;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" }), FeatureModule],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as ScriptedEngine;
		registry = app.get(AgentRegistry);
	});

	afterEach(async () => {
		await app?.close();
	});

	it("turns the server's catalog into tools named after the connection", async () => {
		engine.enqueue([text("done")]);

		await registry.getRef(ConnectedAgent).ask({ message: "hi", sources: [fixtureServer("clickup")] });

		const names = engine.lastAgent?.tools.map((tool) => tool.name) ?? [];
		expect(names).toContain("mcp__clickup__echo");
		expect(names).toContain("mcp__clickup__boom");
	});

	it("runs a tool against the real server", async () => {
		engine.enqueue([callTool("mcp__clickup__echo", { message: "hi" }), text("echoed")]);

		const run = await registry.getRef(ConnectedAgent).ask({ message: "echo hi", sources: [fixtureServer("clickup")] });

		const result = run.events.find((event) => event.type === "tool_result");
		expect(result && "result" in result ? result.result : null).toBe("echo:hi");
	});

	it("exposes only the tools the connection asked for", async () => {
		engine.enqueue([text("done")]);

		await registry
			.getRef(ConnectedAgent)
			.ask({ message: "hi", sources: [fixtureServer("clickup", { tools: ["echo"] })] });

		const names = engine.lastAgent?.tools.map((tool) => tool.name) ?? [];
		expect(names).toContain("mcp__clickup__echo");
		expect(names).not.toContain("mcp__clickup__boom");
	});

	it("hands the schema over exactly as the server published it", async () => {
		engine.enqueue([text("done")]);

		await registry.getRef(ConnectedAgent).ask({ message: "hi", sources: [fixtureServer("clickup")] });

		const echo = engine.lastAgent?.tools.find((tool) => tool.name === "mcp__clickup__echo");
		// No Zod in between any more: the server owns this contract, the engine filters it per provider.
		const schema = echo?.schema as { type?: string; properties?: Record<string, unknown>; required?: string[] };
		expect(schema.type).toBe("object");
		expect(schema.properties).toHaveProperty("message");
		expect(schema.required).toContain("message");

		// The whole declaration (annotations included) still travels in `raw` for a permissions UI.
		const raw = echo?.raw as { name: string; inputSchema?: { properties?: Record<string, unknown> } };
		expect(raw.name).toBe("echo");
		expect(raw.inputSchema?.properties).toHaveProperty("message");
	});

	it("hands a failing tool back to the model instead of ending the conversation", async () => {
		engine.enqueue([callTool("mcp__clickup__boom", {}), text("handled")]);

		const run = await registry.getRef(ConnectedAgent).ask({ message: "boom", sources: [fixtureServer("clickup")] });

		expect(run.text).toBe("handled");
		expect(run.events.find((event) => event.type === "tool_result")).toMatchObject({ result: { error: "kaboom" } });
	});

	it("lets the same server be connected twice under different names", async () => {
		engine.enqueue([callTool("mcp__pessoal__echo", { message: "mine" }), text("done")]);

		const run = await registry.getRef(ConnectedAgent).ask({
			message: "hi",
			sources: [fixtureServer("pessoal"), fixtureServer("empresa")],
		});

		const names = engine.lastAgent?.tools.map((tool) => tool.name) ?? [];
		// two accounts on the same product: the prefix is what tells the model which one it is using
		expect(names).toContain("mcp__pessoal__echo");
		expect(names).toContain("mcp__empresa__echo");
		expect(run.events.find((event) => event.type === "tool_result")).toMatchObject({ result: "echo:mine" });
	});

	it("delivers the credential to the server without it passing through the model", async () => {
		engine.enqueue([callTool("mcp__github__whoami", {}), text("done")]);

		const run = await registry.getRef(ConnectedAgent).ask({
			message: "who am i",
			sources: [fixtureServer("github", { auth: new EnvAuth({ FIXTURE_TOKEN: "secret-token" }) })],
		});

		expect(run.events.find((event) => event.type === "tool_result")).toMatchObject({ result: "secret-token" });
		// the secret reaches the process, never the conversation
		const declared = engine.lastAgent?.tools.map((tool) => JSON.stringify(tool)).join("") ?? "";
		expect(declared).not.toContain("secret-token");
	});

	it("answers without the tools of a server that will not start", async () => {
		engine.enqueue([text("answered anyway")]);
		const broken = new AdkMcpServer({
			name: "offline",
			transport: { type: "stdio", command: process.execPath, args: [join(__dirname, "does-not-exist.mjs")] },
		});

		const run = await registry.getRef(ConnectedAgent).ask({ message: "hi", sources: [broken, fixtureServer("ok")] });

		expect(run.text).toBe("answered anyway");
		// one integration being down is not a reason to refuse the conversation
		expect(run.reauth).toEqual([]);
		const names = engine.lastAgent?.tools.map((tool) => tool.name) ?? [];
		expect(names).toContain("mcp__ok__echo");
		expect(names.some((name) => name.startsWith("mcp__offline__"))).toBe(false);
	});
});
