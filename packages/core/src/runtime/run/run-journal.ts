import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { AgentName } from "../../domain/agent/agent-name";
import { AgentRunCancelled } from "../../domain/event/catalog/agent-run-cancelled";
import { AgentRunCompleted } from "../../domain/event/catalog/agent-run-completed";
import { AgentRunFailed } from "../../domain/event/catalog/agent-run-failed";
import { AgentRunStarted } from "../../domain/event/catalog/agent-run-started";
import { AgentRunSuspended } from "../../domain/event/catalog/agent-run-suspended";
import { AgentTransferred } from "../../domain/event/catalog/agent-transferred";
import { AssistantMessageProduced } from "../../domain/event/catalog/assistant-message-produced";
import { DelegationCompleted } from "../../domain/event/catalog/delegation-completed";
import { DelegationStarted } from "../../domain/event/catalog/delegation-started";
import { ModelRerouted } from "../../domain/event/catalog/model-rerouted";
import { SessionCreated } from "../../domain/event/catalog/session-created";
import { SkillActivated } from "../../domain/event/catalog/skill-activated";
import { ToolApprovalDenied } from "../../domain/event/catalog/tool-approval-denied";
import { ToolApprovalGranted } from "../../domain/event/catalog/tool-approval-granted";
import { ToolApprovalRequested } from "../../domain/event/catalog/tool-approval-requested";
import { ToolCallRequested } from "../../domain/event/catalog/tool-call-requested";
import { ToolResultProduced } from "../../domain/event/catalog/tool-result-produced";
import { ToolSourceReauthRequired } from "../../domain/event/catalog/tool-source-reauth-required";
import { UserMessageReceived } from "../../domain/event/catalog/user-message-received";
import type { EventHeader } from "../../domain/event/event-header";
import type { SessionEvent } from "../../domain/event/session-event";
import { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { ModelIdentity } from "../../domain/model/model-identity";
import { PromptMeasurement } from "../../domain/model/prompt-measurement";
import type { ApprovalDecision, PendingCall } from "../../domain/session/pending-call";
import type { PendingTurn } from "../../domain/session/pending-turn";
import type { SkillDefinition } from "../../domain/skill/skill-definition";
import type { ToolSourceAuthError } from "../../domain/tool/errors/tool-source-auth.error";
import type { ToolOutcome } from "../../domain/tool/tool-outcome";
import type { ModelRunOutcome } from "../model/model-run-outcome";
import type { OpenedSession } from "../session/opened-session";
import type { AgentRunCommand } from "./agent-run-command";
import type { RunEventFactory } from "./run-event-factory";
import type { StartedRun } from "./started-run";

/** A provider that answered without saying why it stopped still ended the turn. */
const DEFAULT_FINISH_REASON = "stop";

const UNEXPECTED_ERROR_CODE = "UNEXPECTED_ERROR";

/**
 * What a run writes down, and nothing about when it is written.
 *
 * Every batch a run can commit is built here, so the shape of the journal is one file
 * rather than a decision spread across whatever code happened to reach that point. The
 * orchestration decides the moment; this decides the record.
 *
 * Nothing here touches storage. A batch is a value, and the caller that owns the
 * revision is the one that commits it.
 */
export class RunJournal {
	public constructor(private readonly events: RunEventFactory) {}

	/** The question is durable before the model is asked, never after it answers. */
	public opening(
		started: StartedRun,
		agent: AgentName,
		model: ModelIdentity,
		command: AgentRunCommand,
		opened: OpenedSession,
		transferredFrom?: AgentName,
	): SessionEventBatch {
		const events: SessionEvent[] = [];
		if (opened.isNew) {
			events.push(new SessionCreated(this.headerOf(started), transferredFrom ?? agent, command.owner?.value));
		}
		if (transferredFrom !== undefined) events.push(this.transfer(started, transferredFrom, agent));
		events.push(new UserMessageReceived(this.headerOf(started), command.input.message));
		events.push(this.started(started, agent, model));
		return SessionEventBatch.of(events);
	}

	public started(started: StartedRun, agent: AgentName, model: ModelIdentity): AgentRunStarted {
		return new AgentRunStarted(this.headerOf(started), agent, model);
	}

	/**
	 * One turn, whole: what it took to get an answer, the answer, and what it asked for next.
	 * The run only ends here when the model asked for nothing, and then the answer and the
	 * end of the run are the same write: a reader never finds one without the other.
	 */
	public turn(started: StartedRun, outcome: ModelRunOutcome, characters: number, isFinal: boolean): SessionEventBatch {
		const events: SessionEvent[] = outcome.reroutes.map(
			(reroute) =>
				new ModelRerouted(this.headerOf(started), reroute.from, reroute.to, reroute.failure.kind, reroute.attempt),
		);
		events.push(
			new AssistantMessageProduced(
				this.headerOf(started),
				outcome.response.text,
				outcome.servedBy,
				PromptMeasurement.from(outcome.response.usage, characters, outcome.servedBy),
			),
		);
		for (const call of outcome.response.toolCalls) {
			events.push(new ToolCallRequested(this.headerOf(started), call.callId, call.toolName, call.args, call.signature));
		}
		if (isFinal) {
			events.push(new AgentRunCompleted(this.headerOf(started), outcome.response.finishReason ?? DEFAULT_FINISH_REASON));
		}
		return SessionEventBatch.of(events);
	}

	/**
	 * The turn stopped before any of its calls ran, and the run ended rather than paused.
	 * Nothing about a suspended run is retained: what continues it later is a new run, so a
	 * restart between the question and the answer changes nothing.
	 */
	public suspension(started: StartedRun, calls: readonly PendingCall[]): SessionEventBatch {
		const held = calls.filter((call) => call.isHeld);
		const events: SessionEvent[] = held.map(
			(call) => new ToolApprovalRequested(this.headerOf(started), call.callId, call.toolName, call.effect ?? ""),
		);
		events.push(new AgentRunSuspended(this.headerOf(started), this.reasonFor(held), calls));
		return SessionEventBatch.of(events);
	}

	/** Somebody still has to answer, so this run ends the way the one before it did. */
	public stillWaiting(started: StartedRun, turn: PendingTurn): SessionEventBatch {
		return SessionEventBatch.of([
			new AgentRunSuspended(this.headerOf(started), this.reasonFor(turn.awaiting), turn.calls),
		]);
	}

	/** What a human answered about one call, which is the only place a decision is recorded. */
	public decision(
		started: StartedRun,
		callId: ToolCallId,
		decision: ApprovalDecision,
		by?: string,
		reason?: string,
	): SessionEvent {
		const header = this.headerOf(started);
		if (decision === "granted") return new ToolApprovalGranted(header, callId, by);
		return new ToolApprovalDenied(header, callId, by, reason ?? "");
	}

	public result(started: StartedRun, outcome: ToolOutcome): ToolResultProduced {
		return new ToolResultProduced(
			this.headerOf(started),
			outcome.callId,
			outcome.toolName,
			outcome.recordedOutput,
			outcome.failed,
			outcome.reference?.id,
		);
	}

	/** What a child run answered, handed back as the result of the call that asked for it. */
	public delegatedResult(started: StartedRun, call: PendingCall, answer: string): ToolResultProduced {
		return new ToolResultProduced(this.headerOf(started), call.callId, call.toolName, { answer }, false);
	}

	/** A call somebody refused reads to the model like any other failure, which is what it is. */
	public refusal(started: StartedRun, call: PendingCall): ToolResultProduced {
		return new ToolResultProduced(this.headerOf(started), call.callId, call.toolName, { error: call.reason ?? "" }, true);
	}

	/**
	 * A delegation opening: the parent says who it asked, and the child's first turn follows.
	 *
	 * The opening event belongs to the parent run and the task belongs to the child, which is
	 * what makes the child's context begin here instead of inheriting the conversation.
	 */
	public delegation(
		parent: StartedRun,
		child: StartedRun,
		task: string,
		agent: AgentName,
		model: ModelIdentity,
	): SessionEventBatch {
		return SessionEventBatch.of([
			new DelegationStarted(this.headerOf(parent), child.run.correlationId, child.run.id, agent),
			new UserMessageReceived(this.headerOf(child), task),
			this.started(child, agent, model),
		]);
	}

	/** The child run ended, so the delegation it opened is closed with what came of it. */
	public delegationEnd(parent: StartedRun, child: StartedRun, outcome: string): DelegationCompleted {
		return new DelegationCompleted(this.headerOf(parent), child.run.correlationId, child.run.id, outcome);
	}

	/** The session changed hands, which is the only record of who owns the turn from here on. */
	public transfer(started: StartedRun, from: AgentName, to: AgentName): AgentTransferred {
		return new AgentTransferred(this.headerOf(started), from, to);
	}

	public activation(started: StartedRun, skill: SkillDefinition, callId: ToolCallId): SkillActivated {
		return new SkillActivated(this.headerOf(started), skill.name, skill.scope, skill.digest(), callId);
	}

	public reauth(started: StartedRun, failures: readonly ToolSourceAuthError[]): SessionEventBatch {
		return SessionEventBatch.of(
			failures.map((failure) => new ToolSourceReauthRequired(this.headerOf(started), failure.source, failure.reason)),
		);
	}

	/** How the run ended, taken from the failure that ended it rather than from a guess. */
	public terminal(started: StartedRun, error: unknown): SessionEvent {
		const header = this.headerOf(started);
		if (started.cancellation.isCancelled) return new AgentRunCancelled(header, this.reasonOf(error));
		return new AgentRunFailed(header, this.codeOf(error), this.reasonOf(error));
	}

	private headerOf(started: StartedRun): EventHeader {
		return this.events.headerFor(started.run);
	}

	private reasonFor(calls: readonly PendingCall[]): string {
		return `waiting for a decision on ${calls.map((call) => call.toolName).join(", ")}.`;
	}

	private codeOf(error: unknown): string {
		const code = error instanceof Error ? Reflect.get(error, "code") : undefined;
		return typeof code === "string" ? code : UNEXPECTED_ERROR_CODE;
	}

	private reasonOf(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
}
