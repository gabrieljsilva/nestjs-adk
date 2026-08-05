import { describe, expect, it } from "vitest";
import { SessionRevision } from "../common/revision/session-revision";
import { CompactionDecision } from "../domain/context/compaction-decision";
import { ContextBlock } from "../domain/context/context-block";
import { ContextProjection } from "../domain/context/context-projection";
import { UserMessage } from "../domain/model/user-message";
import { CompactionStrategy } from "./compaction-strategy";

class KeepLastStrategy extends CompactionStrategy {
	public readonly name = "keep-last";
	public readonly version = 3;

	public async compact(projection: ContextProjection, _decision: CompactionDecision): Promise<ContextProjection> {
		return projection.withBlocks(projection.blocks.slice(-1));
	}
}

const projection = ContextProjection.of([
	ContextBlock.conversation(new UserMessage("older"), SessionRevision.of(1)),
	ContextBlock.conversation(new UserMessage("newer"), SessionRevision.of(2)),
]);

describe("CompactionStrategy", () => {
	it("names and versions itself, which is what travels inside a checkpoint", () => {
		const strategy = new KeepLastStrategy();

		expect(strategy.name).toBe("keep-last");
		expect(strategy.version).toBe(3);
	});

	it("answers with another projection", async () => {
		const compacted = await new KeepLastStrategy().compact(projection, CompactionDecision.keepShare(0.5, 1));

		expect(compacted.blocks).toHaveLength(1);
	});

	it("leaves the projection it was given untouched", async () => {
		await new KeepLastStrategy().compact(projection, CompactionDecision.keepShare(0.5, 1));

		expect(projection.blocks).toHaveLength(2);
	});

	it("receives no model, because no provider answers how big a prompt is before the call", () => {
		expect(new KeepLastStrategy().compact.length).toBe(2);
	});
});
