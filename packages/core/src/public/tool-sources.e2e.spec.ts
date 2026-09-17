import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../adapters/schema/zod-tool-schema.adapter";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage.adapter";
import type { AgentRunId } from "../common/identity/agent-run-id.value-object";
import type { SessionId } from "../common/identity/session-id.value-object";
import { ToolCallId } from "../common/identity/tool-call-id.value-object";
import { ToolSource } from "../contracts/tool/tool-source.contract";
import { AgentDefinition } from "../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies.value-object";
import { AgentName } from "../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import { ModelCapabilities } from "../domain/model/descriptor/model-capabilities.value-object";
import { ModelCapability } from "../domain/model/descriptor/model-capability.value-object";
import { ModelContextWindow } from "../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../domain/model/descriptor/model-identity.value-object";
import { LlmModel } from "../domain/model/llm-model.contract";
import { ToolResultMessage } from "../domain/model/messages/tool-result-message.value-object";
import type { ModelRequest } from "../domain/model/model-request.value-object";
import { ModelChunk } from "../domain/model/streaming/model-chunk.value-object";
import { ToolCallDelta } from "../domain/model/streaming/tool-call-delta.value-object";
import { ModelUsage } from "../domain/model/usage/model-usage.value-object";
import { PromptInstructions } from "../domain/prompt/prompt-instructions.value-object";
import { ApproveInput } from "../domain/session/input/approve-input.command";
import { AskInput } from "../domain/session/input/ask-input.command";
import { EffectApprovalPolicy } from "../domain/tool/approval/effect-approval.policy";
import { ToolEffect } from "../domain/tool/approval/tool-effect.value-object";
import { ToolSourceAuthError } from "../domain/tool/errors/tool-source-auth.error";
import { ToolHandler } from "../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../domain/tool/tool-definition.value-object";
import { RuntimeOptions } from "../runtime/composition/runtime.options";
import { AgentRunCommand } from "../runtime/run/agent-run.command";
import { FakeClock } from "../support/fake-clock.double";
import { SequenceIdGenerator } from "../support/sequence-id-generator.double";
import { AdkRuntime } from "./adk-runtime.edge";

const SUPPORT = AgentName.from("support");
const REMOTE_TOOL = "remote_lookup";

/** Answers with whoever's credential the tool ran under, which is what isolation is about. */
class CredentialHandler extends ToolHandler {
	public constructor(private readonly credential: string) {
		super();
	}

	public async invoke(): Promise<unknown> {
		return { seenBy: this.credential };
	}
}

class CredentialSource extends ToolSource {
	public readonly name: string;
	public readonly openedFor: string[] = [];
	public closes = 0;

	public constructor(
		private readonly credential: string,
		private readonly effect: ToolEffect = ToolEffect.READ,
	) {
		super();
		this.name = `source-${credential}`;
	}

	public async open(_sessionId: SessionId, runId: AgentRunId): Promise<readonly ToolDefinition[]> {
		this.openedFor.push(runId.value);
		return [
			new ToolDefinition(
				REMOTE_TOOL,
				"Looks something up remotely",
				ZodToolSchema.fromSchema(z.object({})),
				this.effect,
				new CredentialHandler(this.credential),
			),
		];
	}

	public async close(): Promise<void> {
		this.closes += 1;
	}
}

/** Will not let the runtime in, which is a smaller conversation and not a failed one. */
class ExpiredSource extends ToolSource {
	public readonly name = "expired";
	public closes = 0;

	public async open(): Promise<readonly ToolDefinition[]> {
		throw new ToolSourceAuthError(this.name, "the token expired");
	}

	public async close(): Promise<void> {
		this.closes += 1;
	}
}

/** Calls the remote tool once, then answers with what it got back. */
class RemoteCallingModel extends LlmModel {
	public readonly offered: string[][] = [];

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(100_000, 4000),
			ModelCapabilities.fromEntries([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.offered.push(request.tools.map((tool) => tool.name));
		const results = request.messages.filter(
			(message): message is ToolResultMessage => message instanceof ToolResultMessage,
		);
		const answered = results[0]?.output;
		if (answered !== undefined) {
			yield ModelChunk.text(String(Reflect.get(Object(answered), "seenBy")));
			yield ModelChunk.usage(ModelUsage.fromReport(10, 2));
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(new ToolCallDelta(0, "{}", "c-1", REMOTE_TOOL));
		yield ModelChunk.usage(ModelUsage.fromReport(10, 2));
		yield ModelChunk.finish("tool_calls");
	}
}

/** Fails on the first turn, so the run ends the hard way and the source still has to close. */
class ThrowingModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(100_000, 4000),
			ModelCapabilities.fromEntries([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		yield await Promise.reject(new TypeError("the adapter has a bug"));
	}
}

function agentOf(model: LlmModel, policies: AgentExecutionPolicies = new AgentExecutionPolicies()): DeclaredAgent {
	return new DeclaredAgent(
		new AgentDefinition({
			name: SUPPORT,
			description: AgentDescription.from("support agent", "support"),
			model: model,
			instructions: PromptInstructions.from("Be brief."),
			policies: policies,
		}),
		"SupportAgent",
	);
}

const host = new AdkRuntime();

afterEach(async () => {
	await host.stop();
});

const start = (model: LlmModel, options: RuntimeOptions = new RuntimeOptions()) =>
	host.start({
		agents: [agentOf(model)],
		storage: new InMemorySessionStorage(),
		artifacts: new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
		clock: new FakeClock(),
		ids: new SequenceIdGenerator(),
		options: options,
	});

const askWith = (sources: readonly ToolSource[], message = "look it up") =>
	new AgentRunCommand({
		agent: SUPPORT,
		input: AskInput.fromMessage(message),
		sources: sources,
	});

describe("tool sources declared per run", () => {
	/** AC-18: the run's sources are added to the module's rather than replacing them. */
	it("offers the module's tools and the run's together", async () => {
		const declared = new CredentialSource("module");
		const perRun = new (class extends CredentialSource {
			public async open(): Promise<readonly ToolDefinition[]> {
				return [
					new ToolDefinition(
						"per_run_tool",
						"Only this run has it",
						ZodToolSchema.fromSchema(z.object({})),
						ToolEffect.READ,
						new CredentialHandler("run"),
					),
				];
			}
		})("run");
		const model = new RemoteCallingModel();
		const runtime = await start(model, RuntimeOptions.from({ tools: { sources: [declared] } }));

		await runtime.runner.ask(askWith([perRun]));

		expect(model.offered[0]).toEqual(expect.arrayContaining([REMOTE_TOOL, "per_run_tool"]));
	});

	it("runs the tool the run's own source offered", async () => {
		const runtime = await start(new RemoteCallingModel());

		const result = await runtime.runner.ask(askWith([new CredentialSource("alice")]));

		expect(result.text).toBe("alice");
	});

	it("opens and closes a run's source exactly once", async () => {
		const source = new CredentialSource("alice");
		const runtime = await start(new RemoteCallingModel());

		await runtime.runner.ask(askWith([source]));

		expect(source.openedFor).toHaveLength(1);
		expect(source.closes).toBe(1);
	});

	/** AC-18: however the run ends. A connection a failed run left open is a leak. */
	it("closes a run's source when the run fails", async () => {
		const source = new CredentialSource("alice");
		const runtime = await start(new ThrowingModel());

		await expect(runtime.runner.ask(askWith([source]))).rejects.toBeInstanceOf(TypeError);

		expect(source.closes).toBe(1);
	});

	it("answers anyway when a run's source will not authorize", async () => {
		const expired = new ExpiredSource();
		const runtime = await start(
			new RemoteCallingModel(),
			RuntimeOptions.from({ tools: { sources: [new CredentialSource("m")] } }),
		);

		const result = await runtime.runner.ask(askWith([expired]));

		expect(result.text).toBe("m");
		expect(expired.closes).toBe(0);
	});

	/** AC-20: two runs, two credentials, and neither ever sees the other's. */
	it("keeps one run's credential out of another run's", async () => {
		const runtime = await start(new RemoteCallingModel());

		const [alice, bob] = await Promise.all([
			runtime.runner.ask(askWith([new CredentialSource("alice")], "alice asks")),
			runtime.runner.ask(askWith([new CredentialSource("bob")], "bob asks")),
		]);

		expect([alice.text, bob.text]).toEqual(["alice", "bob"]);
	});

	/** AC-19: the run that suspended is over, so the approval opens the source again itself. */
	it("resumes a held call from a source the approval declared", async () => {
		const runtime = await start(
			new RemoteCallingModel(),
			RuntimeOptions.from({ tools: { approvals: EffectApprovalPolicy.from(ToolEffect.WRITE) } }),
		);
		const suspended = await runtime.runner.ask(askWith([new CredentialSource("alice", ToolEffect.WRITE)]));
		expect(suspended.isAwaitingApproval).toBe(true);

		const resumed = await runtime.runner.approve(
			new ApproveInput({
				sessionId: suspended.sessionId,
				callId: ToolCallId.from("c-1"),
				approvedBy: "gabriel",
				sources: [new CredentialSource("alice", ToolEffect.WRITE)],
			}),
		);

		expect(resumed.text).toBe("alice");
	});

	it("closes the approval's own source when the approval ends", async () => {
		const runtime = await start(
			new RemoteCallingModel(),
			RuntimeOptions.from({ tools: { approvals: EffectApprovalPolicy.from(ToolEffect.WRITE) } }),
		);
		const suspended = await runtime.runner.ask(askWith([new CredentialSource("alice", ToolEffect.WRITE)]));
		const onApproval = new CredentialSource("alice", ToolEffect.WRITE);

		await runtime.runner.approve(
			new ApproveInput({
				sessionId: suspended.sessionId,
				callId: ToolCallId.from("c-1"),
				approvedBy: "gabriel",
				sources: [onApproval],
			}),
		);

		expect(onApproval.closes).toBe(1);
	});
});
