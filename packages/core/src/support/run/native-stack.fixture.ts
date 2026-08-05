import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import type { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { ModelResolver } from "../../contracts/model-resolver";
import type { ToolSource } from "../../contracts/tool-source";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies";
import type { AgentFailoverPolicy } from "../../domain/agent/agent-failover-policy";
import { AgentName } from "../../domain/agent/agent-name";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import type { SessionEvent } from "../../domain/event/session-event";
import type { LlmModel } from "../../domain/model/llm-model";
import type { SkillDefinition } from "../../domain/skill/skill-definition";
import { AdkApprovalPolicy } from "../../domain/tool/adk-approval-policy";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import { ArtifactOffloader } from "../../runtime/artifact/artifact-offloader";
import { AttachmentReader } from "../../runtime/artifact/attachment-reader";
import { AttachmentStore } from "../../runtime/artifact/attachment-store";
import { AgentCatalog } from "../../runtime/catalog/agent-catalog";
import { ContextManager } from "../../runtime/context/context-manager";
import { ContextMeasurer } from "../../runtime/context/context-measurer";
import { ContextProjector } from "../../runtime/context/context-projector";
import { ContextWindowNotifier } from "../../runtime/context/context-window-notifier";
import { OldestFirstCompactionStrategy } from "../../runtime/context/oldest-first-compaction-strategy";
import { StablePrefixDigest } from "../../runtime/context/stable-prefix-digest";
import { DelegationRunner } from "../../runtime/delegation/delegation-runner";
import { ActiveRunTracker } from "../../runtime/lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../../runtime/lifecycle/runtime-lifecycle";
import { ShutdownOptions } from "../../runtime/lifecycle/shutdown-options";
import { ModelRunner } from "../../runtime/model/model-runner";
import { AgentRunFactory } from "../../runtime/run/agent-run-factory";
import { AgentRunner } from "../../runtime/run/agent-runner";
import { ApprovalGate } from "../../runtime/run/approval-gate";
import { AskAgent } from "../../runtime/run/ask-agent";
import { DecideApproval } from "../../runtime/run/decide-approval";
import { DelegateAgent } from "../../runtime/run/delegate-agent";
import { ExplainAgent } from "../../runtime/run/explain-agent";
import { RunEventFactory } from "../../runtime/run/run-event-factory";
import { RunJournal } from "../../runtime/run/run-journal";
import { RunScopeFactory } from "../../runtime/run/run-scope-factory";
import { RunSettler } from "../../runtime/run/run-settler";
import { SessionOpener } from "../../runtime/run/session-opener";
import { StreamAgent } from "../../runtime/run/stream-agent";
import { TurnExecutor } from "../../runtime/run/turn-executor";
import { TurnLoop } from "../../runtime/run/turn-loop";
import { SessionManager } from "../../runtime/session/session-manager";
import { ToolExecutor } from "../../runtime/tool/tool-executor";
import { AgentSwitch } from "../../runtime/transfer/agent-switch";
import { TransferGate } from "../../runtime/transfer/transfer-gate";
import { FakeClock } from "../fake-clock";
import { SequenceIdGenerator } from "../sequence-id-generator";

const START = Instant.fromIso("2026-01-01T00:00:00.000Z");

class FixedModelResolver extends ModelResolver {
	public constructor(private readonly model: LlmModel) {
		super();
	}

	public resolve(): LlmModel {
		return this.model;
	}
}

/**
 * The whole native stack over one in memory journal, wired the way the composition wires it.
 *
 * A test that builds the pieces itself proves the pieces and not the assembly, and the
 * assembly is where an ordering mistake actually lives. This is one place to change when
 * the composition changes, instead of one per suite.
 */
export class NativeStackFixture {
	public static readonly AGENT = AgentName.from("support");

	public readonly storage = new InMemorySessionStorage();
	public readonly artifacts = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	public readonly clock = new FakeClock(START);
	public readonly ids = new SequenceIdGenerator("id");
	public readonly tracker = new ActiveRunTracker();
	public readonly sessions: SessionManager;
	public readonly asking: AskAgent;
	public readonly deciding: DecideApproval;
	public readonly runner: AgentRunner;

	public constructor(
		public readonly model: LlmModel,
		definition: AgentDefinition = NativeStackFixture.definitionOf(model),
		approvals: AdkApprovalPolicy = EffectApprovalPolicy.never(),
		sources: readonly ToolSource[] = [],
	) {
		this.sessions = new SessionManager(this.storage);
		const measurer = new ContextMeasurer();
		const context = new ContextManager(
			this.storage,
			new ContextProjector(new AttachmentReader(this.artifacts)),
			measurer,
			new StablePrefixDigest(),
			new OldestFirstCompactionStrategy(measurer),
			new ContextWindowNotifier(),
		);
		const lifecycle = new RuntimeLifecycle(this.tracker, ShutdownOptions.waitIndefinitely(), this.clock);
		const runs = new AgentRunFactory(this.ids, this.clock, this.tracker, lifecycle);
		const journal = new RunJournal(new RunEventFactory(this.ids, this.clock));
		const catalog = AgentCatalog.of([new DeclaredAgent(definition, "SupportAgent")]);
		const resolver = new FixedModelResolver(model);
		const scopes = new RunScopeFactory();
		const settler = new RunSettler(this.sessions, journal);
		const executor = new TurnExecutor(
			new ToolExecutor(new ArtifactOffloader(this.artifacts), approvals, new AttachmentStore(this.artifacts)),
			journal,
		);
		const delegations = new DelegationRunner(catalog, resolver, runs, scopes, journal, this.sessions);
		const loop = new TurnLoop(
			context,
			new ModelRunner(),
			this.sessions,
			journal,
			executor,
			new ApprovalGate(approvals),
			new AgentSwitch(catalog, resolver, scopes),
			delegations,
		);
		delegations.uses(loop);

		this.asking = new AskAgent(
			catalog,
			resolver,
			new SessionOpener(this.sessions, this.clock),
			this.sessions,
			runs,
			scopes,
			journal,
			loop,
			settler,
			new TransferGate(catalog),
			this.ids,
			new AttachmentStore(this.artifacts),
			sources,
		);
		this.deciding = new DecideApproval(
			catalog,
			resolver,
			this.sessions,
			runs,
			scopes,
			journal,
			executor,
			loop,
			settler,
			sources,
		);
		this.runner = new AgentRunner(
			this.asking,
			this.deciding,
			new StreamAgent(this.asking),
			new ExplainAgent(this.asking),
			new DelegateAgent(catalog, resolver, this.sessions, runs, scopes, delegations, settler),
		);
	}

	public static definitionOf(
		model: LlmModel,
		failover?: AgentFailoverPolicy,
		tools: readonly ToolDefinition[] = [],
		skills: readonly SkillDefinition[] = [],
	): AgentDefinition {
		return AgentDefinition.of(
			NativeStackFixture.AGENT,
			AgentDescription.from("Support agent", NativeStackFixture.AGENT.value),
			model,
			undefined,
			AgentExecutionPolicies.of(failover),
			tools,
			skills,
		);
	}

	public async journalOf(sessionId: SessionId): Promise<SessionEvent[]> {
		const events: SessionEvent[] = [];
		for await (const stored of this.storage.readEvents(sessionId, SessionRevision.initial())) {
			events.push(stored.event);
		}
		return events;
	}
}
