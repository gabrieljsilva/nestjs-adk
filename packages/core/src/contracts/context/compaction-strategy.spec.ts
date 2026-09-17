import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision";
import { CompactionDecision } from "../../domain/context/compaction-decision";
import { ContextBlock } from "../../domain/context/context-block";
import { ContextProjection } from "../../domain/context/context-projection";
import { UserMessage } from "../../domain/model/messages/user-message";
import type { RunContext } from "../../domain/run/run-context";
import type { SessionContext } from "../../domain/run/session-context";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { CompactionStrategy } from "./compaction-strategy";

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

const projection = ContextProjection.of([
	ContextBlock.conversation(new UserMessage("older"), SessionRevision.of(1)),
	ContextBlock.conversation(new UserMessage("newer"), SessionRevision.of(2)),
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
