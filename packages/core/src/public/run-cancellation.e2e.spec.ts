import { afterEach, describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage.adapter";
import { SessionId } from "../common/identity/session-id.value-object";
import { SessionRevision } from "../common/revision/session-revision.value-object";
import { AgentDefinition } from "../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies.value-object";
import { AgentName } from "../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import { AgentRunCancelled } from "../domain/event/catalog/run/agent-run-cancelled.event";
import { AgentRunCompleted } from "../domain/event/catalog/run/agent-run-completed.event";
import { AgentRunFailed } from "../domain/event/catalog/run/agent-run-failed.event";
import type { SessionEvent } from "../domain/event/session-event.event";
import { ModelCapabilities } from "../domain/model/descriptor/model-capabilities.value-object";
import { ModelContextWindow } from "../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../domain/model/descriptor/model-identity.value-object";
import { LlmModel } from "../domain/model/llm-model.contract";
import { ModelChunk } from "../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../domain/model/usage/model-usage.value-object";
import { PromptInstructions } from "../domain/prompt/prompt-instructions.value-object";
import { SessionContext } from "../domain/run/session-context.value-object";
import { AskInput } from "../domain/session/input/ask-input.command";
import { AgentRunCommand } from "../runtime/run/agent-run.command";
import { FakeClock } from "../support/fake-clock.double";
import { SequenceIdGenerator } from "../support/sequence-id-generator.double";
import { AdkRuntime } from "./adk-runtime.edge";

const SUPPORT = AgentName.from("support");
const WORDS = 50;

/**
 * Answers one word at a time and stops the moment the run is aborted, which is what a
 * provider adapter does with the signal it is handed.
 *
 * The abort is fired from inside the generation rather than before it, because that is
 * the case worth proving: a caller pressing stop while an answer is already streaming.
 */
class SlowModel extends LlmModel {
	public words = 0;

	public constructor(private readonly onFirstWord: () => void = () => undefined) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(100_000, 4000),
			ModelCapabilities.fromEntries([]),
		);
	}

	public async *generate(_request: unknown, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		for (let word = 0; word < WORDS; word += 1) {
			if (signal?.aborted === true) throw new Error(String(signal.reason));
			this.words += 1;
			yield ModelChunk.text(`word-${word} `);
			if (word === 0) this.onFirstWord();
			await Promise.resolve();
		}
		yield ModelChunk.usage(ModelUsage.fromReport(10, WORDS));
		yield ModelChunk.finish("stop");
	}
}

function agentOf(model: LlmModel): DeclaredAgent {
	return new DeclaredAgent(
		new AgentDefinition(
			SUPPORT,
			AgentDescription.from("support agent", "support"),
			model,
			PromptInstructions.from("Be brief."),
			new AgentExecutionPolicies(),
		),
		"SupportAgent",
	);
}

const host = new AdkRuntime();

afterEach(async () => {
	await host.stop();
});

/** A runtime of its own per case, so one session id never collides with another's. */
async function start(model: LlmModel) {
	const storage = new InMemorySessionStorage();
	const runtime = await host.start(
		[agentOf(model)],
		storage,
		new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
		new FakeClock(),
		new SequenceIdGenerator(),
	);
	return { runtime, storage };
}

async function readJournal(storage: InMemorySessionStorage, sessionId: SessionId): Promise<SessionEvent[]> {
	const events: SessionEvent[] = [];
	for await (const stored of storage.readEvents(SessionContext.fromSessionId(sessionId), SessionRevision.initial()))
		events.push(stored.event);
	return events;
}

function askUnder(signal: AbortSignal, sessionId?: SessionId): AgentRunCommand {
	return new AgentRunCommand(
		SUPPORT,
		AskInput.with("tell me a long story", [], sessionId),
		undefined,
		undefined,
		undefined,
		[],
		signal,
	);
}

/**
 * Stopping a run the caller no longer wants.
 *
 * Without this the only thing an application can do is stop reading the stream, which
 * stops nothing: the provider goes on generating and billing, and the journal closes the
 * run as if it had been answered. The signal is what turns that into a recorded ending.
 */
describe("a run the caller aborts", () => {
	it("ends the run instead of answering it", async () => {
		const controller = new AbortController();
		const { runtime } = await start(new SlowModel(() => controller.abort()));

		await expect(runtime.runner.ask(askUnder(controller.signal))).rejects.toThrow();
	});

	/** A run that was stopped on purpose is not a run that failed, and the journal says which. */
	it("records that it was cancelled, not that it failed", async () => {
		const controller = new AbortController();
		const stopping = { pressed: false };
		const { runtime, storage } = await start(
			new SlowModel(() => {
				if (stopping.pressed) controller.abort();
			}),
		);

		const answered = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("hi")));
		stopping.pressed = true;
		await runtime.runner.ask(askUnder(controller.signal, answered.sessionId)).catch(() => undefined);

		const journal = await readJournal(storage, answered.sessionId);
		expect(journal.some((event) => event instanceof AgentRunCancelled)).toBe(true);
		expect(journal.some((event) => event instanceof AgentRunFailed)).toBe(false);
		expect(journal.filter((event) => event instanceof AgentRunCompleted)).toHaveLength(1);
	});

	/** The point of the whole thing: tokens stop being generated, and therefore billed. */
	it("stops the model where it was, instead of paying for the rest of the answer", async () => {
		const controller = new AbortController();
		const model = new SlowModel(() => controller.abort());
		const { runtime } = await start(model);

		const failure = await runtime.runner.ask(askUnder(controller.signal)).then(
			() => undefined,
			(error: unknown) => error,
		);

		expect(failure).toBeDefined();
		expect(model.words).toBeLessThan(WORDS);
	});

	it("answers normally when nobody aborts anything", async () => {
		const { runtime } = await start(new SlowModel());

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("hi")));

		expect(result.text).toContain(`word-${WORDS - 1}`);
	});
});
