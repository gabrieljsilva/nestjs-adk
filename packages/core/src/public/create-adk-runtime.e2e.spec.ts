import {
	AgentDefinition,
	AgentDescription,
	AgentName,
	AgentRunStatus,
	ArtifactsNotDurable,
	CharacterCountOffloadPolicy,
	type ContextNotice,
	ContextNoticeSink,
	DuplicateRuntimeToolNameError,
	ListArtifactsTool,
	LlmModel,
	ModelCapabilities,
	ModelCapability,
	ModelChunk,
	ModelContextWindow,
	ModelDescriptor,
	ModelIdentity,
	type ModelRequest,
	ModelUsage,
	PromptInstructions,
	type SessionContext,
	SqliteArtifactStorage,
	ToolCallDelta,
	ToolDefinition,
	ToolEffect,
	ToolHandler,
	ToolResultMessage,
	ZodToolSchema,
	createAdkRuntime,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Everything here is imported from the package entry point on purpose.
 *
 * This is the spec that says the path without NestJS is reachable: a name it needs that
 * `index.ts` does not publish fails the compile rather than being reached through a deep
 * relative path nobody outside this repository has.
 */

/** Asks for one tool on the first turn, and answers with what came back on the second. */
class RefundingModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(100_000, 4000),
			ModelCapabilities.fromEntries([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		if (request.messages.some((message) => message instanceof ToolResultMessage)) {
			yield ModelChunk.text("order 42 is refunded");
			yield ModelChunk.usage(ModelUsage.fromReport(20, 5));
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(new ToolCallDelta(0, JSON.stringify({ orderId: "42" }), "c-1", "refund_order"));
		yield ModelChunk.finish("tool_calls");
	}
}

class RefundHandler extends ToolHandler {
	public calls = 0;

	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		this.calls += 1;
		return { orderId: args.orderId, refunded: true };
	}
}

function refundTool(handler: ToolHandler): ToolDefinition {
	return new ToolDefinition(
		"refund_order",
		"Refunds an order",
		ZodToolSchema.fromSchema(z.object({ orderId: z.string() })),
		ToolEffect.DESTRUCTIVE,
		handler,
	);
}

function namedTool(name: string): ToolDefinition {
	return new ToolDefinition(
		name,
		"Something the application wrote itself",
		ZodToolSchema.fromSchema(z.object({ artifactId: z.string() })),
		ToolEffect.READ,
		new RefundHandler(),
	);
}

function supportAgent(tools: readonly ToolDefinition[]): AgentDefinition {
	return new AgentDefinition({
		name: AgentName.from("support"),
		description: AgentDescription.from("answers about orders", "support"),
		model: new RefundingModel(),
		instructions: PromptInstructions.from("Be brief."),
		tools: tools,
	});
}

/** Everything the runtime observed about what a model reads, kept so a test can read it back. */
class RecordingNoticeSink extends ContextNoticeSink {
	public readonly notices: ContextNotice[] = [];

	public report(_context: SessionContext | undefined, notice: ContextNotice): void {
		this.notices.push(notice);
	}
}

describe("a runtime composed without a NestJS container", () => {
	it("answers a question through the handle of the agent it was given", async () => {
		const adk = await createAdkRuntime({ agents: [supportAgent([])] });

		const answer = await adk.findAgent("support").ask("hello");
		await adk.stop();

		expect(answer.text).toBe("order 42 is refunded");
	});

	it("holds a destructive tool for a human and runs it once the same handle approves", async () => {
		const handler = new RefundHandler();
		const adk = await createAdkRuntime({ agents: [supportAgent([refundTool(handler)])] });
		const support = adk.findAgent("support");

		const held = await support.ask("refund order 42");
		expect(held.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(handler.calls).toBe(0);

		const call = held.awaiting[0];
		if (call === undefined) throw new Error("the refund should have been held");
		const answer = await support.approve(held.sessionId, call.callId, "gabriel");
		await adk.stop();

		expect(handler.calls).toBe(1);
		expect(answer.text).toBe("order 42 is refunded");
	});

	it("lists a handle per declared agent, so an application can reach them without naming one", async () => {
		const adk = await createAdkRuntime({ agents: [supportAgent([])] });

		const names = adk.agents.map((agent) => agent.name.value);
		await adk.stop();

		expect(names).toEqual(["support"]);
	});
	it("says so when it is composed to offload into a store that dies with the process", async () => {
		const notices = new RecordingNoticeSink();

		const adk = await createAdkRuntime({
			agents: [supportAgent([])],
			runtime: { context: { contextNotices: notices } },
		});
		await adk.stop();

		const notice = notices.notices.find((candidate) => candidate instanceof ArtifactsNotDurable);
		expect(notice).toBeDefined();
		expect(notice?.message).toContain("InMemoryArtifactStorage");
		expect(notice?.thresholdCharacters).toBe(CharacterCountOffloadPolicy.DEFAULT_THRESHOLD);
	});

	it("says nothing when the artifacts are durable", async () => {
		const notices = new RecordingNoticeSink();

		const adk = await createAdkRuntime({
			agents: [supportAgent([])],
			artifacts: new SqliteArtifactStorage(),
			runtime: { context: { contextNotices: notices } },
		});
		await adk.stop();

		expect(notices.notices.filter((candidate) => candidate instanceof ArtifactsNotDurable)).toEqual([]);
	});

	it("refuses to start when a hand-built agent declares a tool under a name the runtime owns", async () => {
		const colliding = createAdkRuntime({ agents: [supportAgent([namedTool(ListArtifactsTool.NAME)])] });

		await expect(colliding).rejects.toThrow(DuplicateRuntimeToolNameError);
		await expect(colliding).rejects.toThrow(/rename yours/);
	});

	it("names the hand-built agent as its own provider, because without a container there is nothing else to name", async () => {
		const raised = await createAdkRuntime({ agents: [supportAgent([namedTool("read_artifact")])] }).catch(
			(error: unknown) => error,
		);

		expect(raised).toBeInstanceOf(DuplicateRuntimeToolNameError);
		const error = raised as DuplicateRuntimeToolNameError;
		expect([error.toolName, error.agentName, error.providerName]).toEqual(["read_artifact", "support", "support"]);
	});

	it("starts a hand-built agent that asked for a runtime tool, since a request shares its name on purpose", async () => {
		const adk = await createAdkRuntime({ agents: [supportAgent([ListArtifactsTool.request()])] });

		const answer = await adk.findAgent("support").ask("hello");
		await adk.stop();

		expect(answer.text).toBe("order 42 is refunded");
	});

	it("says nothing when nothing is ever moved out, because then there is nothing to lose", async () => {
		const notices = new RecordingNoticeSink();

		const adk = await createAdkRuntime({
			agents: [supportAgent([])],
			runtime: { context: { contextNotices: notices, offload: CharacterCountOffloadPolicy.disabled() } },
		});
		await adk.stop();

		expect(notices.notices.filter((candidate) => candidate instanceof ArtifactsNotDurable)).toEqual([]);
	});
});
