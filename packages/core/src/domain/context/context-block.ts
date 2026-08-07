import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { SessionRevision } from "../../common/revision/session-revision";
import type { ModelMessage } from "../model/model-message";
import type { ToolCallMessage } from "../model/tool-call-message";
import type { ToolResultMessage } from "../model/tool-result-message";
import { ContextCategory } from "./context-category";

/**
 * The smallest piece of context that may be dropped or kept, never split.
 *
 * A tool call and the result that answers it are one block: removing half of a pair
 * leaves the model reading an answer to a question it cannot see, or waiting for a
 * result that will never arrive. A call still without its result is an open
 * obligation, and compaction is not allowed to touch it.
 *
 * A block can also be pinned, which is the other reason compaction leaves something
 * alone: a skill the model loaded is knowledge it is expected to still have, and
 * dropping it would take that back without telling anyone.
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

	/**
	 * A block read back from where it was stored, exactly as it was.
	 *
	 * The named constructors above each build one kind of block, and a stored one has
	 * already been through them: a summary that was later pinned is a combination none of
	 * them produces, and rebuilding it through the closest one would quietly hand
	 * compaction something it was told to leave alone.
	 */
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

	/** A call still waiting for its result: present in the context, and never removable. */
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

	/** Answered and unpinned blocks are the only ones compaction may drop. */
	public get isRemovable(): boolean {
		return this.closed && !this.pinned;
	}

	public get isOpen(): boolean {
		return !this.closed;
	}

	/**
	 * The same block, kept where it is and counted as the skill it carries.
	 * The content never moves to the front of the prompt: a skill loaded halfway through a
	 * session must not invalidate the cache of everything before it.
	 */
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

	/** The block this one becomes once its result arrives. */
	public answeredBy(result: ToolResultMessage, resultRevision: SessionRevision): ContextBlock {
		return new ContextBlock(
			this.category,
			[...this.messages, result],
			this.firstRevision,
			resultRevision,
			true,
			this.callId,
			this.pinned,
		);
	}
}
