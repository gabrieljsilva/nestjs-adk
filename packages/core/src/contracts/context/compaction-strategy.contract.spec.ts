import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { CompactionDecision } from "../../domain/context/compaction-decision.value-object";
import { ContextBlock } from "../../domain/context/context-block.value-object";
import { ContextProjection } from "../../domain/context/context-projection.value-object";
import { UserMessage } from "../../domain/model/messages/user-message.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { CompactionStrategy } from "./compaction-strategy.contract";

class KeepLastStrategy extends CompactionStrategy {
	public readonly name = "keep-last";
	public readonly version = 3;

	public async compact(
		_context: RunContext,
		projection: ContextProjection,
		_decision: CompactionDecision,
	): Promise<ContextProjection> {
		return projection.withBlocks(projection.blocks.slice(-1));
	}
}

const projection = new ContextProjection([
	ContextBlock.conversation(new UserMessage("older"), new SessionRevision(1)),
	ContextBlock.conversation(new UserMessage("newer"), new SessionRevision(2)),
]);

const RUN = RunContextFixture.run();

describe("CompactionStrategy", () => {
	it("names and versions itself, which is what travels inside a checkpoint", () => {
		const strategy = new KeepLastStrategy();

		expect(strategy.name).toBe("keep-last");
		expect(strategy.version).toBe(3);
	});

	it("answers with another projection", async () => {
		const compacted = await new KeepLastStrategy().compact(RUN, projection, CompactionDecision.keepShare(0.5, 1));

		expect(compacted.blocks).toHaveLength(1);
	});

	it("leaves the projection it was given untouched", async () => {
		await new KeepLastStrategy().compact(RUN, projection, CompactionDecision.keepShare(0.5, 1));

		expect(projection.blocks).toHaveLength(2);
	});

	it("receives the context, the projection and the decision, and never a model", () => {
		expect(new KeepLastStrategy().compact.length).toBe(3);
	});
});
