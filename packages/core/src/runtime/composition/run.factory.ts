import type { IdGenerator } from "../../common/identity/id-generator.contract";
import type { Clock } from "../../common/time/clock.contract";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../../contracts/storage/session-storage.contract";
import { ArtifactOffloader } from "../artifact/artifact-offloader.service";
import { AttachmentStore } from "../artifact/attachment-store.service";
import { ReadArtifactTool } from "../artifact/read-artifact.tool";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import type { ContextService } from "../context/context.service";
import { CostCalculator } from "../cost/cost-calculator.service";
import { RunCostReporter } from "../cost/run-cost-reporter.service";
import { DelegationRunner } from "../delegation/delegation-runner.service";
import { EventPublisher } from "../event/event-publisher.service";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker.service";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle.service";
import { CatalogModelResolver } from "../model/catalog-model-resolver.adapter";
import { ModelService } from "../model/model.service";
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
import { SessionRepository } from "../session/session-repository.service";
import { ToolExecutor } from "../tool/tool-executor.service";
import { ToolGate } from "../tool/tool-gate.service";
import { ToolService } from "../tool/tool.service";
import { TransferGate } from "../transfer/transfer-gate.service";
import { TransferSessionUseCase } from "../transfer/transfer-session.use-case";
import { ComposedRun } from "./composed-run.value-object";
import type { RuntimeOptions } from "./runtime.options";

/**
 * Builds everything a command touches: the journal it writes, the loop it runs and the
 * four use cases a caller can reach.
 *
 * It is one file rather than four because the pieces are one graph, and the graph has a
 * cycle in it that nothing can break by ordering alone.
 */
export class RunComposer {
	public compose(
		catalog: AgentCatalog,
		storage: SessionStorage,
		artifacts: ArtifactStorage,
		clock: Clock,
		ids: IdGenerator,
		context: ContextService,
		options: RuntimeOptions,
	): ComposedRun {
		const tracker = new ActiveRunTracker();
		const lifecycle = new RuntimeLifecycle(tracker, options.shutdown, clock);
		const offloader = new ArtifactOffloader(artifacts, options.offload);
		const attachments = new AttachmentStore(artifacts);
		const readArtifact = ReadArtifactTool.forStorage(artifacts);
		const models = new ModelService(options.models ?? new CatalogModelResolver());
		const events = new EventPublisher(options.consumers, options.consumerNotices, undefined, undefined, options.redactor);
		const sessions = new SessionRepository(storage, undefined, events, undefined, options.snapshots);
		const runs = new AgentRunFactory(ids, clock, tracker, lifecycle);
		const journal = new RunJournal(new RunEventFactory(ids, clock));
		const scopes = new RunScopeFactory([readArtifact], options.limits, options.compaction);
		const settler = new RunSettler(sessions, journal);
		const results = new RunResultFactory(
			new RunCostReporter(new CostCalculator(), options.pricing, options.pricingNotices),
		);
		const gate = new ToolGate(options.access);
		const tools = new ToolService(sessions, journal, options.sources);
		const turns = new TurnExecutor(new ToolExecutor(offloader, options.approvals, attachments, gate), journal);
		const delegations = new DelegationRunner(catalog, models, runs, scopes, journal, sessions);
		const loop = new TurnLoop(
			context,
			models,
			sessions,
			journal,
			turns,
			new ApprovalGate(options.approvals),
			new TransferSessionUseCase(catalog, models, scopes),
			delegations,
		);
		// The one cycle in the graph: a loop runs turns, a turn delegates, a delegation runs turns.
		// See `.knowledge/agent-delegation.md`; no construction order breaks it, so it is bound here
		// rather than implied by a constructor that could never be satisfied.
		delegations.uses(loop);

		const asking = new AskAgentUseCase(
			new SessionOpener(sessions, clock, catalog, ids),
			models,
			sessions,
			runs,
			scopes,
			journal,
			loop,
			settler,
			new TransferGate(catalog),
			attachments,
			results,
			tools,
		);
		const runner = new AgentRunner(
			asking,
			new DecideApprovalUseCase(catalog, models, sessions, runs, scopes, journal, turns, loop, settler, results, tools),
			new StreamAgentUseCase(asking),
			new ExplainAgentUseCase(asking),
			new DelegateAgentUseCase(catalog, models, sessions, runs, scopes, delegations, settler, results),
		);

		return new ComposedRun(
			runner,
			runs,
			journal,
			sessions,
			events,
			models.resolver,
			tracker,
			lifecycle,
			offloader,
			readArtifact,
			gate,
		);
	}
}
