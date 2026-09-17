import { type Container, createContainer, defineModule } from "@wirely/core";
import { IdGenerator } from "../../common/identity/id-generator.contract";
import { Clock } from "../../common/time/clock.contract";
import { ModelResolver } from "../../contracts/model/model-resolver.contract";
import { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { SessionStorage } from "../../contracts/storage/session-storage.contract";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ArtifactOffloader } from "../artifact/artifact-offloader.service";
import { AttachmentReader } from "../artifact/attachment-reader.service";
import { AttachmentStore } from "../artifact/attachment-store.service";
import { ReadArtifactTool } from "../artifact/read-artifact.tool";
import { AgentCatalog } from "../catalog/agent-catalog.service";
import { ContextMeasurer } from "../context/context-measurer.service";
import { ContextProjector } from "../context/context-projector.service";
import { ContextWindowNotifier } from "../context/context-window-notifier.service";
import { ContextService } from "../context/context.service";
import { InspectContextBudgetUseCase } from "../context/inspect-context-budget.use-case";
import { OldestFirstCompactionStrategy } from "../context/oldest-first-compaction.strategy";
import { StablePrefixDigest } from "../context/stable-prefix-digest.service";
import { CostCalculator } from "../cost/cost-calculator.service";
import { RunCostReporter } from "../cost/run-cost-reporter.service";
import { DelegationRunner } from "../delegation/delegation-runner.service";
import { EventPublisher } from "../event/event-publisher.service";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker.service";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle.service";
import { CatalogModelResolver } from "../model/catalog-model-resolver.adapter";
import { ModelRunner } from "../model/model-runner.service";
import { AgentRunFactory } from "../run/agent-run.factory";
import { AgentRunner } from "../run/agent-runner.service";
import { RunEventFactory } from "../run/journal/run-event.factory";
import { RunJournal } from "../run/journal/run-journal.service";
import { RunScopeFactory } from "../run/scope/run-scope.factory";
import { SessionOpener } from "../run/session-opener.service";
import { RunResultFactory } from "../run/settle/run-result.factory";
import { RunSettler } from "../run/settle/run-settler.service";
import { ApprovalGate } from "../run/turn/approval-gate.service";
import { TurnExecutor } from "../run/turn/turn-executor.service";
import { TurnLoop } from "../run/turn/turn-loop.service";
import { AskAgentUseCase } from "../run/use-cases/ask-agent.use-case";
import { DecideApprovalUseCase } from "../run/use-cases/decide-approval.use-case";
import { DelegateAgentUseCase } from "../run/use-cases/delegate-agent.use-case";
import { ExplainAgentUseCase } from "../run/use-cases/explain-agent.use-case";
import { StreamAgentUseCase } from "../run/use-cases/stream-agent.use-case";
import { CreateSessionUseCase } from "../session/create-session.use-case";
import { InspectSessionUseCase } from "../session/inspect-session.use-case";
import { SessionRepository } from "../session/session-repository.service";
import { SessionService } from "../session/session.service";
import { ToolCatalog } from "../tool/tool-catalog.service";
import { ToolExecutor } from "../tool/tool-executor.service";
import { ToolGate } from "../tool/tool-gate.service";
import { TransferGate } from "../transfer/transfer-gate.service";
import { TransferSessionUseCase } from "../transfer/transfer-session.use-case";
import { RuntimeCompositionFailedError } from "./errors/runtime-composition-failed.error";
import { RuntimeServices } from "./runtime-services.value-object";
import { RuntimeOptions } from "./runtime.options";

/**
 * The only owner of the private container, and the only file that imports Wirely.
 *
 * Components the consumer declared arrive already built by NestJS and enter as
 * values: the container never resolves from NestJS, and nothing it exposes carries
 * a container type. Disposal is idempotent, so closing an application twice is safe.
 */
export class RuntimeFactory {
	private container?: Container;
	private disposed = false;

	public async create(
		catalog: AgentCatalog,
		storage: SessionStorage,
		artifacts: ArtifactStorage,
		clock: Clock,
		ids: IdGenerator,
		options: RuntimeOptions = new RuntimeOptions(),
		exposed: readonly ToolDefinition[] = [],
	): Promise<RuntimeServices> {
		const tracker = new ActiveRunTracker();
		const offloader = new ArtifactOffloader(artifacts, options.offload);
		const attachments = new AttachmentStore(artifacts);
		const readArtifact = ReadArtifactTool.forStorage(artifacts);
		const lifecycle = new RuntimeLifecycle(tracker, options.shutdown, clock);
		const resolver = options.models ?? new CatalogModelResolver();
		const measurer = new ContextMeasurer();
		const events = new EventPublisher(options.consumers, options.consumerNotices, undefined, undefined, options.redactor);
		const sessions = new SessionRepository(storage, undefined, events, undefined, options.snapshots);
		const context = new ContextService(
			storage,
			new ContextProjector(new AttachmentReader(artifacts, options.attachments)),
			measurer,
			new StablePrefixDigest(),
			options.compactionStrategy ?? new OldestFirstCompactionStrategy(measurer, options.summarizer),
			new ContextWindowNotifier(options.contextNotices),
		);
		const runs = new AgentRunFactory(ids, clock, tracker, lifecycle);
		const journal = new RunJournal(new RunEventFactory(ids, clock));
		const scopes = new RunScopeFactory([readArtifact], options.limits, options.compaction);
		const settler = new RunSettler(sessions, journal);
		const results = new RunResultFactory(
			new RunCostReporter(new CostCalculator(), options.pricing, options.pricingNotices),
		);
		const gate = new ToolGate(options.access);
		const turns = new TurnExecutor(new ToolExecutor(offloader, options.approvals, attachments, gate), journal);
		const delegations = new DelegationRunner(catalog, resolver, runs, scopes, journal, sessions);
		const loop = new TurnLoop(
			context,
			new ModelRunner(),
			sessions,
			journal,
			turns,
			new ApprovalGate(options.approvals),
			new TransferSessionUseCase(catalog, resolver, scopes),
			delegations,
		);
		// The one cycle in the graph: a loop runs turns, a turn delegates, a delegation runs turns.
		delegations.uses(loop);
		const asking = new AskAgentUseCase(
			catalog,
			resolver,
			new SessionOpener(sessions, clock),
			sessions,
			runs,
			scopes,
			journal,
			loop,
			settler,
			new TransferGate(catalog),
			ids,
			attachments,
			results,
			options.sources,
		);
		const runner = new AgentRunner(
			asking,
			new DecideApprovalUseCase(
				catalog,
				resolver,
				sessions,
				runs,
				scopes,
				journal,
				turns,
				loop,
				settler,
				results,
				options.sources,
			),
			new StreamAgentUseCase(asking),
			new ExplainAgentUseCase(asking),
			new DelegateAgentUseCase(catalog, resolver, sessions, runs, scopes, delegations, settler, results),
		);

		try {
			const container = createContainer(
				defineModule({
					providers: [
						{ provide: AgentCatalog, useValue: catalog },
						{ provide: SessionStorage, useValue: storage },
						{ provide: ArtifactStorage, useValue: artifacts },
						{ provide: ArtifactOffloader, useValue: offloader },
						{ provide: Clock, useValue: clock },
						{ provide: IdGenerator, useValue: ids },
						{ provide: ModelResolver, useValue: resolver },
						{ provide: ActiveRunTracker, useValue: tracker },
						{ provide: RuntimeLifecycle, useValue: lifecycle },
						{ provide: EventPublisher, useValue: events },
						{ provide: SessionRepository, useValue: sessions },
						{ provide: ContextService, useValue: context },
						{ provide: AgentRunFactory, useValue: runs },
						{ provide: AgentRunner, useValue: runner },
					],
					exports: [
						AgentCatalog,
						ModelResolver,
						SessionRepository,
						EventPublisher,
						ArtifactOffloader,
						AgentRunFactory,
						AgentRunner,
						RuntimeLifecycle,
						ActiveRunTracker,
					],
				}),
				{ name: "adk-runtime" },
			);
			await container.init();
			this.container = container;

			return new RuntimeServices(
				catalog,
				resolver,
				container.get(AgentRunner),
				this.buildSessionService(catalog, sessions, clock, ids, runs, journal, artifacts, context),
				container.get(AgentRunFactory),
				container.get(EventPublisher),
				container.get(ArtifactOffloader),
				readArtifact,
				lifecycle,
				tracker,
				options.limits,
				gate,
				new ToolCatalog(exposed),
			);
		} catch (cause) {
			throw new RuntimeCompositionFailedError(cause instanceof Error ? cause.message : String(cause), cause);
		}
	}

	/** The read half of sessions, which needs the catalog because a window belongs to a model. */
	private buildSessionService(
		catalog: AgentCatalog,
		sessions: SessionRepository,
		clock: Clock,
		ids: IdGenerator,
		runs: AgentRunFactory,
		journal: RunJournal,
		artifacts: ArtifactStorage,
		context: ContextService,
	): SessionService {
		const inspecting = new InspectSessionUseCase(sessions);
		return new SessionService(
			new CreateSessionUseCase(sessions, clock, ids, runs, journal),
			inspecting,
			sessions,
			new InspectContextBudgetUseCase(inspecting, catalog),
			artifacts,
			context,
		);
	}

	public async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		await this.container?.dispose();
	}
}
