import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { SessionStore } from "../abstracts/session-store";
import { Agent } from "../decorators/agent.decorator";
import { Tool } from "../decorators/tool.decorator";
import { AdkModule } from "../module/adk.module";
import { AgentRegistry } from "../registry/agent-registry";
import { ScriptedEngine, callTool, text } from "../testing/scripted-engine";
import type { ToolContext } from "../types/tool-context";

@Injectable()
class Spy {
	public archived: unknown[] = [];
	public audited: unknown[] = [];
}

const archiveSchema = z.object({ documentId: z.string() });

/** Scope lives in the state, never in the schema; the model must not be able to forge it. */
@Agent({
	name: "archivist",
	model: "m",
	description: "Archives documents.",
	state: z.object({ workspaceId: z.string().min(1) }),
})
class ArchivistAgent extends AdkAgent {
	constructor(private readonly spy: Spy) {
		super();
	}

	@Tool({ description: "Archives a document.", schema: archiveSchema, effect: "destructive" })
	archive(input: z.infer<typeof archiveSchema>, ctx: ToolContext) {
		this.spy.archived.push({ ...input, workspaceId: ctx.state.require("workspaceId") });
		return { archived: input.documentId };
	}

	@Tool({ description: "Records what happened.", schema: archiveSchema })
	audit(input: z.infer<typeof archiveSchema>, ctx: ToolContext) {
		this.spy.audited.push({ ...input, workspaceId: ctx.state.require("workspaceId") });
		return { audited: true };
	}
}

@Module({ providers: [Spy, ArchivistAgent] })
class FeatureModule {}

describe("HITL: state across the pause", () => {
	let app: TestingModule;
	let engine: InstanceType<typeof ScriptedEngine>;
	let registry: AgentRegistry;
	let spy: Spy;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" }), FeatureModule],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as InstanceType<typeof ScriptedEngine>;
		registry = app.get(AgentRegistry);
		spy = app.get(Spy);
	});

	afterEach(async () => {
		await app?.close();
	});

	async function pause(sessionId: string) {
		engine.enqueue([callTool("archive", { documentId: "doc-1" }), text("Awaiting approval.")]);
		const ref = registry.getRef(ArchivistAgent);
		const paused = await ref.ask({ sessionId, message: "archive doc-1", state: { workspaceId: "acme" } });
		return { ref, pending: paused.pending?.[0] };
	}

	it("executes the approved tool with the scope the run had when it asked", async () => {
		const { ref, pending } = await pause("hitl-1");

		engine.enqueue([text("Archived.")]);
		// biome-ignore lint/style/noNonNullAssertion: the run paused above
		await ref.approve({ sessionId: "hitl-1", callId: pending!.callId });

		// approval resumes a turn; resuming with less scope than the turn had means acting without an owner
		expect(spy.archived).toEqual([{ documentId: "doc-1", workspaceId: "acme" }]);
	});

	it("keeps the scope for the rest of the resumed turn, not just the approved call", async () => {
		const { ref, pending } = await pause("hitl-2");

		engine.enqueue([callTool("audit", { documentId: "doc-1" }), text("Archived and audited.")]);
		// biome-ignore lint/style/noNonNullAssertion: the run paused above
		await ref.approve({ sessionId: "hitl-2", callId: pending!.callId });

		expect(spy.audited).toEqual([{ documentId: "doc-1", workspaceId: "acme" }]);
	});

	it("does not turn per-call state into permanent session state", async () => {
		await pause("hitl-3");

		const session = await app.get(SessionStore).get("hitl-3");

		expect(session).not.toBeNull();
		// the scope belongs to the paused action, not to every future turn of this session
		expect(session?.state?.workspaceId).toBeUndefined();
	});

	it("does not let the frozen scope undo what the session learned during the pause", async () => {
		const { ref, pending } = await pause("hitl-4");
		await app.get(SessionStore).updateState("hitl-4", { workspaceId: "acme-renamed" });

		engine.enqueue([text("Archived.")]);
		// biome-ignore lint/style/noNonNullAssertion: the run paused above
		await ref.approve({ sessionId: "hitl-4", callId: pending!.callId });

		// an approval answered days later must not resurrect a value the session has since corrected
		expect(spy.archived).toEqual([{ documentId: "doc-1", workspaceId: "acme-renamed" }]);
	});

	it("keeps the pending queue out of the frozen scope", async () => {
		await pause("hitl-5");

		const session = await app.get(SessionStore).get("hitl-5");
		const queue = session?.state?.__adk_hitl as Array<{ state?: Record<string, unknown> }> | undefined;

		expect(queue).toHaveLength(1);
		expect(queue?.[0]?.state).toEqual({ workspaceId: "acme" });
		// copying the queue into itself would nest every pending inside the next and grow per approval
		expect(JSON.stringify(queue?.[0]?.state)).not.toContain("__adk_hitl");
	});

	it("resumes a rejected turn with the scope too: nothing ran, but the turn goes on", async () => {
		const { ref, pending } = await pause("hitl-7");

		engine.enqueue([callTool("audit", { documentId: "doc-1" }), text("Not archived, but noted.")]);
		// biome-ignore lint/style/noNonNullAssertion: the run paused above
		await ref.reject({ sessionId: "hitl-7", callId: pending!.callId, reason: "changed my mind" });

		// a rejection resumes the SAME turn; an agent with declared state cannot continue without it
		expect(spy.audited).toEqual([{ documentId: "doc-1", workspaceId: "acme" }]);
	});

	it("rejecting does not execute the pending tool", async () => {
		const { ref, pending } = await pause("hitl-8");

		engine.enqueue([text("Not archived.")]);
		// biome-ignore lint/style/noNonNullAssertion: the run paused above
		await ref.reject({ sessionId: "hitl-8", callId: pending!.callId });

		expect(spy.archived).toEqual([]);
	});

	it("does not hand the frozen scope back to the caller", async () => {
		const { pending } = await pause("hitl-6");

		// the scope may hold whatever the application put in state; the caller asked for an approval,
		// not for a copy of the run's context to log alongside it
		expect(pending).toMatchObject({ tool: "archive" });
		expect(pending?.state).toBeUndefined();
	});
});
