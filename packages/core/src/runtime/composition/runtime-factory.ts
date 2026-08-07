import { type Container, createContainer, defineModule } from "@wirely/core";
import { IdGenerator } from "../../common/identity/id-generator";
import { Clock } from "../../common/time/clock";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import { ModelResolver } from "../../contracts/model-resolver";
import { SessionStorage } from "../../contracts/session-storage";
import { ArtifactOffloader } from "../artifact/artifact-offloader";
import { AttachmentReader } from "../artifact/attachment-reader";
import { AttachmentStore } from "../artifact/attachment-store";
import { ReadArtifactTool } from "../artifact/read-artifact-tool";
import { AgentCatalog } from "../catalog/agent-catalog";
import { ContextManager } from "../context/context-manager";
import { ContextMeasurer } from "../context/context-measurer";
import { ContextProjector } from "../context/context-projector";
import { ContextWindowNotifier } from "../context/context-window-notifier";
import { OldestFirstCompactionStrategy } from "../context/oldest-first-compaction-strategy";
import { StablePrefixDigest } from "../context/stable-prefix-digest";
import { CostCalculator } from "../cost/cost-calculator";
import { RunCostReporter } from "../cost/run-cost-reporter";
import { DelegationRunner } from "../delegation/delegation-runner";
import { EventPublisher } from "../event/event-publisher";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { CatalogModelResolver } from "../model/catalog-model-resolver";
import { ModelRunner } from "../model/model-runner";
import { AgentRunFactory } from "../run/agent-run-factory";
import { AgentRunner } from "../run/agent-runner";
import { ApprovalGate } from "../run/approval-gate";
import { AskAgent } from "../run/ask-agent";
import { DecideApproval } from "../run/decide-approval";
import { DelegateAgent } from "../run/delegate-agent";
import { ExplainAgent } from "../run/explain-agent";
import { RunEventFactory } from "../run/run-event-factory";
import { RunJournal } from "../run/run-journal";
import { RunResultFactory } from "../run/run-result-factory";
import { RunScopeFactory } from "../run/run-scope-factory";
import { RunSettler } from "../run/run-settler";
import { SessionOpener } from "../run/session-opener";
import { StreamAgent } from "../run/stream-agent";
import { TurnExecutor } from "../run/turn-executor";
import { TurnLoop } from "../run/turn-loop";
import { InspectSession } from "../session/inspect-session";
import { SessionManager } from "../session/session-manager";
import { ToolExecutor } from "../tool/tool-executor";
import { AgentSwitch } from "../transfer/agent-switch";
import { TransferGate } from "../transfer/transfer-gate";
import { RuntimeCompositionFailedError } from "./errors/runtime-composition-failed.error";
import { RuntimeOptions } from "./runtime-options";
import { RuntimeServices } from "./runtime-services";

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
	): Promise<RuntimeServices> {
		const tracker = new ActiveRunTracker();
		const offloader = new ArtifactOffloader(artifacts, options.offload);
		const attachments = new AttachmentStore(artifacts);
		const readArtifact = ReadArtifactTool.forStorage(artifacts);
		const lifecycle = new RuntimeLifecycle(tracker, options.shutdown, clock);
		const resolver = options.models ?? new CatalogModelResolver();
		const measurer = new ContextMeasurer();
		const events = new EventPublisher(options.consumers, options.consumerNotices);
		const sessions = new SessionManager(storage, undefined, events, undefined, options.snapshots);
		const context = new ContextManager(
			storage,
			new ContextProjector(new AttachmentReader(artifacts)),
			measurer,
			new StablePrefixDigest(),
			new OldestFirstCompactionStrategy(measurer, options.summarizer),
			new ContextWindowNotifier(options.contextNotices),
		);
		const runs = new AgentRunFactory(ids, clock, tracker, lifecycle);
		const journal = new RunJournal(new RunEventFactory(ids, clock));
		const scopes = new RunScopeFactory([readArtifact], options.limits, options.compaction);
		const settler = new RunSettler(sessions, journal);
		const results = new RunResultFactory(
			new RunCostReporter(new CostCalculator(), options.pricing, options.pricingNotices),
		);
		const turns = new TurnExecutor(new ToolExecutor(offloader, options.approvals, attachments), journal);
		const delegations = new DelegationRunner(catalog, resolver, runs, scopes, journal, sessions);
		const loop = new TurnLoop(
			context,
			new ModelRunner(),
			sessions,
			journal,
			turns,
			new ApprovalGate(options.approvals),
			new AgentSwitch(catalog, resolver, scopes),
			delegations,
		);
		// The one cycle in the graph: a loop runs turns, a turn delegates, a delegation runs turns.
		delegations.uses(loop);
		const asking = new AskAgent(
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
			new DecideApproval(
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
			new StreamAgent(asking),
			new ExplainAgent(asking),
			new DelegateAgent(catalog, resolver, sessions, runs, scopes, delegations, settler, results),
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
						{ provide: SessionManager, useValue: sessions },
						{ provide: ContextManager, useValue: context },
						{ provide: AgentRunFactory, useValue: runs },
						{ provide: AgentRunner, useValue: runner },
					],
					exports: [
						AgentCatalog,
						ModelResolver,
						SessionManager,
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
				new InspectSession(sessions),
				container.get(AgentRunFactory),
				container.get(EventPublisher),
				container.get(ArtifactOffloader),
				readArtifact,
				lifecycle,
				tracker,
				options.limits,
			);
		} catch (cause) {
			throw new RuntimeCompositionFailedError(cause instanceof Error ? cause.message : String(cause), cause);
		}
	}

	public async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		await this.container?.dispose();
	}
}
