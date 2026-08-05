import { AgentRunCancelled } from "../../domain/event/catalog/agent-run-cancelled";
import { AgentRunCompleted } from "../../domain/event/catalog/agent-run-completed";
import { AgentRunFailed } from "../../domain/event/catalog/agent-run-failed";
import { AgentRunSuspended } from "../../domain/event/catalog/agent-run-suspended";
import { AgentTransferred } from "../../domain/event/catalog/agent-transferred";
import { AssistantMessageProduced } from "../../domain/event/catalog/assistant-message-produced";
import { SessionCreated } from "../../domain/event/catalog/session-created";
import { ToolApprovalDenied } from "../../domain/event/catalog/tool-approval-denied";
import { ToolApprovalGranted } from "../../domain/event/catalog/tool-approval-granted";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { PendingTurn } from "../../domain/session/pending-turn";
import type { SessionState } from "../../domain/session/session-state";

/** The version that started projecting the suspended turn rather than one held call. */
const VERSION = 4;

/**
 * Folds the journal into the state it implies.
 *
 * Applying is pure and total: every event advances the revision, and only the ones
 * that actually change what the runtime decides on touch anything else. Conversation
 * text never lands in the state, because the journal already holds it. The size of the
 * prompt does, because nothing else survives a restart with a number a provider gave.
 *
 * A suspension puts the whole turn in the state and a decision answers one call of it.
 * The turn only leaves when a run ends having run it, which is what makes a decision that
 * arrives twice land on nothing rather than on a second execution.
 *
 * The version is part of every snapshot checksum, so changing how projection works
 * invalidates old snapshots instead of restoring them into a shape that no longer means
 * the same thing.
 */
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
		if (event instanceof AssistantMessageProduced && event.measurement !== undefined) {
			return state.withLastPrompt(event.measurement);
		}
		if (event instanceof AgentRunSuspended) {
			return state.awaiting(PendingTurn.of(event.correlation.runId, event.calls));
		}
		if (event instanceof ToolApprovalGranted) return state.decided(event.callId, "granted");
		if (event instanceof ToolApprovalDenied) return state.decided(event.callId, "denied", event.reason);
		if (this.ends(event)) return state.released();
		return state;
	}

	/** A run that reached an end ran whatever it was resumed for, or will never run it. */
	private ends(event: StoredSessionEvent["event"]): boolean {
		return event instanceof AgentRunCompleted || event instanceof AgentRunFailed || event instanceof AgentRunCancelled;
	}
}
