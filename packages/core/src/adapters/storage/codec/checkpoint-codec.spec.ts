import { describe, expect, it } from "vitest";
import { ContentDigest } from "../../../common/digest/content-digest";
import { SessionId } from "../../../common/identity/session-id";
import { ToolCallId } from "../../../common/identity/tool-call-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { ContextBlock } from "../../../domain/context/context-block";
import { ContextCategory } from "../../../domain/context/context-category";
import { ContextCheckpoint } from "../../../domain/context/context-checkpoint";
import { ContextComposition } from "../../../domain/context/context-composition";
import { AssistantMessage } from "../../../domain/model/assistant-message";
import { ToolCallMessage } from "../../../domain/model/tool-call-message";
import { ToolResultMessage } from "../../../domain/model/tool-result-message";
import { UserMessage } from "../../../domain/model/user-message";
import { CheckpointCodec } from "./checkpoint-codec";

const DIGEST = ContentDigest.of("sha-256", "prefix-1");

function blocks(): readonly ContextBlock[] {
	const call = new ToolCallMessage(ToolCallId.from("c-1"), "lookup", { orderId: "A-1" });
	return [
		ContextBlock.summary(new AssistantMessage("Earlier the user asked about order A-1."), SessionRevision.of(1)),
		ContextBlock.conversation(new UserMessage("and the refund?"), SessionRevision.of(2)),
		ContextBlock.exchange(
			call,
			new ToolResultMessage(ToolCallId.from("c-1"), "lookup", { total: 10 }, false),
			SessionRevision.of(3),
			SessionRevision.of(4),
		),
		ContextBlock.pendingCall(new ToolCallMessage(ToolCallId.from("c-2"), "refund", {}), SessionRevision.of(5)),
		ContextBlock.conversation(new AssistantMessage("Loaded the tone skill."), SessionRevision.of(6)).asSkill(),
	];
}

function checkpointOf(): ContextCheckpoint {
	return new ContextCheckpoint(
		SessionId.from("s-1"),
		SessionRevision.of(6),
		"token-threshold",
		2,
		DIGEST,
		blocks(),
		ContextComposition.of([
			[ContextCategory.CONVERSATION, 120],
			[ContextCategory.SUMMARIES, 40],
		]),
	);
}

/**
 * The codec no durable storage could be written with, because none existed: the in memory
 * adapter keeps the live object and the SQLite one refuses checkpoints outright.
 */
describe("CheckpointCodec", () => {
	it("encodes a checkpoint as the columns its table is made of", () => {
		const record = new CheckpointCodec().encode(checkpointOf());

		expect(record.sessionId).toBe("s-1");
		expect(record.coveredRevision).toBe(6);
		expect(record.strategy).toBe("token-threshold");
		expect(record.strategyVersion).toBe(2);
		expect(record.prefixDigestAlgorithm).toBe("sha-256");
		expect(record.prefixDigestValue).toBe("prefix-1");
	});

	/** The key is what makes writing the same checkpoint twice write it once. */
	it("carries the key an upsert keys on", () => {
		const checkpoint = checkpointOf();

		expect(new CheckpointCodec().encode(checkpoint).key).toBe(checkpoint.key);
	});

	it("brings back a checkpoint that means the same thing", () => {
		const codec = new CheckpointCodec();
		const checkpoint = checkpointOf();

		expect(codec.decode(codec.encode(checkpoint))).toEqual(checkpoint);
	});

	/**
	 * A block is the smallest piece that may be dropped or kept, never split, and what
	 * decides that is `closed` and `pinned`. Losing either turns compaction loose on a
	 * call still waiting for its result.
	 */
	it("keeps what compaction is allowed to touch", () => {
		const codec = new CheckpointCodec();

		const decoded = codec.decode(codec.encode(checkpointOf()));

		expect(decoded.blocks.map((block) => block.isRemovable)).toEqual([true, true, true, false, false]);
	});

	it("keeps the call a block is answering for", () => {
		const codec = new CheckpointCodec();

		const decoded = codec.decode(codec.encode(checkpointOf()));

		expect(decoded.blocks[2]?.callId?.value).toBe("c-1");
		expect(decoded.blocks[3]?.isOpen).toBe(true);
	});

	it("keeps which part of the prompt was taking up the room", () => {
		const codec = new CheckpointCodec();

		const decoded = codec.decode(codec.encode(checkpointOf()));

		expect(decoded.composition.charactersOf(ContextCategory.CONVERSATION)).toBe(120);
		expect(decoded.composition.characters).toBe(160);
	});

	/** A stale or foreign checkpoint has to stay detectable, which is what the digest is for. */
	it("still refuses a prefix it was not written for", () => {
		const codec = new CheckpointCodec();

		const decoded = codec.decode(codec.encode(checkpointOf()));

		expect(decoded.isUsableAt("token-threshold", 2, DIGEST)).toBe(true);
		expect(decoded.isUsableAt("token-threshold", 3, DIGEST)).toBe(false);
		expect(decoded.isUsableAt("token-threshold", 2, ContentDigest.of("sha-256", "other"))).toBe(false);
	});

	it("decodes a plain row an adapter read out of its own table", () => {
		const codec = new CheckpointCodec();
		const record = codec.encode(checkpointOf());

		const decoded = codec.decode({
			...record,
			blocks: JSON.stringify(record.blocks),
			composition: JSON.stringify(record.composition),
		});

		expect(decoded).toEqual(checkpointOf());
	});
});
