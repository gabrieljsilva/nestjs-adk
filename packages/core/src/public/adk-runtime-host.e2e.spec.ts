import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../adapters/schema/zod-tool-schema";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage";
import { SessionId } from "../common/identity/session-id";
import { ToolCallId } from "../common/identity/tool-call-id";
import { SessionRevision } from "../common/revision/session-revision";
import type { AppendEventsCommand } from "../contracts/append-events-command";
import type { AppendEventsResult } from "../contracts/append-events-result";
import { SessionEventConsumer } from "../contracts/session-event-consumer";
import { AgentDefinition } from "../domain/agent/agent-definition";
import { AgentDelegationPolicy } from "../domain/agent/agent-delegation-policy";
import { AgentDescription } from "../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies";
import { AgentName } from "../domain/agent/agent-name";
import { AgentTransferPolicy } from "../domain/agent/agent-transfer-policy";
import { DeclaredAgent } from "../domain/agent/declared-agent";
import { DelegationNotDeclaredError } from "../domain/agent/errors/delegation-not-declared.error";
import { TransferNotDeclaredError } from "../domain/agent/errors/transfer-not-declared.error";
import { OffloadPolicy } from "../domain/artifact/offload-policy";
import { AssistantMessageProduced } from "../domain/event/catalog/assistant-message-produced";
import { DelegationStarted } from "../domain/event/catalog/delegation-started";
import { ToolResultProduced } from "../domain/event/catalog/tool-result-produced";
import type { PublishedEvent } from "../domain/event/published-event";
import type { StoredSessionEvent } from "../domain/event/stored-session-event";
import { EmptyModelResponseError } from "../domain/model/errors/empty-model-response.error";

import { LlmModel } from "../domain/model/llm-model";
import { ModelCapabilities } from "../domain/model/model-capabilities";
import { ModelCapability } from "../domain/model/model-capability";
import { ModelChunk } from "../domain/model/model-chunk";
import { ModelContextWindow } from "../domain/model/model-context-window";
import { ModelDescriptor } from "../domain/model/model-descriptor";
import { ModelIdentity } from "../domain/model/model-identity";
import { ModelRequest } from "../domain/model/model-request";
import { ModelUsage } from "../domain/model/model-usage";
import { ToolCallDelta } from "../domain/model/tool-call-delta";
import { ToolResultMessage } from "../domain/model/tool-result-message";
import { PromptInstructions } from "../domain/prompt/prompt-instructions";
import { AgentRunStatus } from "../domain/session/agent-run-status";
import { ApproveInput } from "../domain/session/approve-input";
import { AskInput } from "../domain/session/ask-input";
import { AgentMaxDelegationDepthError } from "../domain/session/errors/agent-max-delegation-depth.error";
import { AgentMaxIterationsError } from "../domain/session/errors/agent-max-iterations.error";
import { AgentMaxTransfersError } from "../domain/session/errors/agent-max-transfers.error";
import { ApprovalNotPendingError } from "../domain/session/errors/approval-not-pending.error";
import { RejectInput } from "../domain/session/reject-input";
import { RunLimits } from "../domain/session/run-limits";
import { EffectApprovalPolicy } from "../domain/tool/effect-approval-policy";
import { ToolDefinition } from "../domain/tool/tool-definition";
import { ToolEffect } from "../domain/tool/tool-effect";
import { ToolHandler } from "../domain/tool/tool-handler";
import { UnknownTransferTargetError } from "../runtime/catalog/errors/unknown-transfer-target.error";
import { RuntimeOptions } from "../runtime/composition/runtime-options";
import { PrefixComparator } from "../runtime/diagnostics/prefix-comparator";
import { ShutdownOptions } from "../runtime/lifecycle/shutdown-options";
import { AgentRunCommand } from "../runtime/run/agent-run-command";
import { FakeClock } from "../support/fake-clock";
import { SequenceIdGenerator } from "../support/sequence-id-generator";
import { AdkRuntimeHost } from "./adk-runtime-host";

const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");
const RESEARCHER = AgentName.from("researcher");

/** Records every request it was given, so a test can assert what the context actually carried. */
class RecordingModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];

	public constructor(private readonly capabilities: ModelCapabilities = ModelCapabilities.none()) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			this.capabilities,
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		yield ModelChunk.text(`answer ${this.requests.length}`);
		yield ModelChunk.usage(ModelUsage.of(50 * this.requests.length, 5));
		yield ModelChunk.finish("stop");
	}
}

/** Asks for one tool on the first turn and answers with what it learned on the second. */
class ToolCallingModel extends LlmModel {
	public turns = 0;

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.turns += 1;
		const results = request.messages.filter(
			(message): message is ToolResultMessage => message instanceof ToolResultMessage,
		);
		if (results.length === 0) {
			yield ModelChunk.toolCall(new ToolCallDelta(0, JSON.stringify({ orderId: "42" }), "c-1", "lookup_order"));
			yield ModelChunk.finish("tool_calls");
			return;
		}
		yield ModelChunk.text(`the order is ${results.some((result) => !result.failed) ? "shipped" : "unknown"}`);
		yield ModelChunk.finish("stop");
	}
}

/** Asks for a read and a write in the same turn, which is the turn approval is about. */
class PairCallingModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		if (request.messages.some((message) => message instanceof ToolResultMessage)) {
			yield ModelChunk.text("done");
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(new ToolCallDelta(0, JSON.stringify({ orderId: "42" }), "c-1", "lookup_order"));
		yield ModelChunk.toolCall(new ToolCallDelta(1, JSON.stringify({ orderId: "42" }), "c-2", "refund_order"));
		yield ModelChunk.finish("tool_calls");
	}
}

/** Hands the conversation over once and never again, whatever it is asked afterwards. */
class TransferringModel extends LlmModel {
	public turns = 0;

	public constructor(
		private readonly target: string,
		private readonly answer: string,
	) {
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
		this.turns += 1;
		if (request.messages.some((message) => message instanceof ToolResultMessage)) {
			yield ModelChunk.text(this.answer);
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(
			new ToolCallDelta(0, JSON.stringify({ agentName: this.target }), `t-${this.turns}`, "transfer_to_agent"),
		);
		yield ModelChunk.finish("tool_calls");
	}
}

/** Asks somebody else to do one thing, then answers with what came back. */
class DelegatingModel extends LlmModel {
	public constructor(
		private readonly target: string,
		private readonly task: string,
	) {
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
		const results = request.messages.filter(
			(message): message is ToolResultMessage => message instanceof ToolResultMessage,
		);
		const answer = results[0]?.output;
		if (answer !== undefined) {
			yield ModelChunk.text(`the specialist said: ${Reflect.get(Object(answer), "answer")}`);
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(
			new ToolCallDelta(0, JSON.stringify({ agentName: this.target, task: this.task }), "d-1", "delegate_to_agent"),
		);
		yield ModelChunk.finish("tool_calls");
	}
}

/** Records the conversation it was handed, so a test can prove what a child actually reads. */
class RecordingChildModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "child"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.none(),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		yield ModelChunk.text("42");
		yield ModelChunk.usage(ModelUsage.of(30, 3));
		yield ModelChunk.finish("stop");
	}
}

/** Hands the conversation over every single turn, which is the ping-pong the cap exists for. */
class AlwaysTransferringModel extends LlmModel {
	public turns = 0;

	public constructor(private readonly target: string) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		this.turns += 1;
		yield ModelChunk.toolCall(
			new ToolCallDelta(0, JSON.stringify({ agentName: this.target }), `t-${this.turns}`, "transfer_to_agent"),
		);
		yield ModelChunk.finish("tool_calls");
	}
}

/** Asks for two calls that both need a decision, which is what one answer cannot release. */
class TwoHeldCallsModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		if (request.messages.some((message) => message instanceof ToolResultMessage)) {
			yield ModelChunk.text("done");
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(new ToolCallDelta(0, JSON.stringify({ orderId: "42" }), "c-1", "refund_order"));
		yield ModelChunk.toolCall(new ToolCallDelta(1, JSON.stringify({ orderId: "42" }), "c-2", "close_order"));
		yield ModelChunk.finish("tool_calls");
	}
}

/** Watches the journal, and remembers whether shutdown gave it a chance to empty itself. */
class RecordingConsumer extends SessionEventConsumer {
	public readonly name = "recording";
	public readonly seen: PublishedEvent[] = [];
	public flushed = 0;

	public async consume(event: PublishedEvent): Promise<void> {
		this.seen.push(event);
	}

	public async flush(): Promise<void> {
		this.flushed += 1;
	}
}

/** Answers nothing at all, which is a provider having a bad day rather than an agent being quiet. */
class SilentModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.none(),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		yield ModelChunk.usage(ModelUsage.of(40, 0));
		yield ModelChunk.finish("stop");
	}
}

/** Accepts a session and then refuses every append, which is a journal that never advanced. */
class RefusingSessionStorage extends InMemorySessionStorage {
	public async append(): Promise<AppendEventsResult> {
		throw new Error("the journal is unavailable");
	}
}

/** Counts the events a reader actually had to replay, which is what a snapshot exists to lower. */
class CountingSessionStorage extends InMemorySessionStorage {
	public replayed = 0;

	public async *readEvents(sessionId: SessionId, afterRevision: SessionRevision): AsyncIterable<StoredSessionEvent> {
		for await (const stored of super.readEvents(sessionId, afterRevision)) {
			this.replayed += 1;
			yield stored;
		}
	}
}

/** Refuses one append and takes everything after it, which is what a lost race looks like. */
class FlakySessionStorage extends InMemorySessionStorage {
	private refusals: number;

	public constructor(refuseAfter: number) {
		super();
		this.refusals = refuseAfter;
	}

	public async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		if (this.refusals > 0) {
			this.refusals -= 1;
			if (this.refusals === 0) throw new Error("the journal lost the race");
		}
		return super.append(command);
	}
}

function approvingOptions(): RuntimeOptions {
	return new RuntimeOptions(
		ShutdownOptions.waitIndefinitely(),
		RunLimits.none(),
		[],
		OffloadPolicy.byDefault(),
		EffectApprovalPolicy.from(ToolEffect.READ),
	);
}

/** Holds writes and lets reads through, which is the ordinary shape of a policy. */
function writeApprovingOptions(): RuntimeOptions {
	return new RuntimeOptions(
		ShutdownOptions.waitIndefinitely(),
		RunLimits.none(),
		[],
		OffloadPolicy.byDefault(),
		EffectApprovalPolicy.from(ToolEffect.WRITE),
	);
}

/** Every event type the journal holds, in the order it recorded them. */
async function eventTypesOf(storage: InMemorySessionStorage, sessionId: SessionId): Promise<readonly string[]> {
	const types: string[] = [];
	for await (const stored of storage.readEvents(sessionId, SessionRevision.initial())) types.push(stored.event.type);
	return types;
}

/** Every tool result the journal holds, in the order it recorded them. */
async function resultCallIdsOf(storage: InMemorySessionStorage, sessionId: SessionId): Promise<readonly string[]> {
	const ids: string[] = [];
	for await (const stored of storage.readEvents(sessionId, SessionRevision.initial())) {
		if (stored.event instanceof ToolResultProduced) ids.push(stored.event.callId.value);
	}
	return ids;
}

function artifactsOf(): InMemoryArtifactStorage {
	return new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
}

function agentOf(model: LlmModel, tools: readonly ToolDefinition[] = []): DeclaredAgent {
	return declaredAgent(SUPPORT, "SupportAgent", model, tools);
}

function declaredAgent(
	name: AgentName,
	providerName: string,
	model: LlmModel,
	tools: readonly ToolDefinition[] = [],
	transfer: AgentTransferPolicy = AgentTransferPolicy.none(),
	delegation: AgentDelegationPolicy = AgentDelegationPolicy.none(),
): DeclaredAgent {
	const definition = AgentDefinition.of(
		name,
		AgentDescription.from(`${name.value} agent`, name.value),
		model,
		PromptInstructions.from("Be brief."),
		AgentExecutionPolicies.of(undefined, undefined, undefined, transfer, delegation),
		tools,
	);
	return new DeclaredAgent(definition, providerName);
}

class LookupHandler extends ToolHandler {
	public calls = 0;

	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		this.calls += 1;
		return { orderId: args.orderId, status: "shipped" };
	}
}

function orderSchema(): ZodToolSchema {
	return ZodToolSchema.of(z.object({ orderId: z.string() }));
}

function lookupOf(handler: ToolHandler): ToolDefinition {
	return new ToolDefinition("lookup_order", "Looks an order up", orderSchema(), ToolEffect.READ, handler);
}

function refundOf(handler: ToolHandler): ToolDefinition {
	return new ToolDefinition("refund_order", "Refunds an order", orderSchema(), ToolEffect.WRITE, handler);
}

function closeOf(handler: ToolHandler): ToolDefinition {
	return new ToolDefinition("close_order", "Closes an order", orderSchema(), ToolEffect.WRITE, handler);
}

const host = new AdkRuntimeHost();

afterEach(async () => {
	await host.stop();
});

describe("AdkRuntimeHost over the native runtime", () => {
	it("answers a first question and keeps the session it created", async () => {
		const model = new RecordingModel();
		const runtime = await host.start(
			[agentOf(model)],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.text).toBe("answer 1");
		expect(result.sessionId.value).toBeTruthy();
	});

	it("carries the previous turn into the next call of the same session", async () => {
		const model = new RecordingModel();
		const runtime = await host.start(
			[agentOf(model)],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const first = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("and then?", first.sessionId)));

		const second = model.requests[1];
		expect(second?.messages.map((message) => message.text)).toEqual(["hi", "answer 1", "and then?"]);
	});

	it("sends the agent prompt as instructions rather than as conversation", async () => {
		const model = new RecordingModel();
		const runtime = await host.start(
			[agentOf(model)],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(model.requests[0]?.instructions?.text).toBe("Be brief.");
	});

	it("continues a session over a storage that outlived the host that wrote it", async () => {
		const storage = new InMemorySessionStorage();
		const first = await host.start(
			[agentOf(new RecordingModel())],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);
		const started = await first.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		await host.stop();

		const restarted = new AdkRuntimeHost();
		const model = new RecordingModel();
		const runtime = await restarted.start(
			[agentOf(model)],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator("again"),
		);
		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("still there?", started.sessionId)));
		await restarted.stop();

		expect(result.sessionId.value).toBe(started.sessionId.value);
		expect(model.requests[0]?.messages).toHaveLength(3);
	});

	it("shows an observer everything the run journaled, in order", async () => {
		const consumer = new RecordingConsumer();
		const runtime = await host.start(
			[agentOf(new RecordingModel())],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			new RuntimeOptions(ShutdownOptions.waitIndefinitely(), RunLimits.none(), [consumer]),
		);

		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(consumer.seen.map((event) => event.type)).toEqual([
			"session.created",
			"session.user-message-received",
			"run.started",
			"run.assistant-message-produced",
			"run.completed",
		]);
		expect(consumer.seen.every((event) => event.isDurable)).toBe(true);
	});

	it("publishes nothing at all when the append never happened", async () => {
		const consumer = new RecordingConsumer();
		const runtime = await host.start(
			[agentOf(new RecordingModel())],
			new RefusingSessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			new RuntimeOptions(ShutdownOptions.waitIndefinitely(), RunLimits.none(), [consumer]),
		);

		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi"))).catch(() => undefined);

		expect(consumer.seen).toHaveLength(0);
	});

	it("flushes what a consumer buffered before the runtime is disposed", async () => {
		const consumer = new RecordingConsumer();
		await host.start(
			[agentOf(new RecordingModel())],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			new RuntimeOptions(ShutdownOptions.waitIndefinitely(), RunLimits.none(), [consumer]),
		);

		await host.stop();

		expect(consumer.flushed).toBe(1);
	});

	it("runs the tool the model asked for and answers from its result", async () => {
		const handler = new LookupHandler();
		const model = new ToolCallingModel();
		const runtime = await host.start(
			[agentOf(model, [lookupOf(handler)])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));

		expect(handler.calls).toBe(1);
		expect(model.turns).toBe(2);
		expect(result.text).toBe("the order is shipped");
	});

	it("journals the call before the result, tied by the same id", async () => {
		const consumer = new RecordingConsumer();
		const runtime = await host.start(
			[agentOf(new ToolCallingModel(), [lookupOf(new LookupHandler())])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			new RuntimeOptions(ShutdownOptions.waitIndefinitely(), RunLimits.none(), [consumer]),
		);

		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));

		const types = consumer.seen.map((event) => event.type);
		expect(types.indexOf("tool.call-requested")).toBeLessThan(types.indexOf("tool.result-produced"));
		expect(types.filter((type) => type === "run.completed")).toHaveLength(1);
	});

	it("stops a run that keeps going back to the model past its limit", async () => {
		class AlwaysCallingModel extends ToolCallingModel {
			public async *generate(): AsyncIterable<ModelChunk> {
				this.turns += 1;
				yield ModelChunk.toolCall(
					new ToolCallDelta(0, JSON.stringify({ orderId: "42" }), `c-${this.turns}`, "lookup_order"),
				);
				yield ModelChunk.finish("tool_calls");
			}
		}
		const runtime = await host.start(
			[agentOf(new AlwaysCallingModel(), [lookupOf(new LookupHandler())])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			new RuntimeOptions(ShutdownOptions.waitIndefinitely(), RunLimits.of(2)),
		);

		const error = await runtime.runner
			.ask(new AgentRunCommand(SUPPORT, AskInput.of("loop please")))
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(AgentMaxIterationsError);
	});

	it("stops before a tool a human has to agree to, and says the run is suspended", async () => {
		const handler = new LookupHandler();
		const runtime = await host.start(
			[agentOf(new ToolCallingModel(), [lookupOf(handler)])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			approvingOptions(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));

		expect(result.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(handler.calls).toBe(0);
	});

	it("runs the held call exactly once when a human approves it, after a restart", async () => {
		const storage = new InMemorySessionStorage();
		const artifacts = artifactsOf();
		const handler = new LookupHandler();
		const first = await host.start(
			[agentOf(new ToolCallingModel(), [lookupOf(handler)])],
			storage,
			artifacts,
			new FakeClock(),
			new SequenceIdGenerator(),
			approvingOptions(),
		);
		const suspended = await first.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));
		await host.stop();

		const restarted = new AdkRuntimeHost();
		const runtime = await restarted.start(
			[agentOf(new ToolCallingModel(), [lookupOf(handler)])],
			storage,
			artifacts,
			new FakeClock(),
			new SequenceIdGenerator("again"),
			approvingOptions(),
		);
		const resumed = await runtime.runner.approve(ApproveInput.of(suspended.sessionId, ToolCallId.from("c-1"), "gabriel"));
		await restarted.stop();

		expect(handler.calls).toBe(1);
		expect(resumed.text).toBe("the order is shipped");
		expect(resumed.runId.value).not.toBe(suspended.runId.value);
	});

	it("refuses a decision that arrives twice, so an approved tool never runs again", async () => {
		const handler = new LookupHandler();
		const runtime = await host.start(
			[agentOf(new ToolCallingModel(), [lookupOf(handler)])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			approvingOptions(),
		);
		const suspended = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));
		await runtime.runner.approve(ApproveInput.of(suspended.sessionId, ToolCallId.from("c-1")));

		const error = await runtime.runner
			.approve(ApproveInput.of(suspended.sessionId, ToolCallId.from("c-1")))
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(ApprovalNotPendingError);
		expect(handler.calls).toBe(1);
	});

	it("tells the model a held call was refused, without running it", async () => {
		const handler = new LookupHandler();
		const runtime = await host.start(
			[agentOf(new ToolCallingModel(), [lookupOf(handler)])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			approvingOptions(),
		);
		const suspended = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));

		const rejected = await runtime.runner.reject(
			RejectInput.of(suspended.sessionId, ToolCallId.from("c-1"), "not authorized"),
		);

		expect(handler.calls).toBe(0);
		expect(rejected.status.equals(AgentRunStatus.COMPLETED)).toBe(true);
		expect(rejected.text).toBe("the order is unknown");
	});

	it("holds a whole turn, so the call nobody had to answer for does not run either", async () => {
		const lookup = new LookupHandler();
		const refund = new LookupHandler();
		const runtime = await host.start(
			[agentOf(new PairCallingModel(), [lookupOf(lookup), refundOf(refund)])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			writeApprovingOptions(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		expect(result.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(lookup.calls).toBe(0);
		expect(refund.calls).toBe(0);
	});

	it("runs every call of the turn once the held one is approved, and leaves none without a result", async () => {
		const lookup = new LookupHandler();
		const refund = new LookupHandler();
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(new PairCallingModel(), [lookupOf(lookup), refundOf(refund)])],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			writeApprovingOptions(),
		);
		const suspended = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		const resumed = await runtime.runner.approve(ApproveInput.of(suspended.sessionId, ToolCallId.from("c-2")));

		expect(lookup.calls).toBe(1);
		expect(refund.calls).toBe(1);
		expect(resumed.status.equals(AgentRunStatus.COMPLETED)).toBe(true);
		expect(await resultCallIdsOf(storage, suspended.sessionId)).toEqual(["c-1", "c-2"]);
	});

	it("stays suspended until every held call of the turn has been answered", async () => {
		const refund = new LookupHandler();
		const close = new LookupHandler();
		const runtime = await host.start(
			[agentOf(new TwoHeldCallsModel(), [refundOf(refund), closeOf(close)])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			writeApprovingOptions(),
		);
		const suspended = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund and close 42")));

		const half = await runtime.runner.approve(ApproveInput.of(suspended.sessionId, ToolCallId.from("c-1")));

		expect(half.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(refund.calls).toBe(0);
		expect(close.calls).toBe(0);
	});

	it("runs the granted call and refuses the denied one, in the same turn", async () => {
		const refund = new LookupHandler();
		const close = new LookupHandler();
		const runtime = await host.start(
			[agentOf(new TwoHeldCallsModel(), [refundOf(refund), closeOf(close)])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			writeApprovingOptions(),
		);
		const suspended = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund and close 42")));
		await runtime.runner.approve(ApproveInput.of(suspended.sessionId, ToolCallId.from("c-1")));

		const done = await runtime.runner.reject(
			RejectInput.of(suspended.sessionId, ToolCallId.from("c-2"), "the order stays open"),
		);

		expect(refund.calls).toBe(1);
		expect(close.calls).toBe(0);
		expect(done.status.equals(AgentRunStatus.COMPLETED)).toBe(true);
	});

	it("fails the run when the provider answered nothing at all", async () => {
		const runtime = await host.start(
			[agentOf(new SilentModel())],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const error = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi"))).catch((reason) => reason);

		expect(error).toBeInstanceOf(EmptyModelResponseError);
	});

	it("keeps the usage of an empty answer, because the provider charged for it either way", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(new SilentModel())],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi"))).catch(() => undefined);
		const events = await eventTypesOf(storage, SessionId.from("id-1"));

		expect(result).toBeUndefined();
		expect(events).toContain("run.assistant-message-produced");
		expect(events).toContain("run.failed");
	});

	it("records how a run ended even when the write that should have said so lost a race", async () => {
		const storage = new FlakySessionStorage(4);
		const runtime = await host.start(
			[agentOf(new SilentModel())],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi"))).catch(() => undefined);

		expect(await eventTypesOf(storage, SessionId.from("id-1"))).toContain("run.failed");
	});

	it("refuses a command once the runtime is draining", async () => {
		const runtime = await host.start(
			[agentOf(new RecordingModel())],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);
		await host.stop();

		const error = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi"))).catch((reason) => reason);

		expect(error).toBeInstanceOf(Error);
	});

	it("hands the held calls back with the suspension, so a caller knows what to decide on", async () => {
		const lookup = new LookupHandler();
		const refund = new LookupHandler();
		const runtime = await host.start(
			[agentOf(new PairCallingModel(), [lookupOf(lookup), refundOf(refund)])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			writeApprovingOptions(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		expect(result.isAwaitingApproval).toBe(true);
		expect(result.awaiting.map((call) => call.toolName)).toEqual(["refund_order"]);
		expect(result.awaiting[0]?.callId.value).toBe("c-2");
		expect(result.awaiting[0]?.args).toEqual({ orderId: "42" });
	});

	it("answers where a session stands to whoever asks later, from the session id alone", async () => {
		const storage = new InMemorySessionStorage();
		const artifacts = artifactsOf();
		const first = await host.start(
			[agentOf(new PairCallingModel(), [lookupOf(new LookupHandler()), refundOf(new LookupHandler())])],
			storage,
			artifacts,
			new FakeClock(),
			new SequenceIdGenerator(),
			writeApprovingOptions(),
		);
		const suspended = await first.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));
		await host.stop();

		const restarted = new AdkRuntimeHost();
		const runtime = await restarted.start(
			[agentOf(new PairCallingModel(), [lookupOf(new LookupHandler()), refundOf(new LookupHandler())])],
			storage,
			artifacts,
			new FakeClock(),
			new SequenceIdGenerator("again"),
			writeApprovingOptions(),
		);
		const inspection = await runtime.sessions.handle(suspended.sessionId);
		await restarted.stop();

		expect(inspection.isAwaitingApproval).toBe(true);
		expect(inspection.approval.awaiting[0]?.toolName).toBe("refund_order");
		expect(inspection.approval.runId?.value).toBe(suspended.runId.value);
		expect(inspection.activeAgent.value).toBe(SUPPORT.value);
		expect(inspection.acceptsCommands).toBe(true);
	});

	it("writes a snapshot the moment a turn stops for approval, however short the session", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(new PairCallingModel(), [lookupOf(new LookupHandler()), refundOf(new LookupHandler())])],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			writeApprovingOptions(),
		);

		const suspended = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		const snapshot = await storage.findSnapshot(suspended.sessionId);
		expect(snapshot?.state.isAwaitingApproval).toBe(true);
		expect(snapshot?.revision.value).toBe((await storage.findOrFail(suspended.sessionId)).revision.value);
	});

	it("answers where a suspended session stands without replaying its journal", async () => {
		const storage = new CountingSessionStorage();
		const runtime = await host.start(
			[agentOf(new PairCallingModel(), [lookupOf(new LookupHandler()), refundOf(new LookupHandler())])],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
			writeApprovingOptions(),
		);
		const suspended = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));
		const journalLength = (await eventTypesOf(storage, suspended.sessionId)).length;
		storage.replayed = 0;

		const inspection = await runtime.sessions.handle(suspended.sessionId);

		expect(journalLength).toBeGreaterThan(0);
		expect(storage.replayed).toBe(0);
		expect(inspection.approval.awaiting[0]?.toolName).toBe("refund_order");
	});

	it("hands the session to the agent the model asked for, inside the same run", async () => {
		const storage = new InMemorySessionStorage();
		const support = new TransferringModel("billing", "support never answers");
		const billing = new RecordingModel();
		const runtime = await host.start(
			[
				declaredAgent(SUPPORT, "SupportAgent", support, [], AgentTransferPolicy.to([BILLING])),
				declaredAgent(BILLING, "BillingAgent", billing),
			],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("I was charged twice")));

		expect(result.text).toBe("answer 1");
		expect(billing.requests).toHaveLength(1);
		expect(await eventTypesOf(storage, result.sessionId)).toContain("agent.transferred");
		expect((await runtime.sessions.handle(result.sessionId)).activeAgent.value).toBe("billing");
	});

	it("keeps one run across the handover, and offers the receiver its own tools", async () => {
		const storage = new InMemorySessionStorage();
		const billing = new RecordingModel(ModelCapabilities.of([[ModelCapability.TOOLS, true]]));
		const runtime = await host.start(
			[
				declaredAgent(
					SUPPORT,
					"SupportAgent",
					new TransferringModel("billing", "unused"),
					[lookupOf(new LookupHandler())],
					AgentTransferPolicy.to([BILLING]),
				),
				declaredAgent(BILLING, "BillingAgent", billing, [refundOf(new LookupHandler())]),
			],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("I was charged twice")));

		const offered = billing.requests[0]?.tools.map((tool) => tool.name) ?? [];
		expect(offered).toContain("refund_order");
		expect(offered).not.toContain("lookup_order");
		const runIds = new Set<string>();
		for await (const stored of storage.readEvents(result.sessionId, SessionRevision.initial())) {
			runIds.add(stored.event.correlation.runId.value);
		}
		expect(runIds.size).toBe(1);
	});

	it("hands the session over by code, through the same declared edges", async () => {
		const storage = new InMemorySessionStorage();
		const billing = new RecordingModel();
		const runtime = await host.start(
			[
				declaredAgent(
					SUPPORT,
					"SupportAgent",
					new RecordingModel(ModelCapabilities.of([[ModelCapability.TOOLS, true]])),
					[],
					AgentTransferPolicy.to([BILLING]),
				),
				declaredAgent(BILLING, "BillingAgent", billing),
			],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);
		const first = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hello")));

		const second = await runtime.runner.ask(
			new AgentRunCommand(
				SUPPORT,
				AskInput.of("I was charged twice", first.sessionId),
				RunLimits.none(),
				undefined,
				undefined,
				undefined,
				BILLING,
			),
		);

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(billing.requests).toHaveLength(1);
		expect((await runtime.sessions.handle(first.sessionId)).activeAgent.value).toBe("billing");
	});

	it("refuses a handover nobody declared, and writes nothing about it", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[
				declaredAgent(SUPPORT, "SupportAgent", new RecordingModel()),
				declaredAgent(BILLING, "BillingAgent", new RecordingModel()),
			],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);
		const first = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hello")));
		const before = await eventTypesOf(storage, first.sessionId);

		await expect(
			runtime.runner.ask(
				new AgentRunCommand(
					SUPPORT,
					AskInput.of("route me", first.sessionId),
					RunLimits.none(),
					undefined,
					undefined,
					undefined,
					BILLING,
				),
			),
		).rejects.toBeInstanceOf(TransferNotDeclaredError);

		expect(await eventTypesOf(storage, first.sessionId)).toEqual(before);
	});

	it("stops two agents that keep handing the session back to each other", async () => {
		const runtime = await host.start(
			[
				declaredAgent(
					SUPPORT,
					"SupportAgent",
					new AlwaysTransferringModel("billing"),
					[],
					AgentTransferPolicy.to([BILLING]),
				),
				declaredAgent(
					BILLING,
					"BillingAgent",
					new AlwaysTransferringModel("support"),
					[],
					AgentTransferPolicy.to([SUPPORT]),
				),
			],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		await expect(runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("who owns this?")))).rejects.toBeInstanceOf(
			AgentMaxTransfersError,
		);
	});

	it("refuses at boot an agent that declares a handover to nobody registered", async () => {
		await expect(
			host.start(
				[declaredAgent(SUPPORT, "SupportAgent", new RecordingModel(), [], AgentTransferPolicy.to([BILLING]))],
				new InMemorySessionStorage(),
				artifactsOf(),
				new FakeClock(),
				new SequenceIdGenerator(),
			),
		).rejects.toBeInstanceOf(UnknownTransferTargetError);
	});

	it("has a specialist answer one task and carries on with what it said", async () => {
		const storage = new InMemorySessionStorage();
		const child = new RecordingChildModel();
		const runtime = await host.start(
			[
				declaredAgent(
					SUPPORT,
					"SupportAgent",
					new DelegatingModel("researcher", "what is the refund window?"),
					[],
					AgentTransferPolicy.none(),
					AgentDelegationPolicy.to([RESEARCHER]),
				),
				declaredAgent(RESEARCHER, "ResearchAgent", child),
			],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("how long do I have?")));

		expect(result.text).toBe("the specialist said: 42");
		expect((await runtime.sessions.handle(result.sessionId)).activeAgent.value).toBe("support");
		const types = await eventTypesOf(storage, result.sessionId);
		expect(types).toContain("delegation.started");
		expect(types).toContain("delegation.completed");
	});

	it("gives the child run its own id, its parent and the delegation on every event it writes", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[
				declaredAgent(
					SUPPORT,
					"SupportAgent",
					new DelegatingModel("researcher", "what is the refund window?"),
					[],
					AgentTransferPolicy.none(),
					AgentDelegationPolicy.to([RESEARCHER]),
				),
				declaredAgent(RESEARCHER, "ResearchAgent", new RecordingChildModel()),
			],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);
		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("how long do I have?")));

		const stored = [];
		for await (const event of storage.readEvents(result.sessionId, SessionRevision.initial())) stored.push(event);
		const opened = stored.find((event) => event.event instanceof DelegationStarted)?.event;
		const childRunId = opened instanceof DelegationStarted ? opened.childRunId.value : "";
		const childEvents = stored.filter((event) => event.event.correlation.runId.value === childRunId);

		expect(childRunId).not.toBe(result.runId.value);
		expect(childEvents.length).toBeGreaterThan(0);
		for (const event of childEvents) {
			expect(event.event.correlation.runId.value).toBe(childRunId);
		}
		expect(opened instanceof DelegationStarted ? opened.correlation.runId.value : "").toBe(result.runId.value);
	});

	it("keeps the child out of the parent's conversation, and the parent out of the child's", async () => {
		const child = new RecordingChildModel();
		const parent = new DelegatingModel("researcher", "what is the refund window?");
		const runtime = await host.start(
			[
				declaredAgent(
					SUPPORT,
					"SupportAgent",
					parent,
					[],
					AgentTransferPolicy.none(),
					AgentDelegationPolicy.to([RESEARCHER]),
				),
				declaredAgent(RESEARCHER, "ResearchAgent", child),
			],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("how long do I have?")));

		const readByChild = child.requests[0]?.messages.map((message) => JSON.stringify(message)).join(" ") ?? "";
		expect(readByChild).toContain("what is the refund window?");
		expect(readByChild).not.toContain("how long do I have?");
	});

	it("counts the child's usage once, in the journal both runs share", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[
				declaredAgent(
					SUPPORT,
					"SupportAgent",
					new DelegatingModel("researcher", "what is the refund window?"),
					[],
					AgentTransferPolicy.none(),
					AgentDelegationPolicy.to([RESEARCHER]),
				),
				declaredAgent(RESEARCHER, "ResearchAgent", new RecordingChildModel()),
			],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);
		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("how long do I have?")));

		const measured = [];
		for await (const event of storage.readEvents(result.sessionId, SessionRevision.initial())) {
			const inner = event.event;
			if (inner instanceof AssistantMessageProduced && inner.measurement?.model?.model === "child") {
				measured.push(inner.measurement);
			}
		}

		expect(measured).toHaveLength(1);
	});

	it("refuses a delegation nobody declared, before any child run exists", async () => {
		const runtime = await host.start(
			[
				declaredAgent(SUPPORT, "SupportAgent", new DelegatingModel("researcher", "anything")),
				declaredAgent(RESEARCHER, "ResearchAgent", new RecordingChildModel()),
			],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		await expect(runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("go")))).rejects.toBeInstanceOf(
			DelegationNotDeclaredError,
		);
	});

	it("stops a chain of delegations at the maximum depth", async () => {
		const runtime = await host.start(
			[
				declaredAgent(
					SUPPORT,
					"SupportAgent",
					new DelegatingModel("support", "again"),
					[],
					AgentTransferPolicy.none(),
					AgentDelegationPolicy.to([SUPPORT]),
				),
			],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		await expect(runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("go")))).rejects.toBeInstanceOf(
			AgentMaxDelegationDepthError,
		);
	});

	it("streams the same text ask would have returned, for the same script", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(new RecordingModel())],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const turn = runtime.runner.stream(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		const chunks: string[] = [];
		let step = await turn.next();
		while (step.done !== true) {
			chunks.push(step.value.textDelta);
			step = await turn.next();
		}

		expect(chunks.join("")).toBe(step.value.text);
		expect(step.value.text).toBe("answer 1");
	});

	it("does not let a chunk move the session, and rehydrates the answer rather than the pieces", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(new RecordingModel())],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const turn = runtime.runner.stream(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		let chunks = 0;
		let step = await turn.next();
		while (step.done !== true) {
			chunks += 1;
			step = await turn.next();
		}

		const head = await storage.findOrFail(step.value.sessionId);
		const types = await eventTypesOf(storage, step.value.sessionId);
		expect(chunks).toBeGreaterThan(0);
		expect(head.revision.value).toBe(types.length);
		expect(types).toEqual([
			"session.created",
			"session.user-message-received",
			"run.started",
			"run.assistant-message-produced",
			"run.completed",
		]);
	});

	it("shows what each model call was actually given", async () => {
		const runtime = await host.start(
			[agentOf(new ToolCallingModel(), [lookupOf(new LookupHandler())])],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const snapshots = await runtime.runner.explain(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));

		expect(snapshots).toHaveLength(2);
		expect(snapshots[0]?.agent.value).toBe("support");
		expect(snapshots[0]?.segment("instructions")?.text).toContain("Be brief.");
		expect(snapshots[0]?.segment("tools")?.text).toContain("lookup_order");
		expect(snapshots[1]?.segment("conversation")?.text).toContain("lookup_order");
	});

	it("keeps the stable prefix identical between two runs of the same agent", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(new RecordingModel())],
			storage,
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const first = await runtime.runner.explain(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		const second = await runtime.runner.explain(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const prefixes = [first[0], second[0]].filter((snapshot) => snapshot !== undefined);
		const report = new PrefixComparator().compare(prefixes);
		expect(report.isIdentical).toBe(true);
	});

	it("answers that a finished conversation is waiting on nobody", async () => {
		const runtime = await host.start(
			[agentOf(new RecordingModel())],
			new InMemorySessionStorage(),
			artifactsOf(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);
		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const inspection = await runtime.sessions.handle(result.sessionId);

		expect(inspection.isAwaitingApproval).toBe(false);
		expect(result.awaiting).toEqual([]);
	});
});
