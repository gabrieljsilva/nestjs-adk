import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage.adapter";
import { ContentDigest } from "../../common/digest/content-digest.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { ContextNoticeSink } from "../../contracts/context/context-notice-sink.contract";
import { AppendEventsCommand } from "../../contracts/storage/append-events.command";
import type { SessionStorage } from "../../contracts/storage/session-storage.contract";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { ContextCheckpoint } from "../../domain/context/context-checkpoint.value-object";
import { ContextProjection } from "../../domain/context/context-projection.value-object";
import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown.value-object";
import { ContextBudgetExceededError } from "../../domain/context/errors/context-budget-exceeded.error";
import { WindowShareCompactionPolicy } from "../../domain/context/window-share-compaction.policy";
import { SessionEventBatch } from "../../domain/event/session-event-batch.value-object";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { UnknownContextWindow } from "../../domain/model/descriptor/unknown-context-window.value-object";
import { ToolDeclaration } from "../../domain/model/messages/tool-declaration.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { PromptMeasurement } from "../../domain/model/usage/prompt-measurement.value-object";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { Session } from "../../domain/session/session.entity";
import { JournalFixture } from "../../support/context/journal.fixture";
import { StubModel } from "../../support/model/stub-model.fixture";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { ContextMeasurer } from "./context-measurer.service";
import { ContextProjector } from "./context-projector.service";
import { ContextWindowNotifier } from "./context-window-notifier.service";
import { ContextService } from "./context.service";
import { OldestFirstCompactionStrategy } from "./oldest-first-compaction.strategy";
import { PrepareContextCommand } from "./prepare-context.command";
import { StablePrefixDigest } from "./stable-prefix-digest.service";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const measurer = new ContextMeasurer();

function ctxOf(journal: JournalFixture): RunContext {
	return RunContextFixture.run(journal.sessionId);
}

function runOf(journal: JournalFixture) {
	return RunContextFixture.run(journal.sessionId);
}

/**
 * A call the provider counted, over exactly the text a journal projects to.
 *
 * The character count is what carries the measurement forward, so a fixture that guessed
 * it would have compaction scale the previous turn by a factor nothing produced.
 */
async function measured(journal: JournalFixture, inputTokens: number): Promise<PromptMeasurement> {
	const blocks = await new ContextProjector().project(ctxOf(journal), journal.stream());
	const characters = measurer.measure(new ContextProjection(blocks));
	const measurement = PromptMeasurement.from(ModelUsage.fromReport(inputTokens, 50), characters);
	if (measurement === undefined) throw new Error("the fixture asked for a measurement of nothing");
	return measurement;
}

class RecordingSink extends ContextNoticeSink {
	public readonly notices: ContextWindowUnknown[] = [];

	public report(_context: SessionContext | undefined, notice: ContextWindowUnknown): void {
		this.notices.push(notice);
	}
}

class UnwritableStorage extends InMemorySessionStorage {
	public override async saveCheckpoint(): Promise<void> {
		throw new Error("the checkpoint collection is unavailable");
	}
}

function managerOf(storage: SessionStorage, notifier = new ContextWindowNotifier()): ContextService {
	return new ContextService(
		storage,
		new ContextProjector(),
		measurer,
		new StablePrefixDigest(),
		new OldestFirstCompactionStrategy(measurer),
		notifier,
	);
}

async function storageWith(journal: JournalFixture, storage: InMemorySessionStorage): Promise<InMemorySessionStorage> {
	await storage.create(ctxOf(journal), Session.start(journal.sessionId, AgentName.from("support"), NOW));
	await storage.append(
		ctxOf(journal),
		new AppendEventsCommand(
			journal.sessionId,
			SessionRevision.initial(),
			new SessionEventBatch(journal.events.map((stored) => stored.event)),
		),
	);
	return storage;
}

function conversationOf(turns: number): JournalFixture {
	const journal = new JournalFixture();
	for (let turn = 0; turn < turns; turn += 1) {
		journal.user(`question ${turn} `.repeat(4));
		journal.assistant(`answer ${turn} `.repeat(4));
	}
	return journal;
}

describe("ContextService", () => {
	it("prepares the conversation the journal recorded", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello");
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));

		const prepared = await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
			}),
		);

		expect(prepared.request.messages.map((message) => message.text)).toEqual(["hi", "hello"]);
		expect(prepared.compacted).toBe(false);
		expect(prepared.coveredRevision.value).toBe(2);
	});

	it("measures the size of the prompt in characters, and reports no size in tokens", async () => {
		const journal = new JournalFixture().user("hi");
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));
		const command = new PrepareContextCommand({
			context: runOf(journal),
			model: new StubModel(),
			tools: [new ToolDeclaration("search", "finds things", {})],
			runtimeInstructions: PromptInstructions.from("be brief"),
		});

		const prepared = await manager.prepare(command);

		expect(prepared.characters).toBeGreaterThan("be brief".length);
		expect(prepared.budget.isMeasured).toBe(false);
		expect(prepared.budget.projectedFreeTokens).toBeUndefined();
	});

	it("refuses a context a measured usage proves the window cannot hold", async () => {
		const journal = conversationOf(10);
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));
		const model = new StubModel(new ModelContextWindow(1000, 200));
		const command = new PrepareContextCommand({
			context: runOf(journal),
			model: model,
			tools: [],
			lastPrompt: await measured(journal, 900),
		});

		await expect(manager.prepare(command)).rejects.toBeInstanceOf(ContextBudgetExceededError);
	});

	it("refuses nothing while no call has been measured, and lets the provider answer", async () => {
		const journal = conversationOf(10);
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));
		const model = new StubModel(new ModelContextWindow(30, 10));

		const prepared = await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: model,
			}),
		);

		expect(prepared.budget.isMeasured).toBe(false);
	});

	it("reports how much of a known window is still free, once a call was measured", async () => {
		const journal = new JournalFixture().user("hi");
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));
		const command = new PrepareContextCommand({
			context: runOf(journal),
			model: new StubModel(new ModelContextWindow(1000, 200)),
			tools: [],
			lastPrompt: await measured(journal, 300),
		});

		const prepared = await manager.prepare(command);

		expect(prepared.budget.projectedFreeTokens).toBe(500);
		expect(prepared.budget.projectedFreeShare).toBeCloseTo(0.625, 5);
	});

	it("accepts the same context against an unknown window and reports it once", async () => {
		const journal = conversationOf(10);
		const sink = new RecordingSink();
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()), new ContextWindowNotifier(sink));
		const model = new StubModel(new UnknownContextWindow(), new ModelIdentity("acme", "windowless"));

		await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: model,
			}),
		);
		await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: model,
			}),
		);

		expect(sink.notices).toHaveLength(1);
	});

	it("prepares the same journal into the same order and the same measurement twice", async () => {
		const journal = new JournalFixture().user("hi").toolCall("c-1", "search").toolResult("c-1", "search", { hits: 1 });
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));

		const first = await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
			}),
		);
		const second = await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
			}),
		);

		expect(first.request.messages.map((message) => message.text)).toEqual(
			second.request.messages.map((message) => message.text),
		);
		expect(first.characters).toBe(second.characters);
	});

	it("compacts when the policy says so and records a checkpoint", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		const command = new PrepareContextCommand({
			context: runOf(journal),
			model: new StubModel(),
			tools: [],
			compaction: new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 2 }),
			lastPrompt: await measured(journal, 1200),
		});

		const uncompacted = await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
			}),
		);
		const prepared = await manager.prepare(command);

		expect(uncompacted.compacted).toBe(false);
		expect(prepared.compacted).toBe(true);
		expect(prepared.characters).toBeLessThan(uncompacted.characters);
		const checkpoint = await storage.findCheckpoint(ctxOf(journal));
		expect(checkpoint?.strategy).toBe("oldest-first");
		expect(checkpoint?.coveredRevision.value).toBe(20);
	});

	it("keeps the stable prefix digest identical across a compaction", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		const prompt = PromptInstructions.from("be brief");
		const plain = new PrepareContextCommand({
			context: runOf(journal),
			model: new StubModel(),
			tools: [],
			agentPrompt: prompt,
		});
		const compacting = new PrepareContextCommand({
			context: runOf(journal),
			model: new StubModel(),
			tools: [],
			agentPrompt: prompt,
			compaction: new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 2 }),
			lastPrompt: await measured(journal, 1200),
		});

		const before = await manager.prepare(plain);
		const after = await manager.prepare(compacting);

		expect(after.compacted).toBe(true);
		expect(before.prefixDigest.equals(after.prefixDigest)).toBe(true);
	});

	it("reuses a checkpoint instead of projecting the journal it covers", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		const command = new PrepareContextCommand({
			context: runOf(journal),
			model: new StubModel(),
			tools: [],
			compaction: new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 2 }),
			lastPrompt: await measured(journal, 1200),
		});

		const first = await manager.prepare(command);
		const second = await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
			}),
		);

		expect(second.compacted).toBe(false);
		expect(second.request.messages).toHaveLength(first.request.messages.length);
		expect(second.request.messages.length).toBeLessThan(journal.events.length);
	});

	it("discards a checkpoint whose prefix digest diverged, without failing the session", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
				tools: [],
				compaction: new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 2 }),
				lastPrompt: await measured(journal, 1200),
			}),
		);

		const prepared = await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
				tools: [],
				agentPrompt: PromptInstructions.from("new"),
			}),
		);

		expect(prepared.request.messages).toHaveLength(20);
	});

	it("discards a checkpoint written by a future strategy version", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello");
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const digest = new StablePrefixDigest().of(
			(
				await managerOf(storage).prepare(
					new PrepareContextCommand({
						context: runOf(journal),
						model: new StubModel(),
					}),
				)
			).projection,
		);
		await storage.saveCheckpoint(
			ctxOf(journal),
			new ContextCheckpoint(journal.sessionId, new SessionRevision(2), "oldest-first", 99, digest, []),
		);

		const prepared = await managerOf(storage).prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
			}),
		);

		expect(prepared.request.messages).toHaveLength(2);
	});

	it("discards a checkpoint written by another strategy", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello");
		const storage = await storageWith(journal, new InMemorySessionStorage());
		await storage.saveCheckpoint(
			ctxOf(journal),
			new ContextCheckpoint(
				journal.sessionId,
				new SessionRevision(2),
				"newest-first",
				1,
				new ContentDigest("sha256", "whatever"),
				[],
			),
		);

		const prepared = await managerOf(storage).prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
			}),
		);

		expect(prepared.request.messages).toHaveLength(2);
	});

	it("keeps the prepared context when the checkpoint cannot be written", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new UnwritableStorage());
		const manager = managerOf(storage);

		const prepared = await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
				tools: [],
				compaction: new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 2 }),
				lastPrompt: await measured(journal, 1200),
			}),
		);

		expect(prepared.compacted).toBe(true);
	});

	it("leaves the journal exactly as it was", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		const before = await collect(storage, journal);

		await manager.prepare(
			new PrepareContextCommand({
				context: runOf(journal),
				model: new StubModel(),
				tools: [],
				compaction: new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 2 }),
				lastPrompt: await measured(journal, 1200),
			}),
		);

		expect(await collect(storage, journal)).toEqual(before);
	});
});

async function collect(storage: SessionStorage, journal: JournalFixture): Promise<string[]> {
	const ids: string[] = [];
	for await (const stored of storage.readEvents(ctxOf(journal), SessionRevision.initial())) {
		ids.push(`${stored.revision.value}:${stored.event.id.value}`);
	}
	return ids;
}
