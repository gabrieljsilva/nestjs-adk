import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { AgentName } from "../../../domain/agent/agent-name.value-object";
import { ToolApprovalDenied } from "../../../domain/event/catalog/approval/tool-approval-denied.event";
import { ToolApprovalGranted } from "../../../domain/event/catalog/approval/tool-approval-granted.event";
import { ToolApprovalRequested } from "../../../domain/event/catalog/approval/tool-approval-requested.event";
import { SessionMetadataSet } from "../../../domain/event/catalog/metadata/session-metadata-set.event";
import { AgentRunCancelled } from "../../../domain/event/catalog/run/agent-run-cancelled.event";
import { AgentRunCompleted } from "../../../domain/event/catalog/run/agent-run-completed.event";
import { AgentRunFailed } from "../../../domain/event/catalog/run/agent-run-failed.event";
import { AgentRunStarted } from "../../../domain/event/catalog/run/agent-run-started.event";
import { AgentRunSuspended } from "../../../domain/event/catalog/run/agent-run-suspended.event";
import { ModelRerouted } from "../../../domain/event/catalog/run/model-rerouted.event";
import { SkillActivated } from "../../../domain/event/catalog/run/skill-activated.event";
import { AssistantMessageProduced } from "../../../domain/event/catalog/session/assistant-message-produced.event";
import { SessionCreated } from "../../../domain/event/catalog/session/session-created.event";
import { UserMessageReceived } from "../../../domain/event/catalog/session/user-message-received.event";
import { ToolCallRequested } from "../../../domain/event/catalog/tool/tool-call-requested.event";
import { ToolResultProduced } from "../../../domain/event/catalog/tool/tool-result-produced.event";
import { ToolSourceReauthRequired } from "../../../domain/event/catalog/tool/tool-source-reauth-required.event";
import { AgentTransferred } from "../../../domain/event/catalog/transfer/agent-transferred.event";
import { DelegationCompleted } from "../../../domain/event/catalog/transfer/delegation-completed.event";
import { DelegationStarted } from "../../../domain/event/catalog/transfer/delegation-started.event";
import type { EventHeader } from "../../../domain/event/event-header.value-object";
import { SessionEventBatch } from "../../../domain/event/session-event-batch.value-object";
import type { SessionEvent } from "../../../domain/event/session-event.event";
import type { AttachmentReference } from "../../../domain/model/attachment/attachment-reference.value-object";
import type { ModelIdentity } from "../../../domain/model/descriptor/model-identity.value-object";
import { PromptMeasurement } from "../../../domain/model/usage/prompt-measurement.value-object";
import type { ApprovalDecision, PendingCall } from "../../../domain/session/approval/pending-call.value-object";
import type { PendingTurn } from "../../../domain/session/approval/pending-turn.value-object";
import type { SessionMetadata } from "../../../domain/session/metadata/session-metadata.value-object";
import type { SkillDefinition } from "../../../domain/skill/skill-definition.value-object";
import type { ToolSourceAuthError } from "../../../domain/tool/errors/tool-source-auth.error";
import { ToolOutcome } from "../../../domain/tool/invocation/tool-outcome.value-object";
import type { ModelRunOutcome } from "../../model/model-run-outcome.value-object";
import type { OpenedSession } from "../../session/opened-session.value-object";
import type { AgentRunCommand } from "../agent-run.command";
import type { StartedRun } from "../settle/started-run.value-object";
import type { RunEventFactory } from "./run-event.factory";

const DEFAULT_FINISH_REASON = "stop";

const UNEXPECTED_ERROR_CODE = "UNEXPECTED_ERROR";

export class RunJournal {
	public constructor(private readonly events: RunEventFactory) {}

	public opening(
		started: StartedRun,
		agent: AgentName,
		model: ModelIdentity,
		command: AgentRunCommand,
		opened: OpenedSession,
		transferredFrom?: AgentName,
		attachments: readonly AttachmentReference[] = [],
	): SessionEventBatch {
		const events: SessionEvent[] = [];
		if (opened.isNew) {
			events.push(new SessionCreated(this.buildHeader(started), transferredFrom ?? agent, command.actor?.id));
		}
		events.push(...this.metadata(started, command.metadata));
		if (transferredFrom !== undefined) events.push(this.transfer(started, transferredFrom, agent));
		events.push(
			new UserMessageReceived(this.buildHeader(started), command.input.message, attachments, command.actor?.id),
		);
		events.push(this.started(started, agent, model));
		return new SessionEventBatch(events);
	}

	public metadata(started: StartedRun, metadata: SessionMetadata): readonly SessionEvent[] {
		return metadata.entries().map(([key, value]) => new SessionMetadataSet(this.buildHeader(started), key, value));
	}

	public started(started: StartedRun, agent: AgentName, model: ModelIdentity): AgentRunStarted {
		return new AgentRunStarted(this.buildHeader(started), agent, model);
	}

	public turn(started: StartedRun, outcome: ModelRunOutcome, characters: number, isFinal: boolean): SessionEventBatch {
		const events: SessionEvent[] = outcome.reroutes.map(
			(reroute) =>
				new ModelRerouted(this.buildHeader(started), reroute.from, reroute.to, reroute.failure.kind, reroute.attempt),
		);
		events.push(
			new AssistantMessageProduced(
				this.buildHeader(started),
				outcome.response.text,
				outcome.servedBy,
				PromptMeasurement.from(outcome.response.usage, characters, outcome.servedBy),
			),
		);
		for (const call of outcome.response.toolCalls) {
			events.push(new ToolCallRequested(this.buildHeader(started), call.callId, call.toolName, call.args, call.signature));
		}
		if (isFinal) {
			events.push(
				new AgentRunCompleted(this.buildHeader(started), outcome.response.finishReason ?? DEFAULT_FINISH_REASON),
			);
		}
		return new SessionEventBatch(events);
	}

	public suspension(started: StartedRun, calls: readonly PendingCall[]): SessionEventBatch {
		const held = calls.filter((call) => call.isHeld);
		const events: SessionEvent[] = held.map(
			(call) => new ToolApprovalRequested(this.buildHeader(started), call.callId, call.toolName, call.effect ?? ""),
		);
		events.push(new AgentRunSuspended(this.buildHeader(started), this.buildPendingReason(held), calls));
		return new SessionEventBatch(events);
	}

	public stillWaiting(started: StartedRun, turn: PendingTurn): SessionEventBatch {
		return new SessionEventBatch([
			new AgentRunSuspended(this.buildHeader(started), this.buildPendingReason(turn.awaiting), turn.calls),
		]);
	}

	public decision(
		started: StartedRun,
		callId: ToolCallId,
		decision: ApprovalDecision,
		by?: string,
		reason?: string,
		toolName = "",
		actorId?: string,
	): SessionEvent {
		const header = this.buildHeader(started);
		if (decision === "granted") return new ToolApprovalGranted(header, callId, by, actorId);
		return new ToolApprovalDenied(header, callId, by, reason ?? "", toolName, actorId);
	}

	public result(started: StartedRun, outcome: ToolOutcome): ToolResultProduced {
		return new ToolResultProduced(
			this.buildHeader(started),
			outcome.callId,
			outcome.toolName,
			outcome.recordedOutput,
			outcome.failed,
			outcome.reference?.id,
			outcome.attachments,
		);
	}

	public delegatedResult(started: StartedRun, call: PendingCall, answer: string): ToolResultProduced {
		return new ToolResultProduced(this.buildHeader(started), call.callId, call.toolName, { answer }, false);
	}

	public refusal(started: StartedRun, call: PendingCall): ToolResultProduced {
		return this.result(started, ToolOutcome.refused(call.callId, call.toolName, call.reason ?? ""));
	}

	public delegation(
		parent: StartedRun,
		child: StartedRun,
		task: string,
		agent: AgentName,
		model: ModelIdentity,
	): SessionEventBatch {
		return new SessionEventBatch([
			new DelegationStarted(this.buildHeader(parent), child.run.correlationId, child.run.id, agent),
			new UserMessageReceived(this.buildHeader(child), task),
			this.started(child, agent, model),
		]);
	}

	public delegationEnd(parent: StartedRun, child: StartedRun, outcome: string): DelegationCompleted {
		return new DelegationCompleted(this.buildHeader(parent), child.run.correlationId, child.run.id, outcome);
	}

	public transfer(started: StartedRun, from: AgentName, to: AgentName): AgentTransferred {
		return new AgentTransferred(this.buildHeader(started), from, to);
	}

	public activation(started: StartedRun, skill: SkillDefinition, callId: ToolCallId): SkillActivated {
		return new SkillActivated(this.buildHeader(started), skill.name, skill.scope, skill.digest(), callId);
	}

	public reauth(started: StartedRun, failures: readonly ToolSourceAuthError[]): SessionEventBatch {
		return new SessionEventBatch(
			failures.map((failure) => new ToolSourceReauthRequired(this.buildHeader(started), failure.source, failure.reason)),
		);
	}

	public terminal(started: StartedRun, error: unknown): SessionEvent {
		const header = this.buildHeader(started);
		if (started.cancellation.isCancelled) return new AgentRunCancelled(header, this.readFailureReason(error));
		return new AgentRunFailed(header, this.readCode(error), this.readFailureReason(error));
	}

	private buildHeader(started: StartedRun): EventHeader {
		return this.events.buildHeader(started.run);
	}

	private buildPendingReason(calls: readonly PendingCall[]): string {
		return `waiting for a decision on ${calls.map((call) => call.toolName).join(", ")}.`;
	}

	private readCode(error: unknown): string {
		const code = error instanceof Error ? Reflect.get(error, "code") : undefined;
		return typeof code === "string" ? code : UNEXPECTED_ERROR_CODE;
	}

	private readFailureReason(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
}
