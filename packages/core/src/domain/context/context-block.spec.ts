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
