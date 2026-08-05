import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import type { AppendEventsCommand } from "../../contracts/append-events-command";
import type { AppendEventsResult } from "../../contracts/append-events-result";
import { AgentRunFailed } from "../../domain/event/catalog/agent-run-failed";
import { Session } from "../../domain/session/session";
import { SessionMode } from "../../domain/session/session-mode";
import { SessionState } from "../../domain/session/session-state";
import { FakeClock } from "../../support/fake-clock";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { SessionManager } from "../session/session-manager";
import { AgentRunFactory } from "./agent-run-factory";
import { RunEventFactory } from "./run-event-factory";
import { RunJournal } from "./run-journal";
import { RunSettler } from "./run-settler";
import type { StartedRun } from "./started-run";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SESSION = SessionId.from("s-1");
const clock = new FakeClock(NOW);

/** Refuses an append against a stale revision, which is what losing a race looks like. */
class ConflictingStorage extends InMemorySessionStorage {
	public attempts = 0;

	public async append(command: AppendEventsCommand): Promise<AppendEventsResult> {
		this.attempts += 1;
		if (this.attempts === 1) throw new Error("the journal lost the race");
		return super.append(command);
	}
}

/** Takes nothing at all, which is a journal that is simply gone. */
class RefusingStorage extends InMemorySessionStorage {
	public async append(): Promise<AppendEventsResult> {
		throw new Error("the journal is unavailable");
	}
}

function startedRun(): StartedRun {
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	return new AgentRunFactory(new SequenceIdGenerator("run"), clock, tracker, lifecycle).start(
		SESSION,
		NativeStackFixture.AGENT,
	);
}

function settlerOf(storage: InMemorySessionStorage): RunSettler {
	const journal = new RunJournal(new RunEventFactory(new SequenceIdGenerator("e"), clock));
	return new RunSettler(new SessionManager(storage), journal);
}

async function sessionIn(storage: InMemorySessionStorage): Promise<void> {
	await storage.create(Session.start(SESSION, NativeStackFixture.AGENT, SessionMode.EPHEMERAL, NOW));
}

async function typesIn(storage: InMemorySessionStorage): Promise<string[]> {
	const types: string[] = [];
	for await (const stored of storage.readEvents(SESSION, SessionRevision.initial())) types.push(stored.event.type);
	return types;
}

describe("RunSettler", () => {
	it("records how the run ended", async () => {
		const storage = new InMemorySessionStorage();
		await sessionIn(storage);

		await settlerOf(storage).settle(SESSION, SessionState.initial(), startedRun(), new Error("something broke"));

		expect(await typesIn(storage)).toEqual([AgentRunFailed.TYPE]);
	});

	it("writes the ending again against the head, when the revision it held was already behind", async () => {
		const storage = new ConflictingStorage();
		await sessionIn(storage);

		await settlerOf(storage).settle(SESSION, SessionState.initial(), startedRun(), new Error("something broke"));

		expect(storage.attempts).toBe(2);
		expect(await typesIn(storage)).toEqual([AgentRunFailed.TYPE]);
	});

	it("never throws over a journal that will not take the ending, since the run already failed", async () => {
		const storage = new RefusingStorage();
		await sessionIn(storage);

		await expect(
			settlerOf(storage).settle(SESSION, SessionState.initial(), startedRun(), new Error("something broke")),
		).resolves.toBeUndefined();
	});
});
