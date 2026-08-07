import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { ToolCallMessage } from "../model/tool-call-message";
import { ToolResultMessage } from "../model/tool-result-message";
import { UserMessage } from "../model/user-message";
import { ContextBlock } from "./context-block";
import { ContextCategory } from "./context-category";

const CALL = ToolCallId.from("call-1");
const R1 = SessionRevision.of(1);
const R2 = SessionRevision.of(2);
const call = new ToolCallMessage(CALL, "search", { q: "x" });
const result = new ToolResultMessage(CALL, "search", { hits: 1 }, false);

describe("ContextBlock", () => {
	it("holds a conversation message as one closed block", () => {
		const block = ContextBlock.conversation(new UserMessage("hi"), R1);

		expect(block.category).toBe(ContextCategory.CONVERSATION);
		expect(block.isRemovable).toBe(true);
		expect(block.messages).toHaveLength(1);
	});

	it("keeps a call and its result together in one block", () => {
		const block = ContextBlock.exchange(call, result, R1, R2);

		expect(block.messages).toEqual([call, result]);
		expect(block.firstRevision.value).toBe(1);
		expect(block.lastRevision.value).toBe(2);
	});

	it("marks a call without a result as open", () => {
		const block = ContextBlock.pendingCall(call, R1);

		expect(block.isOpen).toBe(true);
		expect(block.isRemovable).toBe(false);
	});

	it("closes an open call when the result arrives, without mutating the open one", () => {
		const pending = ContextBlock.pendingCall(call, R1);

		const answered = pending.answeredBy(result, R2);

		expect(pending.isOpen).toBe(true);
		expect(answered.isOpen).toBe(false);
		expect(answered.messages).toEqual([call, result]);
		expect(answered.lastRevision.value).toBe(2);
	});

	it("keeps the call id, which is what pairs the block with its result", () => {
		expect(ContextBlock.pendingCall(call, R1).callId?.value).toBe("call-1");
	});

	it("files the exchange a skill arrived in under active skills, without moving it", () => {
		const block = ContextBlock.exchange(call, result, R1, R2).asSkill();

		expect(block.category).toBe(ContextCategory.ACTIVE_SKILLS);
		expect(block.messages).toEqual([call, result]);
		expect(block.firstRevision).toBe(R1);
	});

	it("never drops a skill, because taking knowledge back is not compaction", () => {
		expect(ContextBlock.exchange(call, result, R1, R2).asSkill().isRemovable).toBe(false);
	});

	it("files a summary under summaries", () => {
		expect(ContextBlock.summary(new UserMessage("earlier"), R1).category).toBe(ContextCategory.SUMMARIES);
	});
});

/**
 * What compaction is allowed to touch is decided by `closed` and `pinned`, and a stored
 * block has combinations no other named constructor produces.
 */
describe("ContextBlock.restore", () => {
	it("brings a block back exactly as it was", () => {
		const restored = ContextBlock.restore(ContextCategory.SUMMARIES, [new UserMessage("hi")], R1, R2, true, CALL, true);

		expect(restored.category).toBe(ContextCategory.SUMMARIES);
		expect(restored.firstRevision).toBe(R1);
		expect(restored.lastRevision).toBe(R2);
		expect(restored.callId).toBe(CALL);
	});

	it("keeps a pinned summary out of compaction's reach", () => {
		const restored = ContextBlock.restore(
			ContextCategory.SUMMARIES,
			[new UserMessage("hi")],
			R1,
			R1,
			true,
			undefined,
			true,
		);

		expect(restored.isRemovable).toBe(false);
	});

	it("keeps a call that never got its result open", () => {
		const restored = ContextBlock.restore(ContextCategory.TOOL_RESULTS, [new UserMessage("hi")], R1, R1, false, CALL);

		expect(restored.isOpen).toBe(true);
		expect(restored.isRemovable).toBe(false);
	});

	it("copies the messages it was handed, so the caller's array cannot change it later", () => {
		const messages = [new UserMessage("hi")];
		const restored = ContextBlock.restore(ContextCategory.CONVERSATION, messages, R1, R1, true);

		messages.push(new UserMessage("and this"));

		expect(restored.messages).toHaveLength(1);
	});
});
