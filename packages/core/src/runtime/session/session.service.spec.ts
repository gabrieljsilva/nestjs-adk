import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage.adapter";
import { SessionId } from "../../common/identity/session-id.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../../domain/agent/agent-description.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../../domain/agent/declared-agent.value-object";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { CreateSessionInput } from "../../domain/session/input/create-session-input.command";
import { FakeClock } from "../../support/fake-clock.double";
import { StubModel } from "../../support/model/stub-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { AttachmentReader } from "../artifact/attachment-reader.service";
import { AgentCatalog } from "../catalog/agent-catalog.service";
import { ContextManager } from "../context/context-manager.service";
import { ContextMeasurer } from "../context/context-measurer.service";
import { ContextProjector } from "../context/context-projector.service";
import { ContextWindowNotifier } from "../context/context-window-notifier.service";
import { InspectContextBudget } from "../context/inspect-context-budget.use-case";
import { OldestFirstCompactionStrategy } from "../context/oldest-first-compaction.strategy";
import { StablePrefixDigest } from "../context/stable-prefix-digest.service";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker.service";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle.service";
import { ShutdownOptions } from "../lifecycle/shutdown.options";
import { AgentRunFactory } from "../run/agent-run.factory";
import { RunEventFactory } from "../run/journal/run-event.factory";
import { RunJournal } from "../run/journal/run-journal.service";
import { CreateSession } from "./create-session.use-case";
import { InspectSession } from "./inspect-session.use-case";
import { SessionManager } from "./session-manager.service";
import { SessionService } from "./session.service";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const MISSING = SessionId.from("nobody");

function catalogOf(): AgentCatalog {
	const definition = AgentDefinition.of(
		SUPPORT,
		AgentDescription.from("answers customers", "support"),
		new StubModel(ModelContextWindow.of(1000, 200)),
	);
	return AgentCatalog.of([new DeclaredAgent(definition, "SupportAgent")]);
}

function serviceOf(
	storage: InMemorySessionStorage = new InMemorySessionStorage(),
	onForget: (context: SessionContext) => void = () => undefined,
): SessionService {
	const sessions = new SessionManager(storage);
	const artifacts = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	const projector = new WatchingProjector(new AttachmentReader(artifacts), onForget);
	const inspecting = new InspectSession(sessions);
	const clock = new FakeClock(NOW);
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	return new SessionService(
		new CreateSession(
			sessions,
			clock,
			new SequenceIdGenerator("s"),
			new AgentRunFactory(new SequenceIdGenerator("run"), clock, tracker, lifecycle),
			new RunJournal(new RunEventFactory(new SequenceIdGenerator("e"), clock)),
		),
		inspecting,
		sessions,
		new InspectContextBudget(inspecting, catalogOf()),
		artifacts,
		new ContextManager(
			storage,
			projector,
			new ContextMeasurer(),
			new StablePrefixDigest(),
			new OldestFirstCompactionStrategy(new ContextMeasurer()),
			new ContextWindowNotifier(),
		),
	);
}

/** The cache itself is proved in its own spec; here what matters is that it was told. */
class WatchingProjector extends ContextProjector {
	public constructor(
		attachments: AttachmentReader,
		private readonly onForget: (context: SessionContext) => void,
	) {
		super(attachments);
	}

	public override forgetAttachments(context: SessionContext): void {
		this.onForget(context);
		super.forgetAttachments(context);
	}
}

describe("SessionService", () => {
	it("opens a conversation under the identifier it was given", async () => {
		const service = serviceOf();

		const session = await service.create(SUPPORT, CreateSessionInput.fromOptions("chat-42"));

		expect(session.id.value).toBe("chat-42");
		expect(session.rootAgent.equals(SUPPORT)).toBe(true);
	});

	it("finds a conversation by identifier, reading only its head", async () => {
		const service = serviceOf();
		await service.create(SUPPORT, CreateSessionInput.fromOptions("chat-42"));

		const found = await service.find(SessionId.from("chat-42"));

		expect(found?.rootAgent.equals(SUPPORT)).toBe(true);
	});

	it("answers nothing for an identifier no conversation uses", async () => {
		expect(await serviceOf().find(MISSING)).toBeUndefined();
	});

	it("refuses an identifier no conversation uses when the caller demands one", async () => {
		const error = await serviceOf()
			.findOrFail(MISSING)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(SessionNotFoundError);
	});

	it("inspects a conversation that was opened and never asked anything", async () => {
		const service = serviceOf();
		await service.create(SUPPORT, CreateSessionInput.fromOptions("chat-42"));

		const inspection = await service.inspect(SessionId.from("chat-42"));

		expect(inspection.activeAgent.equals(SUPPORT)).toBe(true);
		expect(inspection.isAwaitingApproval).toBe(false);
	});

	it("answers the window of the agent for a conversation nobody has asked anything in", async () => {
		const service = serviceOf();
		await service.create(SUPPORT, CreateSessionInput.fromOptions("chat-42"));

		const budget = await service.budget(SUPPORT, SessionId.from("chat-42"));

		expect(budget.window.inputCapacity).toBe(800);
		expect(budget.isMeasured).toBe(false);
	});

	it("deletes the journal of a conversation, so nothing answers for it afterwards", async () => {
		const service = serviceOf();
		await service.create(SUPPORT, CreateSessionInput.fromOptions("chat-42"));

		await service.delete(SessionId.from("chat-42"));

		expect(await service.find(SessionId.from("chat-42"))).toBeUndefined();
	});

	/** The cache is keyed by session and id, so a delete nobody told it about outlives the session. */
	it("tells the attachment cache to let go of what it was holding for the conversation", async () => {
		const forgotten: string[] = [];
		const service = serviceOf(new InMemorySessionStorage(), (context) => forgotten.push(context.sessionId.value));
		await service.create(SUPPORT, CreateSessionInput.fromOptions("chat-42"));

		await service.delete(SessionId.from("chat-42"));

		expect(forgotten).toEqual(["chat-42"]);
	});
});
