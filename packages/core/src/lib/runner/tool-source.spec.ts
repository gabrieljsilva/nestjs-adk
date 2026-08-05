import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { AdkToolSource, type ToolSourceContext } from "../abstracts/adk-tool-source";
import { Agent } from "../decorators/agent.decorator";
import { DuplicateToolSourceError, ToolSourceAuthError, ToolSourceUnavailableError } from "../errors";
import { AdkModule } from "../module/adk.module";
import { ScriptedEngine, callTool, fail, text } from "../testing/scripted-engine";
import type { AgentEvent } from "../types/events";
import type { ResolvedTool } from "../types/resolved-agent";
import { AgentRunner } from "./agent-runner";

/** Records every step of its own lifecycle, so a test can assert on what the runner did to it. */
class FakeSource extends AdkToolSource {
	public opened = 0;
	public closed = 0;
	public lastContext?: ToolSourceContext;

	public constructor(
		public readonly name: string,
		private readonly options: { tools?: string[]; failWith?: Error; trace?: string[]; unclassified?: boolean } = {},
	) {
		super();
	}

	public async open(ctx: ToolSourceContext): Promise<ResolvedTool[]> {
		this.opened += 1;
		this.lastContext = ctx;
		this.options.trace?.push(`${this.name}:start`);
		// A microtask boundary: with parallel opening the other source starts before this one returns.
		await Promise.resolve();
		this.options.trace?.push(`${this.name}:end`);
		if (this.options.failWith) throw this.options.failWith;
		return (this.options.tools ?? []).map((tool) => ({
			name: tool,
			description: `tool ${tool}`,
			schema: z.object({}),
			// Classified: an unclassified source tool falls to `destructive` and pauses for approval,
			// which has its own test below.
			...(this.options.unclassified ? {} : { effect: "read" as const }),
			execute: async () => ({ from: this.name, tool }),
		}));
	}

	public async close(): Promise<void> {
		this.closed += 1;
	}
}

@Agent({ name: "sourced", model: "m", description: "Uses per-run sources.", prompt: "Answer." })
class SourcedAgent extends AdkAgent {}

@Module({ providers: [SourcedAgent] })
class FeatureModule {}

async function collect(stream: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe("per-run tool sources", () => {
	let app: TestingModule;
	let engine: InstanceType<typeof ScriptedEngine>;
	let runner: AgentRunner;
	let agent: SourcedAgent;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" }), FeatureModule],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as InstanceType<typeof ScriptedEngine>;
		runner = app.get(AgentRunner);
		agent = app.get(SourcedAgent);
	});

	afterEach(async () => {
		await app?.close();
	});

	it("hands the source's tools to the agent for that run", async () => {
		const source = new FakeSource("clickup", { tools: ["mcp__clickup__create_task"] });
		engine.enqueue([callTool("mcp__clickup__create_task", {}), text("done")]);

		const run = await agent.ask({ message: "hi", sources: [source] });

		const result = run.events.find((event) => event.type === "tool_result");
		expect(result && "result" in result && result.result).toEqual({ from: "clickup", tool: "mcp__clickup__create_task" });
	});

	it("a source tool without an effect pauses (destructive by default); approve() reopens the source and resumes", async () => {
		const source = new FakeSource("clickup", { tools: ["mcp__clickup__delete_task"], unclassified: true });
		engine.enqueue([callTool("mcp__clickup__delete_task", {}), text("awaiting")]);

		const paused = await runner.ask(SourcedAgent, { sessionId: "src-1", message: "delete it", sources: [source] });

		expect(paused.status).toBe("pending_approval");
		const pending = paused.pending?.[0];
		expect(pending?.tool).toBe("mcp__clickup__delete_task");

		engine.enqueue([text("deleted")]);
		const resumed = await runner.approve(SourcedAgent, {
			sessionId: "src-1",
			// biome-ignore lint/style/noNonNullAssertion: pending action guaranteed above
			callId: pending!.callId,
			sources: [source],
		});

		expect(resumed.status).toBe("completed");
		// Once for the paused run, once for the approval, once for the resumed turn.
		expect(source.opened).toBe(3);
		expect(source.closed).toBe(3);
	});

	it("closes every source when the run finishes", async () => {
		const a = new FakeSource("a", { tools: ["a1"] });
		const b = new FakeSource("b", { tools: ["b1"] });
		engine.enqueue([text("done")]);

		await agent.ask({ message: "hi", sources: [a, b] });

		expect([a.closed, b.closed]).toEqual([1, 1]);
	});

	it("closes the sources when the run throws", async () => {
		const source = new FakeSource("a", { tools: ["a1"] });
		engine.enqueue([fail("provider exploded")]);

		await expect(agent.ask({ message: "hi", sources: [source] })).rejects.toThrow();

		// a connection left open by a failed run is a leak nobody is watching for
		expect(source.closed).toBe(1);
	});

	it("closes the sources when the consumer abandons the stream", async () => {
		const source = new FakeSource("a", { tools: ["a1"] });
		engine.enqueue([text("first"), text("second")]);

		for await (const event of agent.stream.ask({ message: "hi", sources: [source] })) {
			if (event.type === "llm_response") break;
		}

		// `break` triggers the generator's return(), which has to reach the finally
		expect(source.closed).toBe(1);
	});

	it("closes a source that failed while opening", async () => {
		const source = new FakeSource("a", { failWith: new ToolSourceUnavailableError("a", new Error("down")) });
		engine.enqueue([text("done")]);

		await agent.ask({ message: "hi", sources: [source] });

		// opening may have acquired a socket before failing: only close() reclaims it
		expect(source.closed).toBe(1);
	});

	it("rejects duplicate names before opening anything", async () => {
		const first = new FakeSource("clickup", { tools: ["x"] });
		const second = new FakeSource("clickup", { tools: ["y"] });
		engine.enqueue([text("done")]);

		await expect(agent.ask({ message: "hi", sources: [first, second] })).rejects.toBeInstanceOf(DuplicateToolSourceError);
		// the prefix would stop identifying the origin: no reason to pay for handshakes first
		expect([first.opened, second.opened]).toEqual([0, 0]);
	});

	it("opens the sources in parallel", async () => {
		const trace: string[] = [];
		const a = new FakeSource("a", { tools: ["a1"], trace });
		const b = new FakeSource("b", { tools: ["b1"], trace });
		engine.enqueue([text("done")]);

		await agent.ask({ message: "hi", sources: [a, b] });

		// serial opening would read a:start, a:end, b:start; five integrations should not cost five round trips
		expect(trace.indexOf("b:start")).toBeLessThan(trace.indexOf("a:end"));
	});

	it("reports a source that needs re-authorization without ending the run", async () => {
		const broken = new FakeSource("clickup", { failWith: new ToolSourceAuthError("clickup", "token expired") });
		const working = new FakeSource("linear", { tools: ["linear__list"] });
		engine.enqueue([text("answered anyway")]);

		const run = await agent.ask({ message: "hi", sources: [broken, working] });

		expect(run.text).toBe("answered anyway");
		expect(run.reauth).toEqual([{ source: "clickup", reason: "token expired" }]);
	});

	it("emits reauth as an event, so a streaming consumer sees it too", async () => {
		const broken = new FakeSource("clickup", { failWith: new ToolSourceAuthError("clickup", "revoked") });
		engine.enqueue([text("done")]);

		const events = await collect(agent.stream.ask({ message: "hi", sources: [broken] }));

		expect(events.some((event) => event.type === "reauth_required" && event.source === "clickup")).toBe(true);
	});

	it("keeps going when a source is simply unreachable", async () => {
		const down = new FakeSource("intranet", {
			failWith: new ToolSourceUnavailableError("intranet", new Error("ECONNREFUSED")),
		});
		engine.enqueue([text("done")]);

		const run = await agent.ask({ message: "hi", sources: [down] });

		expect(run.text).toBe("done");
		// being offline is not something the user can fix by reconnecting
		expect(run.reauth).toEqual([]);
	});

	it("lets an unexpected failure end the run", async () => {
		const source = new FakeSource("a", { failWith: new Error("bug in the source") });
		engine.enqueue([text("done")]);

		// only the two declared outcomes are survivable; anything else is a defect worth surfacing
		await expect(agent.ask({ message: "hi", sources: [source] })).rejects.toThrow("bug in the source");
	});

	it("runs normally when no sources are given", async () => {
		engine.enqueue([text("done")]);

		const run = await agent.ask({ message: "hi" });

		expect(run.text).toBe("done");
		expect(run.reauth).toEqual([]);
	});

	it.each(["../../etc/passwd", "/etc/passwd", "a/../../b"])("refuses to read the artifact %s", async (name) => {
		const source = new FakeSource("any", { tools: ["noop"] });
		engine.enqueue([callTool("read_artifact", { name }), text("done")]);

		const run = await agent.ask({ message: "read it", sources: [source] });

		// an ArtifactStore backed by the filesystem joins this to a path, and `..` would read outside
		// the session's own scope
		const result = run.events.find((event) => event.type === "tool_result");
		expect(JSON.stringify(result)).toContain("not allowed");
	});

	it("tells the source which run it is being opened for", async () => {
		const source = new FakeSource("a", { tools: ["a1"] });
		engine.enqueue([text("done")]);

		await agent.ask({ message: "hi", sessionId: "s1", userId: "u1", sources: [source] });

		expect(source.lastContext).toMatchObject({ agentName: "sourced", sessionId: "s1", userId: "u1" });
		expect(source.lastContext?.signal).toBeInstanceOf(AbortSignal);
	});

	it("explain() opens and closes the sources", async () => {
		const source = new FakeSource("a", { tools: ["a1"] });

		await runner.explain(SourcedAgent, { message: "hi", sources: [source] });

		// a dry run that skipped them would describe a context missing the tool declarations
		expect([source.opened, source.closed]).toEqual([1, 1]);
	});

	it("resolve() never opens a source it cannot close", async () => {
		const source = new FakeSource("a", { tools: ["a1"] });

		await runner.resolve(SourcedAgent, { message: "hi", sources: [source] });

		expect([source.opened, source.closed]).toEqual([0, 0]);
	});
});
