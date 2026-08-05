import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { ContentDigest } from "../../common/digest/content-digest";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { AppendEventsCommand } from "../../contracts/append-events-command";
import { ContextNoticeSink } from "../../contracts/context-notice-sink";
import type { SessionStorage } from "../../contracts/session-storage";
import { AgentName } from "../../domain/agent/agent-name";
import { ContextCategory } from "../../domain/context/context-category";
import { ContextCheckpoint } from "../../domain/context/context-checkpoint";
import { ContextComposition } from "../../domain/context/context-composition";
import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown";
import { ContextBudgetExceededError } from "../../domain/context/errors/context-budget-exceeded.error";
import { TokenThresholdCompactionPolicy } from "../../domain/context/token-threshold-compaction-policy";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import { ToolDeclaration } from "../../domain/model/tool-declaration";
import { UnknownContextWindow } from "../../domain/model/unknown-context-window";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { Session } from "../../domain/session/session";
import { SessionMode } from "../../domain/session/session-mode";
import { JournalFixture } from "../../support/context/journal.fixture";
import { StubModel } from "../../support/model/stub-model.fixture";
import { ContextManager } from "./context-manager";
import { ContextMeasurer } from "./context-measurer";
import { ContextProjector } from "./context-projector";
import { ContextWindowNotifier } from "./context-window-notifier";
import { OldestFirstCompactionStrategy } from "./oldest-first-compaction-strategy";
import { PrepareContextCommand } from "./prepare-context-command";
import { StablePrefixDigest } from "./stable-prefix-digest";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const measurer = new ContextMeasurer();

class RecordingSink extends ContextNoticeSink {
	public readonly notices: ContextWindowUnknown[] = [];

	public report(notice: ContextWindowUnknown): void {
		this.notices.push(notice);
	}
}

class UnwritableStorage extends InMemorySessionStorage {
	public override async saveCheckpoint(): Promise<void> {
		throw new Error("the checkpoint collection is unavailable");
	}
}

function managerOf(storage: SessionStorage, notifier = new ContextWindowNotifier()): ContextManager {
	return new ContextManager(
		storage,
		new ContextProjector(),
		measurer,
		new StablePrefixDigest(),
		new OldestFirstCompactionStrategy(measurer),
		notifier,
	);
}

async function storageWith(journal: JournalFixture, storage: InMemorySessionStorage): Promise<InMemorySessionStorage> {
	await storage.create(Session.start(journal.sessionId, AgentName.from("support"), SessionMode.EPHEMERAL, NOW));
	await storage.append(
		new AppendEventsCommand(
			journal.sessionId,
			SessionRevision.initial(),
			SessionEventBatch.of(journal.events.map((stored) => stored.event)),
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

describe("ContextManager", () => {
	it("prepares the conversation the journal recorded", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello");
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));

		const prepared = await manager.prepare(new PrepareContextCommand(journal.sessionId, new StubModel()));

		expect(prepared.request.messages.map((message) => message.text)).toEqual(["hi", "hello"]);
		expect(prepared.compacted).toBe(false);
		expect(prepared.coveredRevision.value).toBe(2);
	});

	it("measures the composition of the prompt, in shares and without a size", async () => {
		const journal = new JournalFixture().user("hi");
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));
		const command = new PrepareContextCommand(
			journal.sessionId,
			new StubModel(),
			[new ToolDeclaration("search", "finds things", {})],
			PromptInstructions.from("be brief"),
		);

		const prepared = await manager.prepare(command);

		expect(prepared.composition.shareOf(ContextCategory.RUNTIME_INSTRUCTIONS)).toBeGreaterThan(0);
		expect(prepared.composition.shareOf(ContextCategory.TOOL_DESCRIPTIONS)).toBeGreaterThan(0);
		expect(prepared.composition.shareOf(ContextCategory.CONVERSATION)).toBeGreaterThan(0);
		expect(prepared.budget.isMeasured).toBe(false);
		expect(prepared.budget.projectedFreeTokens).toBeUndefined();
	});

	it("refuses a context a measured usage proves the window cannot hold", async () => {
		const journal = conversationOf(10);
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));
		const model = new StubModel(ModelContextWindow.of(1000, 200));
		const command = new PrepareContextCommand(
			journal.sessionId,
			model,
			[],
			undefined,
			undefined,
			undefined,
			ModelUsage.of(900, 10),
		);

		await expect(manager.prepare(command)).rejects.toBeInstanceOf(ContextBudgetExceededError);
	});

	it("refuses nothing while no call has been measured, and lets the provider answer", async () => {
		const journal = conversationOf(10);
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));
		const model = new StubModel(ModelContextWindow.of(30, 10));

		const prepared = await manager.prepare(new PrepareContextCommand(journal.sessionId, model));

		expect(prepared.budget.isMeasured).toBe(false);
	});

	it("reports how much of a known window is still free, once a call was measured", async () => {
		const journal = new JournalFixture().user("hi");
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));
		const command = new PrepareContextCommand(
			journal.sessionId,
			new StubModel(ModelContextWindow.of(1000, 200)),
			[],
			undefined,
			undefined,
			undefined,
			ModelUsage.of(300, 40),
		);

		const prepared = await manager.prepare(command);

		expect(prepared.budget.projectedFreeTokens).toBe(500);
		expect(prepared.budget.projectedFreeShare).toBeCloseTo(0.625, 5);
	});

	it("accepts the same context against an unknown window and reports it once", async () => {
		const journal = conversationOf(10);
		const sink = new RecordingSink();
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()), new ContextWindowNotifier(sink));
		const model = new StubModel(new UnknownContextWindow(), ModelIdentity.of("acme", "windowless"));

		await manager.prepare(new PrepareContextCommand(journal.sessionId, model));
		await manager.prepare(new PrepareContextCommand(journal.sessionId, model));

		expect(sink.notices).toHaveLength(1);
	});

	it("prepares the same journal into the same order and the same measurement twice", async () => {
		const journal = new JournalFixture().user("hi").toolCall("c-1", "search").toolResult("c-1", "search", { hits: 1 });
		const manager = managerOf(await storageWith(journal, new InMemorySessionStorage()));

		const first = await manager.prepare(new PrepareContextCommand(journal.sessionId, new StubModel()));
		const second = await manager.prepare(new PrepareContextCommand(journal.sessionId, new StubModel()));

		expect(first.request.messages.map((message) => message.text)).toEqual(
			second.request.messages.map((message) => message.text),
		);
		expect(first.composition.characters).toBe(second.composition.characters);
	});

	it("compacts when the policy says so and records a checkpoint", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		const command = new PrepareContextCommand(
			journal.sessionId,
			new StubModel(),
			[],
			undefined,
			undefined,
			new TokenThresholdCompactionPolicy(1000, 400, 2),
			ModelUsage.of(1200, 50),
		);

		const uncompacted = await manager.prepare(new PrepareContextCommand(journal.sessionId, new StubModel()));
		const prepared = await manager.prepare(command);

		expect(uncompacted.compacted).toBe(false);
		expect(prepared.compacted).toBe(true);
		expect(prepared.composition.characters).toBeLessThan(uncompacted.composition.characters);
		const checkpoint = await storage.findCheckpoint(journal.sessionId);
		expect(checkpoint?.strategy).toBe("oldest-first");
		expect(checkpoint?.coveredRevision.value).toBe(20);
	});

	it("keeps the stable prefix digest identical across a compaction", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		const prompt = PromptInstructions.from("be brief");
		const plain = new PrepareContextCommand(journal.sessionId, new StubModel(), [], undefined, prompt);
		const compacting = new PrepareContextCommand(
			journal.sessionId,
			new StubModel(),
			[],
			undefined,
			prompt,
			new TokenThresholdCompactionPolicy(1000, 400, 2),
			ModelUsage.of(1200, 50),
		);

		const before = await manager.prepare(plain);
		const after = await manager.prepare(compacting);

		expect(after.compacted).toBe(true);
		expect(before.prefixDigest.equals(after.prefixDigest)).toBe(true);
	});

	it("reuses a checkpoint instead of projecting the journal it covers", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		const command = new PrepareContextCommand(
			journal.sessionId,
			new StubModel(),
			[],
			undefined,
			undefined,
			new TokenThresholdCompactionPolicy(1000, 400, 2),
			ModelUsage.of(1200, 50),
		);

		const first = await manager.prepare(command);
		const second = await manager.prepare(new PrepareContextCommand(journal.sessionId, new StubModel()));

		expect(second.compacted).toBe(false);
		expect(second.request.messages).toHaveLength(first.request.messages.length);
		expect(second.request.messages.length).toBeLessThan(journal.events.length);
	});

	it("discards a checkpoint whose prefix digest diverged, without failing the session", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		await manager.prepare(
			new PrepareContextCommand(
				journal.sessionId,
				new StubModel(),
				[],
				undefined,
				undefined,
				new TokenThresholdCompactionPolicy(1000, 400, 2),
				ModelUsage.of(1200, 50),
			),
		);

		const prepared = await manager.prepare(
			new PrepareContextCommand(journal.sessionId, new StubModel(), [], undefined, PromptInstructions.from("new")),
		);

		expect(prepared.request.messages).toHaveLength(20);
	});

	it("discards a checkpoint written by a future strategy version", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello");
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const digest = new StablePrefixDigest().of(
			(await managerOf(storage).prepare(new PrepareContextCommand(journal.sessionId, new StubModel()))).projection,
		);
		await storage.saveCheckpoint(
			new ContextCheckpoint(
				journal.sessionId,
				SessionRevision.of(2),
				"oldest-first",
				99,
				digest,
				[],
				ContextComposition.empty(),
			),
		);

		const prepared = await managerOf(storage).prepare(new PrepareContextCommand(journal.sessionId, new StubModel()));

		expect(prepared.request.messages).toHaveLength(2);
	});

	it("discards a checkpoint written by another strategy", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello");
		const storage = await storageWith(journal, new InMemorySessionStorage());
		await storage.saveCheckpoint(
			new ContextCheckpoint(
				journal.sessionId,
				SessionRevision.of(2),
				"newest-first",
				1,
				ContentDigest.of("sha256", "whatever"),
				[],
				ContextComposition.empty(),
			),
		);

		const prepared = await managerOf(storage).prepare(new PrepareContextCommand(journal.sessionId, new StubModel()));

		expect(prepared.request.messages).toHaveLength(2);
	});

	it("keeps the prepared context when the checkpoint cannot be written", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new UnwritableStorage());
		const manager = managerOf(storage);

		const prepared = await manager.prepare(
			new PrepareContextCommand(
				journal.sessionId,
				new StubModel(),
				[],
				undefined,
				undefined,
				new TokenThresholdCompactionPolicy(1000, 400, 2),
				ModelUsage.of(1200, 50),
			),
		);

		expect(prepared.compacted).toBe(true);
	});

	it("leaves the journal exactly as it was", async () => {
		const journal = conversationOf(10);
		const storage = await storageWith(journal, new InMemorySessionStorage());
		const manager = managerOf(storage);
		const before = await collect(storage, journal);

		await manager.prepare(
			new PrepareContextCommand(
				journal.sessionId,
				new StubModel(),
				[],
				undefined,
				undefined,
				new TokenThresholdCompactionPolicy(1000, 400, 2),
				ModelUsage.of(1200, 50),
			),
		);

		expect(await collect(storage, journal)).toEqual(before);
	});
});

async function collect(storage: SessionStorage, journal: JournalFixture): Promise<string[]> {
	const ids: string[] = [];
	for await (const stored of storage.readEvents(journal.sessionId, SessionRevision.initial())) {
		ids.push(`${stored.revision.value}:${stored.event.id.value}`);
	}
	return ids;
}
