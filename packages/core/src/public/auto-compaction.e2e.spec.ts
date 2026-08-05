import { afterEach, describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage";
import { SessionRevision } from "../common/revision/session-revision";
import type { ContextSummarizer } from "../contracts/context-summarizer";
import { AgentDefinition } from "../domain/agent/agent-definition";
import { AgentDescription } from "../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies";
import { AgentName } from "../domain/agent/agent-name";
import { DeclaredAgent } from "../domain/agent/declared-agent";
import { AdkCompactionPolicy } from "../domain/context/adk-compaction-policy";
import { CompactionDecision } from "../domain/context/compaction-decision";
import type { ContextBlock } from "../domain/context/context-block";
import type { ContextBudget } from "../domain/context/context-budget";
import { LlmModel } from "../domain/model/llm-model";
import { ModelCapabilities } from "../domain/model/model-capabilities";
import { ModelChunk } from "../domain/model/model-chunk";
import { ModelContextWindow } from "../domain/model/model-context-window";
import { ModelDescriptor } from "../domain/model/model-descriptor";
import { ModelIdentity } from "../domain/model/model-identity";
import { ModelRequest } from "../domain/model/model-request";
import { ModelUsage } from "../domain/model/model-usage";
import { PromptInstructions } from "../domain/prompt/prompt-instructions";
import { AskInput } from "../domain/session/ask-input";
import { RunLimits } from "../domain/session/run-limits";
import { RuntimeOptions } from "../runtime/composition/runtime-options";
import { ShutdownOptions } from "../runtime/lifecycle/shutdown-options";
import { AgentRunCommand } from "../runtime/run/agent-run-command";
import { FakeClock } from "../support/fake-clock";
import { SequenceIdGenerator } from "../support/sequence-id-generator";
import { AdkRuntimeHost } from "./adk-runtime-host";

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
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(10_000, 1_000),
			ModelCapabilities.none(),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		yield ModelChunk.text(`answer ${this.requests.length} ${"detail ".repeat(40)}`);
		// A provider reporting a large prompt is the only thing that makes a budget real.
		yield ModelChunk.usage(ModelUsage.of(900 * this.requests.length, 5));
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

	public async summarize(blocks: readonly ContextBlock[]): Promise<string> {
		this.calls += 1;
		return `SUMMARY(${blocks.length})`;
	}
}

function agentOf(model: LlmModel, compaction: AdkCompactionPolicy): DeclaredAgent {
	const definition = AgentDefinition.of(
		SUPPORT,
		AgentDescription.from("Support agent", SUPPORT.value),
		model,
		PromptInstructions.from("Be brief."),
		AgentExecutionPolicies.of(undefined, compaction),
	);
	return new DeclaredAgent(definition, "SupportAgent");
}

function optionsWith(summarizer: ContextSummarizer): RuntimeOptions {
	return new RuntimeOptions(
		ShutdownOptions.waitIndefinitely(),
		RunLimits.none(),
		[],
		undefined,
		undefined,
		[],
		undefined,
		undefined,
		summarizer,
	);
}

describe("auto compaction, against a scripted model", () => {
	const host = new AdkRuntimeHost();

	afterEach(async () => {
		await host.stop();
	});

	it("shortens the conversation once the measured prompt passes the policy's threshold", async () => {
		const model = new CountingModel();
		const summarizer = new NamingSummarizer();
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(model, new AboveThreshold(400))],
			storage,
			new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			new FakeClock(),
			new SequenceIdGenerator(),
			optionsWith(summarizer),
		);

		const first = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("one")));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("two", first.sessionId)));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("three", first.sessionId)));

		const last = model.requests.at(-1);
		expect(summarizer.calls).toBeGreaterThan(0);
		expect(last?.messages.map((message) => message.text).join(" ")).toContain("SUMMARY(");
	});

	it("leaves the journal exactly as it was: compaction shortens a prompt, not a history", async () => {
		const model = new CountingModel();
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(model, new AboveThreshold(400))],
			storage,
			new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			new FakeClock(),
			new SequenceIdGenerator(),
			optionsWith(new NamingSummarizer()),
		);

		const first = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("one")));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("two", first.sessionId)));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("three", first.sessionId)));

		const said: string[] = [];
		for await (const stored of storage.readEvents(first.sessionId, SessionRevision.initial())) {
			said.push(stored.event.type);
		}
		expect(said.filter((type) => type === "session.user-message-received")).toHaveLength(3);
		expect(said.some((type) => type.includes("compact"))).toBe(false);
	});

	it("drops instead of summarizing when the application declared no summarizer", async () => {
		const model = new CountingModel();
		const runtime = await host.start(
			[agentOf(model, new AboveThreshold(400))],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const first = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("one")));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("two", first.sessionId)));
		const third = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("three", first.sessionId)));

		expect(third.status.name).toBe("completed");
		expect(
			model.requests
				.at(-1)
				?.messages.map((message) => message.text)
				.join(" "),
		).not.toContain("SUMMARY");
	});
});
