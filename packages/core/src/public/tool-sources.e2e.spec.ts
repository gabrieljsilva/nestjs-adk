import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../adapters/schema/zod-tool-schema";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage";
import type { AgentRunId } from "../common/identity/agent-run-id";
import type { SessionId } from "../common/identity/session-id";
import { ToolCallId } from "../common/identity/tool-call-id";
import { ToolSource } from "../contracts/tool-source";
import { AgentDefinition } from "../domain/agent/agent-definition";
import { AgentDescription } from "../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies";
import { AgentName } from "../domain/agent/agent-name";
import { DeclaredAgent } from "../domain/agent/declared-agent";
import { LlmModel } from "../domain/model/llm-model";
import { ModelCapabilities } from "../domain/model/model-capabilities";
import { ModelCapability } from "../domain/model/model-capability";
import { ModelChunk } from "../domain/model/model-chunk";
import { ModelContextWindow } from "../domain/model/model-context-window";
import { ModelDescriptor } from "../domain/model/model-descriptor";
import { ModelIdentity } from "../domain/model/model-identity";
import type { ModelRequest } from "../domain/model/model-request";
import { ModelUsage } from "../domain/model/model-usage";
import { ToolCallDelta } from "../domain/model/tool-call-delta";
import { ToolResultMessage } from "../domain/model/tool-result-message";
import { PromptInstructions } from "../domain/prompt/prompt-instructions";
import { ApproveInput } from "../domain/session/approve-input";
import { AskInput } from "../domain/session/ask-input";
import { EffectApprovalPolicy } from "../domain/tool/effect-approval-policy";
import { ToolSourceAuthError } from "../domain/tool/errors/tool-source-auth.error";
import { ToolDefinition } from "../domain/tool/tool-definition";
import { ToolEffect } from "../domain/tool/tool-effect";
import { ToolHandler } from "../domain/tool/tool-handler";
import { RuntimeOptions } from "../runtime/composition/runtime-options";
import { AgentRunCommand } from "../runtime/run/agent-run-command";
import { FakeClock } from "../support/fake-clock";
import { SequenceIdGenerator } from "../support/sequence-id-generator";
import { AdkRuntimeHost } from "./adk-runtime-host";

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
				ZodToolSchema.of(z.object({})),
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
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
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
			yield ModelChunk.usage(ModelUsage.of(10, 2));
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(new ToolCallDelta(0, "{}", "c-1", REMOTE_TOOL));
		yield ModelChunk.usage(ModelUsage.of(10, 2));
		yield ModelChunk.finish("tool_calls");
	}
}

/** Fails on the first turn, so the run ends the hard way and the source still has to close. */
class ThrowingModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		yield await Promise.reject(new TypeError("the adapter has a bug"));
	}
}

function agentOf(model: LlmModel, policies: AgentExecutionPolicies = AgentExecutionPolicies.of()): DeclaredAgent {
	return new DeclaredAgent(
		AgentDefinition.of(
			SUPPORT,
			AgentDescription.from("support agent", "support"),
			model,
			PromptInstructions.from("Be brief."),
			policies,
		),
		"SupportAgent",
	);
}

const host = new AdkRuntimeHost();

afterEach(async () => {
	await host.stop();
});

const start = (model: LlmModel, options: RuntimeOptions = new RuntimeOptions()) =>
	host.start(
		[agentOf(model)],
		new InMemorySessionStorage(),
		new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
		new FakeClock(),
		new SequenceIdGenerator(),
		options,
	);

const askWith = (sources: readonly ToolSource[], message = "look it up") =>
	new AgentRunCommand(SUPPORT, AskInput.of(message), undefined, undefined, undefined, undefined, undefined, sources);

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
						ZodToolSchema.of(z.object({})),
						ToolEffect.READ,
						new CredentialHandler("run"),
					),
				];
			}
		})("run");
		const model = new RemoteCallingModel();
		const runtime = await start(model, RuntimeOptions.from({ sources: [declared] }));

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
		const runtime = await start(new RemoteCallingModel(), RuntimeOptions.from({ sources: [new CredentialSource("m")] }));

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
			RuntimeOptions.from({ approvals: EffectApprovalPolicy.from(ToolEffect.WRITE) }),
		);
		const suspended = await runtime.runner.ask(askWith([new CredentialSource("alice", ToolEffect.WRITE)]));
		expect(suspended.isAwaitingApproval).toBe(true);

		const resumed = await runtime.runner.approve(
			ApproveInput.of(suspended.sessionId, ToolCallId.from("c-1"), "gabriel", [
				new CredentialSource("alice", ToolEffect.WRITE),
			]),
		);

		expect(resumed.text).toBe("alice");
	});

	it("closes the approval's own source when the approval ends", async () => {
		const runtime = await start(
			new RemoteCallingModel(),
			RuntimeOptions.from({ approvals: EffectApprovalPolicy.from(ToolEffect.WRITE) }),
		);
		const suspended = await runtime.runner.ask(askWith([new CredentialSource("alice", ToolEffect.WRITE)]));
		const onApproval = new CredentialSource("alice", ToolEffect.WRITE);

		await runtime.runner.approve(ApproveInput.of(suspended.sessionId, ToolCallId.from("c-1"), "gabriel", [onApproval]));

		expect(onApproval.closes).toBe(1);
	});
});
