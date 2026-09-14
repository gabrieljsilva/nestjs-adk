import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { AttachmentResolver } from "../../contracts/attachment-resolver";
import { ContextCategory } from "../../domain/context/context-category";
import { OrphanToolResultError } from "../../domain/context/errors/orphan-tool-result.error";
import { AttachmentProjection } from "../../domain/model/attachment-projection";
import { AttachmentReference } from "../../domain/model/attachment-reference";
import type { AttachmentRequest } from "../../domain/model/attachment-request";
import { ToolCallMessage } from "../../domain/model/tool-call-message";
import { ToolResultMessage } from "../../domain/model/tool-result-message";
import { SessionContext } from "../../domain/run/session-context";
import { JournalFixture } from "../../support/context/journal.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AttachmentReader } from "../artifact/attachment-reader";
import { ContextProjector } from "./context-projector";

const projector = new ContextProjector();

/** Stands every attachment down to a note, which is the observable half of resolving. */
class NotingResolver extends AttachmentResolver {
	public async resolve(_context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		return AttachmentProjection.noteFor(request.reference, "kept away");
	}
}

function storageOf(): InMemoryArtifactStorage {
	return new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
}

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("ContextProjector", () => {
	it("projects a conversation in journal order", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello").user("more");

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks.flatMap((block) => block.messages).map((message) => message.text)).toEqual(["hi", "hello", "more"]);
	});

	it("leaves facts that are history out of the context", async () => {
		const journal = new JournalFixture().runStarted().user("hi");

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks).toHaveLength(1);
	});

	it("closes a call with the result that answers it, in the position the call held", async () => {
		const journal = new JournalFixture()
			.user("find it")
			.toolCall("c-1", "search", { q: "x" })
			.toolResult("c-1", "search", { hits: 2 })
			.assistant("found two");

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks).toHaveLength(3);
		expect(blocks[1]?.isOpen).toBe(false);
		expect(blocks[1]?.messages[0]).toBeInstanceOf(ToolCallMessage);
		expect(blocks[1]?.messages[1]).toBeInstanceOf(ToolResultMessage);
		expect(blocks[1]?.category).toBe(ContextCategory.TOOL_RESULTS);
	});

	it("keeps a call still waiting for its result as an open block", async () => {
		const journal = new JournalFixture().user("find it").toolCall("c-1", "search");

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks[1]?.isOpen).toBe(true);
	});

	it("keeps calls made in one breath in one block, every result after every call", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "search")
			.toolCall("c-2", "fetch")
			.toolResult("c-2", "fetch", { body: "b" })
			.toolResult("c-1", "search", { hits: 1 });

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.callId?.value).toBe("c-1");
		expect(blocks[0]?.isOpen).toBe(false);
		expect(blocks[0]?.messages.map((message) => message.role)).toEqual([
			"tool-call",
			"tool-call",
			"tool-result",
			"tool-result",
		]);
	});

	it("keeps a call made after a result in a block of its own, because it was a second breath", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "search")
			.toolResult("c-1", "search", { hits: 1 })
			.toolCall("c-2", "fetch")
			.toolResult("c-2", "fetch", { body: "b" });

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks.map((block) => block.callId?.value)).toEqual(["c-1", "c-2"]);
		expect(blocks.every((block) => !block.isOpen)).toBe(true);
	});

	it("keeps one breath open while any of its calls still waits, so compaction cannot touch it", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "search")
			.toolCall("c-2", "fetch")
			.toolResult("c-1", "search", { hits: 1 });

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.isOpen).toBe(true);
	});

	it("refuses a result whose call is not in the journal", async () => {
		const journal = new JournalFixture().user("hi").toolResult("c-9", "search");

		await expect(projector.project(CTX, journal.stream())).rejects.toBeInstanceOf(OrphanToolResultError);
	});

	it("refuses a second result for a call that was already answered", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "search")
			.toolResult("c-1", "search", { hits: 1 })
			.toolResult("c-1", "search", { hits: 1 });

		await expect(projector.project(CTX, journal.stream())).rejects.toBeInstanceOf(OrphanToolResultError);
	});

	it("marks the exchange a skill arrived in, instead of repeating the skill somewhere else", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "activate_skill", { skillName: "refunds" })
			.toolResult("c-1", "activate_skill", { value: "the refund policy" })
			.skill("refunds", "session", "c-1");

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.category).toBe(ContextCategory.ACTIVE_SKILLS);
		expect(blocks[0]?.messages[1]?.text).toContain("the refund policy");
	});

	it("never lets compaction drop the content of an active skill", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "activate_skill", { skillName: "refunds" })
			.toolResult("c-1", "activate_skill", { value: "the refund policy" })
			.skill("refunds", "session", "c-1");

		const blocks = await projector.project(CTX, journal.stream());

		expect(blocks[0]?.isRemovable).toBe(false);
	});

	it("stops marking a skill loaded for one run once another run is asking", async () => {
		const journal = new JournalFixture()
			.toolCall("c-1", "activate_skill", { skillName: "refunds" })
			.toolResult("c-1", "activate_skill", { value: "the refund policy" })
			.skill("refunds", "run", "c-1");

		const blocks = await projector.project(CTX, journal.stream(), AgentRunId.from("another-run"));

		expect(blocks[0]?.category).toBe(ContextCategory.TOOL_RESULTS);
		expect(blocks[0]?.isRemovable).toBe(true);
	});

	it("projects the same journal into the same order twice", async () => {
		const journal = new JournalFixture().user("hi").toolCall("c-1", "search").toolResult("c-1", "search", { hits: 1 });

		const first = await projector.project(CTX, journal.stream());
		const second = await projector.project(CTX, journal.stream());

		expect(first.flatMap((block) => block.messages).map((message) => message.text)).toEqual(
			second.flatMap((block) => block.messages).map((message) => message.text),
		);
	});

	it("projects only the tail when the stream starts after a revision", async () => {
		const journal = new JournalFixture().user("hi").assistant("hello").user("more");

		const blocks = await projector.project(CTX, journal.stream(SessionRevision.of(1)));

		expect(blocks.flatMap((block) => block.messages).map((message) => message.text)).toEqual(["hello", "more"]);
	});

	it("reads a note into the message text, so the words still explain what stood there", async () => {
		const noting = new ContextProjector(new AttachmentReader(storageOf(), new NotingResolver()));
		const journal = new JournalFixture().user("describe this", [AttachmentReference.external("f-1", "image/png")]);

		const blocks = await noting.project(CTX, journal.stream());

		expect(blocks[0]?.messages[0]?.text).toBe("describe this\n\n[attachment image/png: kept away]");
	});

	it("annotates a tool output with the note, leaving the tool's own answer intact", async () => {
		const noting = new ContextProjector(new AttachmentReader(storageOf(), new NotingResolver()));
		const journal = new JournalFixture()
			.user("chart it")
			.toolCall("c-1", "render")
			.toolResult("c-1", "render", { rows: 3 }, false, [AttachmentReference.external("f-1", "image/png")]);

		const blocks = await noting.project(CTX, journal.stream());
		const result = blocks[1]?.messages[1] as ToolResultMessage;

		expect(result.output).toEqual({ rows: 3, "[attachments]": "[attachment image/png: kept away]" });
		expect(result.media).toEqual([]);
	});

	it("tells the resolver whether the attachment belongs to the run being served", async () => {
		const seen: boolean[] = [];
		const witness = new (class extends AttachmentResolver {
			public async resolve(_context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
				seen.push(request.isCurrentRun);
				return AttachmentProjection.omit();
			}
		})();
		const observing = new ContextProjector(new AttachmentReader(storageOf(), witness));
		const journal = new JournalFixture().user("look", [AttachmentReference.external("f-1", "image/png")]);

		await observing.project(CTX, journal.stream(), AgentRunId.from("run-1"));
		await observing.project(CTX, journal.stream(), AgentRunId.from("run-2"));

		expect(seen).toEqual([true, false]);
	});
});
