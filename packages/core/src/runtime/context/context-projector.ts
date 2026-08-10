import type { AgentRunId } from "../../common/identity/agent-run-id";
import { ContextBlock } from "../../domain/context/context-block";
import { OrphanToolResultError } from "../../domain/context/errors/orphan-tool-result.error";
import { AssistantMessageProduced } from "../../domain/event/catalog/assistant-message-produced";
import { DelegationStarted } from "../../domain/event/catalog/delegation-started";
import { SkillActivated } from "../../domain/event/catalog/skill-activated";
import { ToolCallRequested } from "../../domain/event/catalog/tool-call-requested";
import { ToolResultProduced } from "../../domain/event/catalog/tool-result-produced";
import { UserMessageReceived } from "../../domain/event/catalog/user-message-received";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { AssistantMessage } from "../../domain/model/assistant-message";
import { ToolCallMessage } from "../../domain/model/tool-call-message";
import { ToolResultMessage } from "../../domain/model/tool-result-message";
import { UserMessage } from "../../domain/model/user-message";
import { AttachmentReader } from "../artifact/attachment-reader";
import { ResolvedAttachments } from "../artifact/resolved-attachments";

/**
 * Turns a journal into the causal blocks a model can read.
 *
 * Only conversational facts reach the model: a run that started, an agent that was
 * transferred to or an approval that was granted are history, not something the model
 * has to re read. A result closes the block its call opened, in the position the call
 * held, so the order the model sees is the order the journal recorded. A result whose
 * call is missing stops the projection instead of becoming an answer to nothing.
 *
 * A delegated run is invisible from outside itself: the parent reads the answer as the
 * result of the call it made, and never the conversation the child had to get there.
 *
 * An activated skill is not a block of its own. It marks the exchange its content
 * arrived in, which keeps the content where it landed and keeps compaction from
 * dropping it. A skill scoped to a run stops being marked once that run is over, so
 * knowledge loaded for one question does not quietly follow the session forever.
 */
export class ContextProjector {
	public constructor(private readonly attachments: AttachmentReader = AttachmentReader.none()) {}

	public async project(
		events: AsyncIterable<StoredSessionEvent>,
		currentRun?: AgentRunId,
		acceptsRemoteUrl = false,
	): Promise<readonly ContextBlock[]> {
		const blocks: ContextBlock[] = [];
		const pending = new Map<string, number>();
		const positions = new Map<string, number>();
		const delegated = new Set<string>();

		for await (const stored of events) {
			const event = stored.event;
			if (event instanceof DelegationStarted) {
				delegated.add(event.childRunId.value);
				// A delegated run's context begins where its delegation did, not where the session did.
				if (currentRun?.value === event.childRunId.value) {
					blocks.length = 0;
					pending.clear();
					positions.clear();
				}
				continue;
			}
			if (this.belongsToAnother(delegated, stored, currentRun)) continue;
			if (event instanceof UserMessageReceived) {
				blocks.push(
					ContextBlock.conversation(await this.said(stored, event, currentRun, acceptsRemoteUrl), stored.revision),
				);
				continue;
			}
			// A turn that only asked for tools said nothing, and an empty message read back as
			// conversation would teach the model that answering with silence is a turn.
			if (event instanceof AssistantMessageProduced) {
				if (event.text.length > 0) {
					blocks.push(ContextBlock.conversation(new AssistantMessage(event.text), stored.revision));
				}
				continue;
			}
			if (event instanceof SkillActivated) {
				this.pin(blocks, positions, event, currentRun);
				continue;
			}
			if (event instanceof ToolCallRequested) {
				const call = new ToolCallMessage(event.callId, event.toolName, event.args, event.signature);
				pending.set(event.callId.value, blocks.length);
				positions.set(event.callId.value, blocks.length);
				blocks.push(ContextBlock.pendingCall(call, stored.revision));
				continue;
			}
			if (event instanceof ToolResultProduced) {
				await this.close(blocks, pending, event, stored, currentRun, acceptsRemoteUrl);
			}
		}

		return blocks;
	}

	/**
	 * What the user said, with what they attached put back the way this turn reads it.
	 *
	 * The journal kept names, so the resolver is asked here and only here what each one
	 * becomes. A message that attached nothing costs no read at all, which is almost every
	 * message. A note stands in after the words, the way `MediaFit` writes its placeholder.
	 */
	private async said(
		stored: StoredSessionEvent,
		event: UserMessageReceived,
		currentRun?: AgentRunId,
		acceptsRemoteUrl = false,
	): Promise<UserMessage> {
		if (!event.hasAttachments) return new UserMessage(event.text);
		const resolved = await this.attachments.read(
			stored.sessionId,
			event.attachments,
			stored.revision,
			this.isCurrent(stored, currentRun),
			acceptsRemoteUrl,
		);
		return new UserMessage(resolved.appendTo(event.text), resolved.media);
	}

	/** True when the event belongs to the run being served, which is what a resolver may key on. */
	private isCurrent(stored: StoredSessionEvent, currentRun?: AgentRunId): boolean {
		return stored.event.correlation.runId.value === currentRun?.value;
	}

	/**
	 * True when this event belongs to a delegated run that is not the one asking.
	 *
	 * What a child agent said to answer one task is not part of the conversation the parent
	 * is having. The parent reads the answer as the result of the call it made, which is all
	 * it asked for, and a sibling delegation is not part of a child's context either.
	 */
	private belongsToAnother(delegated: Set<string>, stored: StoredSessionEvent, currentRun?: AgentRunId): boolean {
		const runId = stored.event.correlation.runId.value;
		return delegated.has(runId) && runId !== currentRun?.value;
	}

	private async close(
		blocks: ContextBlock[],
		pending: Map<string, number>,
		event: ToolResultProduced,
		stored: StoredSessionEvent,
		currentRun?: AgentRunId,
		acceptsRemoteUrl = false,
	): Promise<void> {
		const at = pending.get(event.callId.value);
		const open = at === undefined ? undefined : blocks[at];
		if (at === undefined || open === undefined) {
			throw new OrphanToolResultError(event.callId.value, event.toolName);
		}
		// A note joins the output under a synthetic key, the way the offloader writes its placeholder.
		const resolved = event.hasAttachments
			? await this.attachments.read(
					stored.sessionId,
					event.attachments,
					stored.revision,
					this.isCurrent(stored, currentRun),
					acceptsRemoteUrl,
				)
			: ResolvedAttachments.none();
		const result = new ToolResultMessage(
			event.callId,
			event.toolName,
			resolved.annotate(event.output),
			event.failed,
			resolved.media,
		);
		blocks[at] = open.answeredBy(result, stored.revision);
		pending.delete(event.callId.value);
	}

	/** The exchange the content arrived in becomes the skill, in the place it already held. */
	private pin(
		blocks: ContextBlock[],
		positions: Map<string, number>,
		event: SkillActivated,
		currentRun?: AgentRunId,
	): void {
		if (currentRun !== undefined && !event.isActiveIn(currentRun.value)) return;
		const at = positions.get(event.callId.value);
		const block = at === undefined ? undefined : blocks[at];
		if (at === undefined || block === undefined) return;
		blocks[at] = block.asSkill();
	}
}
