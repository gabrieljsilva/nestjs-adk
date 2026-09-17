import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage.adapter";
import type { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { ModelResolver } from "../../contracts/model/model-resolver.contract";
import type { PricingNoticeSink } from "../../contracts/pricing/pricing-notice-sink.contract";
import type { PricingSource } from "../../contracts/pricing/pricing-source.contract";
import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies.value-object";
import type { AgentFailoverPolicy } from "../../domain/agent/agent-failover.policy";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../../domain/agent/declared-agent.value-object";
import type { SessionEvent } from "../../domain/event/session-event.event";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import { SessionContext } from "../../domain/run/session-context.value-object";
import type { SkillDefinition } from "../../domain/skill/skill-definition.value-object";
import { AdkApprovalPolicy } from "../../domain/tool/approval/adk-approval.policy";
import { EffectApprovalPolicy } from "../../domain/tool/approval/effect-approval.policy";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ArtifactOffloader } from "../../runtime/artifact/artifact-offloader.service";
import { AttachmentReader } from "../../runtime/artifact/attachment-reader.service";
import { AttachmentStore } from "../../runtime/artifact/attachment-store.service";
import { AgentCatalog } from "../../runtime/catalog/agent-catalog.service";
import { ContextMeasurer } from "../../runtime/context/context-measurer.service";
import { ContextProjector } from "../../runtime/context/context-projector.service";
import { ContextWindowNotifier } from "../../runtime/context/context-window-notifier.service";
import { ContextService } from "../../runtime/context/context.service";
import { OldestFirstCompactionStrategy } from "../../runtime/context/oldest-first-compaction.strategy";
import { StablePrefixDigest } from "../../runtime/context/stable-prefix-digest.service";
import { CostCalculator } from "../../runtime/cost/cost-calculator.service";
import { RunCostReporter } from "../../runtime/cost/run-cost-reporter.service";
import { DelegationRunner } from "../../runtime/delegation/delegation-runner.service";
import { ActiveRunTracker } from "../../runtime/lifecycle/active-run-tracker.service";
import { RuntimeLifecycle } from "../../runtime/lifecycle/runtime-lifecycle.service";
import { ShutdownOptions } from "../../runtime/lifecycle/shutdown.options";
import { ModelRunner } from "../../runtime/model/model-runner.service";
import { AgentRunFactory } from "../../runtime/run/agent-run.factory";
import { AgentRunner } from "../../runtime/run/agent-runner.service";
import { RunEventFactory } from "../../runtime/run/journal/run-event.factory";
import { RunJournal } from "../../runtime/run/journal/run-journal.service";
import { RunScopeFactory } from "../../runtime/run/scope/run-scope.factory";
import { SessionOpener } from "../../runtime/run/session-opener.service";
import { RunResultFactory } from "../../runtime/run/settle/run-result.factory";
import { RunSettler } from "../../runtime/run/settle/run-settler.service";
import { ApprovalGate } from "../../runtime/run/turn/approval-gate.service";
import { TurnExecutor } from "../../runtime/run/turn/turn-executor.service";
import { TurnLoop } from "../../runtime/run/turn/turn-loop.service";
import { AskAgentUseCase } from "../../runtime/run/use-cases/ask-agent.use-case";
import { DecideApprovalUseCase } from "../../runtime/run/use-cases/decide-approval.use-case";
import { DelegateAgentUseCase } from "../../runtime/run/use-cases/delegate-agent.use-case";
import { ExplainAgentUseCase } from "../../runtime/run/use-cases/explain-agent.use-case";
import { StreamAgentUseCase } from "../../runtime/run/use-cases/stream-agent.use-case";
import { SessionRepository } from "../../runtime/session/session-repository.service";
import { ToolExecutor } from "../../runtime/tool/tool-executor.service";
import { TransferGate } from "../../runtime/transfer/transfer-gate.service";
import { TransferSessionUseCase } from "../../runtime/transfer/transfer-session.use-case";
import { FakeClock } from "../fake-clock.double";
import { SequenceIdGenerator } from "../sequence-id-generator.double";

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
	public readonly sessions: SessionRepository;
	public readonly asking: AskAgentUseCase;
	public readonly deciding: DecideApprovalUseCase;
	public readonly runner: AgentRunner;

	public constructor(
		public readonly model: LlmModel,
		definition: AgentDefinition = NativeStackFixture.buildDefinition(model),
		approvals: AdkApprovalPolicy = EffectApprovalPolicy.never(),
		sources: readonly ToolSource[] = [],
		pricing?: PricingSource,
		pricingNotices?: PricingNoticeSink,
	) {
		this.sessions = new SessionRepository(this.storage);
		const measurer = new ContextMeasurer();
		const context = new ContextService(
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
		const catalog = new AgentCatalog([new DeclaredAgent(definition, "SupportAgent")]);
		const resolver = new FixedModelResolver(model);
		const scopes = new RunScopeFactory();
		const settler = new RunSettler(this.sessions, journal);
		const results = new RunResultFactory(new RunCostReporter(new CostCalculator(), pricing, pricingNotices));
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
			new TransferSessionUseCase(catalog, resolver, scopes),
			delegations,
		);
		delegations.uses(loop);

		this.asking = new AskAgentUseCase(
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
			results,
			sources,
		);
		this.deciding = new DecideApprovalUseCase(
			catalog,
			resolver,
			this.sessions,
			runs,
			scopes,
			journal,
			executor,
			loop,
			settler,
			results,
			sources,
		);
		this.runner = new AgentRunner(
			this.asking,
			this.deciding,
			new StreamAgentUseCase(this.asking),
			new ExplainAgentUseCase(this.asking),
			new DelegateAgentUseCase(catalog, resolver, this.sessions, runs, scopes, delegations, settler, results),
		);
	}

	public static buildDefinition(
		model: LlmModel,
		failover?: AgentFailoverPolicy,
		tools: readonly ToolDefinition[] = [],
		skills: readonly SkillDefinition[] = [],
	): AgentDefinition {
		return new AgentDefinition(
			NativeStackFixture.AGENT,
			AgentDescription.from("Support agent", NativeStackFixture.AGENT.value),
			model,
			undefined,
			new AgentExecutionPolicies(failover),
			tools,
			skills,
		);
	}

	public async readJournal(sessionId: SessionId): Promise<SessionEvent[]> {
		const events: SessionEvent[] = [];
		for await (const stored of this.storage.readEvents(
			SessionContext.fromSessionId(sessionId),
			SessionRevision.initial(),
		)) {
			events.push(stored.event);
		}
		return events;
	}
}
