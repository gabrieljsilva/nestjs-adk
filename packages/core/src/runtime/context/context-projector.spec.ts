import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { ContextCategory } from "../../domain/context/context-category";
import { OrphanToolResultError } from "../../domain/context/errors/orphan-tool-result.error";
import { ToolCallMessage } from "../../domain/model/tool-call-message";
import { ToolResultMessage } from "../../domain/model/tool-result-message";
import { JournalFixture } from "../../support/context/journal.fixture";
import { ContextProjector } from "./context-projector";

const projector = new ContextProjector();

describe("ContextProjector", () => {
	it("projects a conversation in journal order", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello").user("more");

		const blocks = await projector.project(journal.stream());

		expect(blocks.flatMap((block) => block.messages).map((message) => message.text)).toEqual(["hi", "hello", "more"]);
	});

	it("leaves facts that are history out of the context", async () => {
		const journal = new JournalFixture().runStarted().user("hi");

		const blocks = await projector.project(journal.stream());

		expect(blocks).toHaveLength(1);
	});

	it("closes a call with the result that answers it, in the position the call held", async () => {
		const journal = new JournalFixture()
			.user("find it")
			.toolCall("c-1", "search", { q: "x" })
			.toolResult("c-1", "search", { hits: 2 })
			.assistant("found two");

		const blocks = await projector.project(journal.stream());

		expect(blocks).toHaveLength(3);
		expect(blocks[1]?.isOpen).toBe(false);
		expect(blocks[1]?.messages[0]).toBeInstanceOf(ToolCallMessage);
		expect(blocks[1]?.messages[1]).toBeInstanceOf(ToolResultMessage);
		expect(blocks[1]?.category).toBe(ContextCategory.TOOL_RESULTS);
	});

	it("keeps a call still waiting for its result as an open block", async () => {
		const journal = new JournalFixture().user("find it").toolCall("c-1", "search");

		const blocks = await projector.project(journal.stream());

		expect(blocks[1]?.isOpen).toBe(true);
	});

	it("pairs each result with its own call when several are open", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "search")
			.toolCall("c-2", "fetch")
			.toolResult("c-2", "fetch", { body: "b" })
			.toolResult("c-1", "search", { hits: 1 });

		const blocks = await projector.project(journal.stream());

		expect(blocks.map((block) => block.callId?.value)).toEqual(["c-1", "c-2"]);
		expect(blocks.every((block) => !block.isOpen)).toBe(true);
	});

	it("refuses a result whose call is not in the journal", async () => {
		const journal = new JournalFixture().user("hi").toolResult("c-9", "search");

		await expect(projector.project(journal.stream())).rejects.toBeInstanceOf(OrphanToolResultError);
	});

	it("refuses a second result for a call that was already answered", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "search")
			.toolResult("c-1", "search", { hits: 1 })
			.toolResult("c-1", "search", { hits: 1 });

		await expect(projector.project(journal.stream())).rejects.toBeInstanceOf(OrphanToolResultError);
	});

	it("marks the exchange a skill arrived in, instead of repeating the skill somewhere else", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "activate_skill", { skillName: "refunds" })
			.toolResult("c-1", "activate_skill", { value: "the refund policy" })
			.skill("refunds", "session", "c-1");

		const blocks = await projector.project(journal.stream());

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.category).toBe(ContextCategory.ACTIVE_SKILLS);
		expect(blocks[0]?.messages[1]?.text).toContain("the refund policy");
	});

	it("never lets compaction drop the content of an active skill", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "activate_skill", { skillName: "refunds" })
			.toolResult("c-1", "activate_skill", { value: "the refund policy" })
			.skill("refunds", "session", "c-1");

		const blocks = await projector.project(journal.stream());

		expect(blocks[0]?.isRemovable).toBe(false);
	});

	it("stops marking a skill loaded for one run once another run is asking", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "activate_skill", { skillName: "refunds" })
			.toolResult("c-1", "activate_skill", { value: "the refund policy" })
			.skill("refunds", "run", "c-1");

		const blocks = await projector.project(journal.stream(), AgentRunId.from("another-run"));

		expect(blocks[0]?.category).toBe(ContextCategory.TOOL_RESULTS);
		expect(blocks[0]?.isRemovable).toBe(true);
	});

	it("projects the same journal into the same order twice", async () => {
		const journal = new JournalFixture().user("hi").toolCall("c-1", "search").toolResult("c-1", "search", { hits: 1 });

		const first = await projector.project(journal.stream());
		const second = await projector.project(journal.stream());

		expect(first.flatMap((block) => block.messages).map((message) => message.text)).toEqual(
			second.flatMap((block) => block.messages).map((message) => message.text),
		);
	});

	it("projects only the tail when the stream starts after a revision", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello").user("more");

		const blocks = await projector.project(journal.stream(SessionRevision.of(1)));

		expect(blocks.flatMap((block) => block.messages).map((message) => message.text)).toEqual(["hello", "more"]);
	});
});
