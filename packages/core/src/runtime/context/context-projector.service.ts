import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { ContextBlock } from "../../domain/context/context-block.value-object";
import { OrphanToolResultError } from "../../domain/context/errors/orphan-tool-result.error";
import { SkillActivated } from "../../domain/event/catalog/run/skill-activated.event";
import { AssistantMessageProduced } from "../../domain/event/catalog/session/assistant-message-produced.event";
import { UserMessageReceived } from "../../domain/event/catalog/session/user-message-received.event";
import { ToolCallRequested } from "../../domain/event/catalog/tool/tool-call-requested.event";
import { ToolResultProduced } from "../../domain/event/catalog/tool/tool-result-produced.event";
import { DelegationStarted } from "../../domain/event/catalog/transfer/delegation-started.event";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event.record";
import { AssistantMessage } from "../../domain/model/messages/assistant-message.value-object";
import { ToolCallMessage } from "../../domain/model/messages/tool-call-message.value-object";
import { ToolResultMessage } from "../../domain/model/messages/tool-result-message.value-object";
import { UserMessage } from "../../domain/model/messages/user-message.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { AttachmentReader } from "../artifact/attachment-reader.service";
import { ResolvedAttachments } from "../artifact/resolved-attachments.value-object";

export class ContextProjector {
	public constructor(private readonly attachments: AttachmentReader = AttachmentReader.none()) {}

	public forgetAttachments(context: SessionContext): void {
		this.attachments.forget(context);
	}

	public async project(
		context: RunContext,
		events: AsyncIterable<StoredSessionEvent>,
		currentRun?: AgentRunId,
		acceptsRemoteUrl = false,
	): Promise<readonly ContextBlock[]> {
		const blocks: ContextBlock[] = [];
		const pending = new Map<string, number>();
		const positions = new Map<string, number>();
		const delegated = new Set<string>();
		let breath: number | undefined;

		for await (const stored of events) {
			const event = stored.event;
			if (event instanceof DelegationStarted) {
				delegated.add(event.childRunId.value);
				breath = undefined;
				if (currentRun?.value === event.childRunId.value) {
					blocks.length = 0;
					pending.clear();
					positions.clear();
				}
				continue;
			}
			if (this.belongsToAnother(delegated, stored, currentRun)) continue;
			if (!(event instanceof ToolCallRequested) && this.isConversational(event)) breath = undefined;
			if (event instanceof UserMessageReceived) {
				blocks.push(
					ContextBlock.conversation(await this.said(context, stored, event, currentRun, acceptsRemoteUrl), stored.revision),
				);
				continue;
			}
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
				const open = breath === undefined ? undefined : blocks[breath];
				const at = breath !== undefined && open !== undefined ? breath : blocks.length;
				if (open === undefined) blocks.push(ContextBlock.pendingCall(call, stored.revision));
				else blocks[at] = open.alsoCalling(call, stored.revision);
				breath = at;
				pending.set(event.callId.value, at);
				positions.set(event.callId.value, at);
				continue;
			}
			if (event instanceof ToolResultProduced) {
				await this.close(context, blocks, pending, event, stored, currentRun, acceptsRemoteUrl);
			}
		}

		return blocks;
	}

	private async said(
		context: RunContext,
		stored: StoredSessionEvent,
		event: UserMessageReceived,
		currentRun?: AgentRunId,
		acceptsRemoteUrl = false,
	): Promise<UserMessage> {
		if (!event.hasAttachments) return new UserMessage(event.text);
		const resolved = await this.attachments.read(
			context,
			event.attachments,
			stored.revision,
			this.isCurrent(stored, currentRun),
			acceptsRemoteUrl,
		);
		return new UserMessage(resolved.appendTo(event.text), resolved.media);
	}

	private isConversational(event: StoredSessionEvent["event"]): boolean {
		return (
			event instanceof UserMessageReceived ||
			event instanceof AssistantMessageProduced ||
			event instanceof ToolResultProduced ||
			event instanceof SkillActivated ||
			event instanceof DelegationStarted
		);
	}

	private isCurrent(stored: StoredSessionEvent, currentRun?: AgentRunId): boolean {
		return stored.event.correlation.runId.value === currentRun?.value;
	}

	private belongsToAnother(delegated: Set<string>, stored: StoredSessionEvent, currentRun?: AgentRunId): boolean {
		const runId = stored.event.correlation.runId.value;
		return delegated.has(runId) && runId !== currentRun?.value;
	}

	private async close(
		context: RunContext,
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
		const resolved = event.hasAttachments
			? await this.attachments.read(
					context,
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
