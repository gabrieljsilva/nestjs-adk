import { afterEach, describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage.adapter";
import { SessionRevision } from "../common/revision/session-revision.value-object";
import { CompactionStrategy } from "../contracts/context/compaction-strategy.contract";
import type { ContextSummarizer } from "../contracts/context/context-summarizer.contract";
import { AgentDefinition } from "../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies.value-object";
import { AgentName } from "../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import { AdkCompactionPolicy } from "../domain/context/adk-compaction.policy";
import { CompactionDecision } from "../domain/context/compaction-decision.value-object";
import type { ContextBlock } from "../domain/context/context-block.value-object";
import type { ContextBudget } from "../domain/context/context-budget.value-object";
import type { ContextProjection } from "../domain/context/context-projection.value-object";
import { ModelCapabilities } from "../domain/model/descriptor/model-capabilities.value-object";
import { ModelContextWindow } from "../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../domain/model/descriptor/model-identity.value-object";
import { LlmModel } from "../domain/model/llm-model.contract";
import { ModelRequest } from "../domain/model/model-request.value-object";
import { ModelChunk } from "../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../domain/model/usage/model-usage.value-object";
import { PromptInstructions } from "../domain/prompt/prompt-instructions.value-object";
import type { RunContext } from "../domain/run/run-context.value-object";
import { SessionContext } from "../domain/run/session-context.value-object";
import { AskInput } from "../domain/session/input/ask-input.command";
import { RunLimits } from "../domain/session/run/run-limits.value-object";
import { RuntimeOptions } from "../runtime/composition/runtime.options";
import { ContextMeasurer } from "../runtime/context/context-measurer.service";
import { OldestFirstCompactionStrategy } from "../runtime/context/oldest-first-compaction.strategy";
import { ShutdownOptions } from "../runtime/lifecycle/shutdown.options";
import { AgentRunCommand } from "../runtime/run/agent-run.command";
import { FakeClock } from "../support/fake-clock.double";
import { SequenceIdGenerator } from "../support/sequence-id-generator.double";
import { AdkRuntime } from "./adk-runtime.edge";

const SUPPORT = AgentName.from("support");

/**
 * Compaction is proved against a scripted model and never against a real provider.
 *
 * What has to be true here is that a long conversation is shortened, that the summary
 * lands where the dropped turns were, and that the journal is untouched by any of it.
 * None of that depends on a provider being clever, and asking one to grow a context past
 * a real window would be an expensive way to learn nothing.
 */
class CountingModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(10_000, 1_000),
			ModelCapabilities.none(),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		yield ModelChunk.text(`answer ${this.requests.length} ${"detail ".repeat(40)}`);
		// A provider reporting a large prompt is the only thing that makes a budget real.
		yield ModelChunk.usage(ModelUsage.fromReport(900 * this.requests.length, 5));
		yield ModelChunk.finish("stop");
	}
}

/** Compacts as soon as the measured prompt passes a threshold a test can reach in three turns. */
class AboveThreshold extends AdkCompactionPolicy {
	public constructor(private readonly limit: number) {
		super();
	}

	public decide(budget: ContextBudget): CompactionDecision {
		const used = budget.usedTokens?.tokens ?? 0;
		return used > this.limit ? CompactionDecision.keepShare(0.6, 1) : CompactionDecision.skip();
	}
}

/** Says what it replaced, so a test can find the summary among the messages. */
class NamingSummarizer implements ContextSummarizer {
	public calls = 0;

	public async summarize(_context: RunContext, blocks: readonly ContextBlock[]): Promise<string> {
		this.calls += 1;
		return `SUMMARY(${blocks.length})`;
	}
}

function agentOf(model: LlmModel, compaction: AdkCompactionPolicy): DeclaredAgent {
	const definition = new AgentDefinition({
		name: SUPPORT,
		description: AgentDescription.from("Support agent", SUPPORT.value),
		model: model,
		instructions: PromptInstructions.from("Be brief."),
		policies: new AgentExecutionPolicies(undefined, compaction),
	});
	return new DeclaredAgent(definition, "SupportAgent");
}

function optionsWith(summarizer: ContextSummarizer): RuntimeOptions {
	return RuntimeOptions.from({ limits: RunLimits.unbounded(), context: { summarizer } });
}

/** Shortens the way the shipped strategy does, and counts, which is the observable part. */
class RecordingStrategy extends CompactionStrategy {
	public readonly name = "recording";
	public readonly version = 1;
	public calls = 0;

	private readonly shipped = new OldestFirstCompactionStrategy(new ContextMeasurer());

	public async compact(
		context: RunContext,
		projection: ContextProjection,
		decision: CompactionDecision,
	): Promise<ContextProjection> {
		this.calls += 1;
		return this.shipped.compact(context, projection, decision);
	}
}

describe("auto compaction, against a scripted model", () => {
	const host = new AdkRuntime();

	afterEach(async () => {
		await host.stop();
	});

	it("shortens the conversation once the measured prompt passes the policy's threshold", async () => {
		const model = new CountingModel();
		const summarizer = new NamingSummarizer();
		const storage = new InMemorySessionStorage();
		const runtime = await host.start({
			agents: [agentOf(model, new AboveThreshold(400))],
			storage: storage,
			artifacts: new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			clock: new FakeClock(),
			ids: new SequenceIdGenerator(),
			options: optionsWith(summarizer),
		});

		const first = await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("one"),
			}),
		);
		await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("two", first.sessionId),
			}),
		);
		await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("three", first.sessionId),
			}),
		);

		const last = model.requests.at(-1);
		expect(summarizer.calls).toBeGreaterThan(0);
		expect(last?.messages.map((message) => message.text).join(" ")).toContain("SUMMARY(");
	});

	it("leaves the journal exactly as it was: compaction shortens a prompt, not a history", async () => {
		const model = new CountingModel();
		const storage = new InMemorySessionStorage();
		const runtime = await host.start({
			agents: [agentOf(model, new AboveThreshold(400))],
			storage: storage,
			artifacts: new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			clock: new FakeClock(),
			ids: new SequenceIdGenerator(),
			options: optionsWith(new NamingSummarizer()),
		});

		const first = await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("one"),
			}),
		);
		await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("two", first.sessionId),
			}),
		);
		await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("three", first.sessionId),
			}),
		);

		const said: string[] = [];
		for await (const stored of storage.readEvents(
			SessionContext.fromSessionId(first.sessionId),
			SessionRevision.initial(),
		)) {
			said.push(stored.event.type);
		}
		expect(said.filter((type) => type === "session.user-message-received")).toHaveLength(3);
		expect(said.some((type) => type.includes("compact"))).toBe(false);
	});

	it("drops instead of summarizing when the application declared no summarizer", async () => {
		const model = new CountingModel();
		const runtime = await host.start({
			agents: [agentOf(model, new AboveThreshold(400))],
			storage: new InMemorySessionStorage(),
			artifacts: new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			clock: new FakeClock(),
			ids: new SequenceIdGenerator(),
		});

		const first = await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("one"),
			}),
		);
		await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("two", first.sessionId),
			}),
		);
		const third = await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("three", first.sessionId),
			}),
		);

		expect(third.status.name).toBe("completed");
		expect(
			model.requests
				.at(-1)
				?.messages.map((message) => message.text)
				.join(" "),
		).not.toContain("SUMMARY");
	});

	/** The shipped strategy is a default, and a declared one is what the runtime composes with. */
	it("compacts through the strategy the application declared", async () => {
		const model = new CountingModel();
		const compactionStrategy = new RecordingStrategy();
		const runtime = await host.start({
			agents: [agentOf(model, new AboveThreshold(400))],
			storage: new InMemorySessionStorage(),
			artifacts: new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			clock: new FakeClock(),
			ids: new SequenceIdGenerator(),
			options: RuntimeOptions.from({ context: { compactionStrategy: compactionStrategy } }),
		});

		const first = await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("one"),
			}),
		);
		await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("two", first.sessionId),
			}),
		);
		await runtime.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("three", first.sessionId),
			}),
		);

		expect(compactionStrategy.calls).toBeGreaterThan(0);
	});
});
