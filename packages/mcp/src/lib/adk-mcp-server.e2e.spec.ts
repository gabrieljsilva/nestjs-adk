import "reflect-metadata";
import { join } from "node:path";
import { Agent } from "@nestjs-adk/core";
import {
	AdkModule,
	AdkModuleOptions,
	AgentRegistry,
	LlmModel,
	ModelCapabilities,
	ModelCapability,
	ModelChunk,
	ModelContextWindow,
	ModelDescriptor,
	ModelIdentity,
	type ModelRequest,
	ModelUsage,
	RunLimits,
	RuntimeOptions,
	ShutdownOptions,
	ToolCallDelta,
	ToolResultMessage,
} from "@nestjs-adk/core";
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

/** Calls one tool on the first turn and answers on the second, recording every request. */
class ScriptedModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];

	public constructor(private readonly call?: { tool: string; args: Record<string, unknown> }) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		const answered = request.messages.some((message) => message instanceof ToolResultMessage);
		if (this.call !== undefined && !answered) {
			yield ModelChunk.toolCall(new ToolCallDelta(0, JSON.stringify(this.call.args), "c-1", this.call.tool));
			yield ModelChunk.finish("tool_calls");
			return;
		}
		yield ModelChunk.text("done");
		yield ModelChunk.usage(ModelUsage.of(10, 2));
		yield ModelChunk.finish("stop");
	}
}

@Agent({ name: "connected", description: "Uses the user's integrations.", prompt: "Answer." })
class ConnectedAgent {}

@Module({ providers: [ConnectedAgent] })
class FeatureModule {}

describe("@nestjs-adk/mcp over the native runtime", () => {
	let app: TestingModule;

	afterEach(async () => {
		await app?.close();
	});

	async function bootWith(model: LlmModel, ...sources: readonly AdkMcpServer[]): Promise<TestingModule> {
		const runtime = new RuntimeOptions(ShutdownOptions.waitIndefinitely(), RunLimits.none(), [], undefined, undefined, [
			...sources,
		]);
		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot(new AdkModuleOptions(model, undefined, undefined, undefined, undefined, runtime)),
				FeatureModule,
			],
		}).compile();
		await app.init();
		return app;
	}

	it("turns the server's catalog into tools named after the connection", async () => {
		const model = new ScriptedModel();
		const booted = await bootWith(model, fixtureServer("clickup"));

		await booted.get(AgentRegistry).get("connected").ask("hi");

		const names = model.requests[0]?.tools.map((tool) => tool.name) ?? [];
		expect(names).toContain("mcp__clickup__echo");
		expect(names).toContain("mcp__clickup__boom");
	});

	it("runs a tool against the real server", async () => {
		const model = new ScriptedModel({ tool: "mcp__clickup__echo", args: { message: "hi" } });
		const booted = await bootWith(model, fixtureServer("clickup"));

		await booted.get(AgentRegistry).get("connected").ask("echo hi");

		const results = model.requests[1]?.messages.filter((message) => message instanceof ToolResultMessage) ?? [];
		expect(JSON.stringify(results[0]?.output)).toContain("echo:hi");
	});

	it("exposes only the tools the connection asked for", async () => {
		const model = new ScriptedModel();
		const booted = await bootWith(model, fixtureServer("clickup", { tools: ["echo"] }));

		await booted.get(AgentRegistry).get("connected").ask("hi");

		const names = model.requests[0]?.tools.map((tool) => tool.name) ?? [];
		expect(names).toContain("mcp__clickup__echo");
		expect(names).not.toContain("mcp__clickup__boom");
	});

	it("hands the schema over exactly as the server published it", async () => {
		const model = new ScriptedModel();
		const booted = await bootWith(model, fixtureServer("clickup"));

		await booted.get(AgentRegistry).get("connected").ask("hi");

		const echo = model.requests[0]?.tools.find((tool) => tool.name === "mcp__clickup__echo");
		const schema = Object(echo?.parameters);
		expect(Reflect.get(schema, "type")).toBe("object");
		expect(Object.keys(Object(Reflect.get(schema, "properties")))).toContain("message");
	});

	it("hands a failing tool back to the model instead of ending the conversation", async () => {
		const model = new ScriptedModel({ tool: "mcp__clickup__boom", args: {} });
		const booted = await bootWith(model, fixtureServer("clickup"));

		const result = await booted.get(AgentRegistry).get("connected").ask("boom");

		expect(result.text).toBe("done");
		const results = model.requests[1]?.messages.filter((message) => message instanceof ToolResultMessage) ?? [];
		expect(JSON.stringify(results[0]?.output)).toContain("kaboom");
	});

	it("lets the same server be connected twice under different names", async () => {
		const model = new ScriptedModel();
		const booted = await bootWith(model, fixtureServer("pessoal"), fixtureServer("empresa"));

		await booted.get(AgentRegistry).get("connected").ask("hi");

		const names = model.requests[0]?.tools.map((tool) => tool.name) ?? [];
		expect(names).toContain("mcp__pessoal__echo");
		expect(names).toContain("mcp__empresa__echo");
	});

	it("delivers the credential to the server without it passing through the model", async () => {
		const model = new ScriptedModel({ tool: "mcp__github__whoami", args: {} });
		const booted = await bootWith(model, fixtureServer("github", { auth: new EnvAuth({ FIXTURE_TOKEN: "secret" }) }));

		await booted.get(AgentRegistry).get("connected").ask("who am i");

		const results = model.requests[1]?.messages.filter((message) => message instanceof ToolResultMessage) ?? [];
		expect(JSON.stringify(results[0]?.output)).toContain("secret");
		expect(JSON.stringify(model.requests[0]?.tools)).not.toContain("secret");
	});

	it("answers without the tools of a server that will not start", async () => {
		const model = new ScriptedModel();
		const broken = new AdkMcpServer({
			name: "offline",
			transport: { type: "stdio", command: process.execPath, args: [join(__dirname, "does-not-exist.mjs")] },
		});
		const booted = await bootWith(model, broken, fixtureServer("ok"));

		const result = await booted.get(AgentRegistry).get("connected").ask("hi");

		expect(result.text).toBe("done");
		const names = model.requests[0]?.tools.map((tool) => tool.name) ?? [];
		expect(names).toContain("mcp__ok__echo");
		expect(names.some((name) => name.startsWith("mcp__offline__"))).toBe(false);
	});
});
