import { ContentDigest } from "../../../../common/digest/content-digest.value-object";
import { SessionId } from "../../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import { SessionRevision } from "../../../../common/revision/session-revision.value-object";
import { ContextBlock } from "../../../../domain/context/context-block.value-object";
import { ContextCategory } from "../../../../domain/context/context-category.value-object";
import { ContextCheckpoint } from "../../../../domain/context/context-checkpoint.value-object";
import { UnreadableStoredValueError } from "../errors/unreadable-stored-value.error";
import { ModelMessageCodec } from "../model-message/model-message.codec";
import { StoredRow } from "../stored-row.record";
import { CheckpointRecord } from "./checkpoint.record";

export class CheckpointCodec {
	public constructor(private readonly messages: ModelMessageCodec = new ModelMessageCodec()) {}

	public encode(checkpoint: ContextCheckpoint): CheckpointRecord {
		return new CheckpointRecord(
			checkpoint.sessionId.value,
			checkpoint.coveredRevision.value,
			checkpoint.strategy,
			checkpoint.strategyVersion,
			checkpoint.prefixDigest.algorithm,
			checkpoint.prefixDigest.value,
			checkpoint.blocks.map((block) => this.encodeBlock(block)),
			checkpoint.key,
		);
	}

	public decode(values: unknown): ContextCheckpoint {
		const record = CheckpointRecord.from(values);
		return new ContextCheckpoint(
			SessionId.from(record.sessionId),
			new SessionRevision(record.coveredRevision),
			record.strategy,
			record.strategyVersion,
			new ContentDigest(record.prefixDigestAlgorithm, record.prefixDigestValue),
			record.blocks.map((block) => this.decodeBlock(block)),
		);
	}

	private encodeBlock(block: ContextBlock): Record<string, unknown> {
		return {
			category: block.category.key,
			messages: block.messages.map((message) => this.messages.encode(message)),
			firstRevision: block.firstRevision.value,
			lastRevision: block.lastRevision.value,
			closed: block.closed,
			callId: block.callId?.value,
			pinned: block.pinned,
		};
	}

	private decodeBlock(values: unknown): ContextBlock {
		const row = new StoredRow(values);
		const callId = row.optionalText("callId");
		return ContextBlock.restore(
			this.readCategory(row.text("category")),
			row.array("messages").map((message) => this.messages.decode(message)),
			new SessionRevision(row.integer("firstRevision")),
			new SessionRevision(row.integer("lastRevision")),
			row.boolean("closed"),
			callId === undefined ? undefined : ToolCallId.from(callId),
			row.boolean("pinned"),
		);
	}

	private readCategory(key: string): ContextCategory {
		const category = ContextCategory.fromKey(key);
		if (category === undefined) throw new UnreadableStoredValueError("category", key);
		return category;
	}
}
