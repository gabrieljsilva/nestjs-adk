import { ToolApprovalDenied } from "../../domain/event/catalog/approval/tool-approval-denied.event";
import { ToolApprovalGranted } from "../../domain/event/catalog/approval/tool-approval-granted.event";
import { SessionMetadataDeleted } from "../../domain/event/catalog/metadata/session-metadata-deleted.event";
import { SessionMetadataSet } from "../../domain/event/catalog/metadata/session-metadata-set.event";
import { AgentRunCancelled } from "../../domain/event/catalog/run/agent-run-cancelled.event";
import { AgentRunCompleted } from "../../domain/event/catalog/run/agent-run-completed.event";
import { AgentRunFailed } from "../../domain/event/catalog/run/agent-run-failed.event";
import { AgentRunSuspended } from "../../domain/event/catalog/run/agent-run-suspended.event";
import { AssistantMessageProduced } from "../../domain/event/catalog/session/assistant-message-produced.event";
import { SessionCreated } from "../../domain/event/catalog/session/session-created.event";
import { AgentTransferred } from "../../domain/event/catalog/transfer/agent-transferred.event";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event.record";
import { PendingTurn } from "../../domain/session/approval/pending-turn.value-object";
import type { SessionState } from "../../domain/session/state/session-state.value-object";

const VERSION = 5;

export class StateProjector {
	public static readonly VERSION = VERSION;

	public apply(state: SessionState, stored: StoredSessionEvent): SessionState {
		return this.project(state, stored).at(stored.revision);
	}

	public applyAll(state: SessionState, events: readonly StoredSessionEvent[]): SessionState {
		return events.reduce((carried, stored) => this.apply(carried, stored), state);
	}

	private project(state: SessionState, stored: StoredSessionEvent): SessionState {
		const event = stored.event;
		if (event instanceof SessionCreated) return state.withActiveAgent(event.rootAgent);
		if (event instanceof AgentTransferred) return state.withActiveAgent(event.to);
		if (event instanceof SessionMetadataSet) return state.withMetadata(state.metadata.with(event.key, event.value));
		if (event instanceof SessionMetadataDeleted) return state.withMetadata(state.metadata.without(event.key));
		if (event instanceof AssistantMessageProduced && event.measurement !== undefined) {
			return state.withLastPrompt(event.measurement);
		}
		if (event instanceof AgentRunSuspended) {
			return state.awaiting(new PendingTurn(event.correlation.runId, event.calls));
		}
		if (event instanceof ToolApprovalGranted) return state.decided(event.callId, "granted");
		if (event instanceof ToolApprovalDenied) return state.decided(event.callId, "denied", event.reason);
		if (this.ends(event)) return state.released();
		return state;
	}

	private ends(event: StoredSessionEvent["event"]): boolean {
		return event instanceof AgentRunCompleted || event instanceof AgentRunFailed || event instanceof AgentRunCancelled;
	}
}
