import type { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { ModelMessage } from "../model/messages/model-message.value-object";
import { ToolCallMessage } from "../model/messages/tool-call-message.value-object";
import { ToolResultMessage } from "../model/messages/tool-result-message.value-object";
import { ContextCategory } from "./context-category.value-object";

/**
 * The smallest piece of context that may be dropped or kept, never split.
 *
 * A tool call and the results answering it are one block, open until every call is
 * answered. An open block, and a pinned one, are never removable by compaction.
 */
export class ContextBlock {
	private constructor(
		public readonly category: ContextCategory,
		public readonly messages: readonly ModelMessage[],
		public readonly firstRevision: SessionRevision,
		public readonly lastRevision: SessionRevision,
		public readonly closed: boolean,
		public readonly callId?: ToolCallId,
		public readonly pinned: boolean = false,
	) {}

	public static conversation(message: ModelMessage, revision: SessionRevision): ContextBlock {
		return new ContextBlock(ContextCategory.CONVERSATION, [message], revision, revision, true);
	}

	public static restore(
		category: ContextCategory,
		messages: readonly ModelMessage[],
		firstRevision: SessionRevision,
		lastRevision: SessionRevision,
		closed: boolean,
		callId?: ToolCallId,
		pinned = false,
	): ContextBlock {
		return new ContextBlock(category, [...messages], firstRevision, lastRevision, closed, callId, pinned);
	}

	public static summary(message: ModelMessage, revision: SessionRevision): ContextBlock {
		return new ContextBlock(ContextCategory.SUMMARIES, [message], revision, revision, true);
	}

	public static pendingCall(call: ToolCallMessage, revision: SessionRevision): ContextBlock {
		return new ContextBlock(ContextCategory.TOOL_RESULTS, [call], revision, revision, false, call.callId);
	}

	public static exchange(
		call: ToolCallMessage,
		result: ToolResultMessage,
		callRevision: SessionRevision,
		resultRevision: SessionRevision,
	): ContextBlock {
		return new ContextBlock(
			ContextCategory.TOOL_RESULTS,
			[call, result],
			callRevision,
			resultRevision,
			true,
			call.callId,
		);
	}

	public get isRemovable(): boolean {
		return this.closed && !this.pinned;
	}

	public get isOpen(): boolean {
		return !this.closed;
	}

	public asSkill(): ContextBlock {
		return new ContextBlock(
			ContextCategory.ACTIVE_SKILLS,
			this.messages,
			this.firstRevision,
			this.lastRevision,
			this.closed,
			this.callId,
			true,
		);
	}

	public alsoCalling(call: ToolCallMessage, revision: SessionRevision): ContextBlock {
		return new ContextBlock(
			this.category,
			[...this.messages, call],
			this.firstRevision,
			revision,
			false,
			this.callId,
			this.pinned,
		);
	}

	public answeredBy(result: ToolResultMessage, resultRevision: SessionRevision): ContextBlock {
		const messages = [...this.messages, result];
		const calls = messages.filter((message) => message instanceof ToolCallMessage).length;
		const results = messages.filter((message) => message instanceof ToolResultMessage).length;
		return new ContextBlock(
			this.category,
			messages,
			this.firstRevision,
			resultRevision,
			results >= calls,
			this.callId,
			this.pinned,
		);
	}
}
