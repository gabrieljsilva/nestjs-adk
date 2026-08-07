import { ContentDigest } from "../../../common/digest/content-digest";
import { SessionId } from "../../../common/identity/session-id";
import { ToolCallId } from "../../../common/identity/tool-call-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { ContextBlock } from "../../../domain/context/context-block";
import { ContextCategory } from "../../../domain/context/context-category";
import { ContextCheckpoint } from "../../../domain/context/context-checkpoint";
import { ContextComposition } from "../../../domain/context/context-composition";
import { CheckpointRecord } from "./checkpoint-record";
import { UnreadableStoredValueError } from "./errors/unreadable-stored-value.error";
import { ModelMessageCodec } from "./model-message-codec";
import { StoredRow } from "./stored-row";

/**
 * Turns a compacted prefix into a row and back.
 *
 * Nothing could write one before this existed: the in memory adapter keeps the live
 * object and the SQLite one answers `UnsupportedStorageFeatureError`, so a durable
 * storage that kept checkpoints had no way to store one.
 *
 * What has to survive the round trip is what compaction reads. A block is the smallest
 * piece that may be dropped or kept, and `closed` and `pinned` are what decide that: a
 * call read back as answered would let compaction drop a question the model is still
 * waiting on, and a skill read back unpinned would take back knowledge the model was
 * told it had.
 */
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
			this.encodeComposition(checkpoint.composition),
			checkpoint.key,
		);
	}

	/** Takes the record this codec wrote, or the row a driver handed the adapter back. */
	public decode(values: unknown): ContextCheckpoint {
		const record = CheckpointRecord.from(values);
		return new ContextCheckpoint(
			SessionId.from(record.sessionId),
			SessionRevision.of(record.coveredRevision),
			record.strategy,
			record.strategyVersion,
			ContentDigest.of(record.prefixDigestAlgorithm, record.prefixDigestValue),
			record.blocks.map((block) => this.decodeBlock(block)),
			this.decodeComposition(record.composition),
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
			this.categoryOf(row.text("category")),
			row.array("messages").map((message) => this.messages.decode(message)),
			SessionRevision.of(row.integer("firstRevision")),
			SessionRevision.of(row.integer("lastRevision")),
			row.boolean("closed"),
			callId === undefined ? undefined : ToolCallId.from(callId),
			row.boolean("pinned"),
		);
	}

	/**
	 * Only the sizes are stored. Shares are derived from them on the way back, so a
	 * checkpoint can never come back claiming proportions its own numbers disagree with.
	 */
	private encodeComposition(composition: ContextComposition): Record<string, unknown> {
		return { sizes: composition.entries.map((entry) => [entry.category.key, entry.characters]) };
	}

	private decodeComposition(values: Readonly<Record<string, unknown>>): ContextComposition {
		const sizes = new StoredRow(values).array("sizes");
		return ContextComposition.of(
			sizes.map((entry) => {
				const row = new StoredRow(entry);
				return [this.categoryOf(row.text("0")), row.integer("1")] as const;
			}),
		);
	}

	private categoryOf(key: string): ContextCategory {
		const category = ContextCategory.of(key);
		if (category === undefined) throw new UnreadableStoredValueError("category", key);
		return category;
	}
}
