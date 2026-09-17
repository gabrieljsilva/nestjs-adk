import { describe, expect, it } from "vitest";
import { ContentDigest } from "../../common/digest/content-digest.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { ModelContextWindow } from "../model/descriptor/model-context-window.value-object";
import { UserMessage } from "../model/messages/user-message.value-object";
import { ContextBlock } from "./context-block.value-object";
import { ContextBudget } from "./context-budget.value-object";
import { ContextProjection } from "./context-projection.value-object";
import { PreparedModelContext } from "./prepared-model-context.value-object";

const DIGEST = ContentDigest.of("sha256", "abc123");
const R1 = SessionRevision.of(1);

function prepare(message = new UserMessage("hi")): PreparedModelContext {
	const projection = ContextProjection.of([ContextBlock.conversation(message, R1)]);
	const budget = new ContextBudget(ModelContextWindow.of(1000, 100), undefined, message.text.length);
	return new PreparedModelContext(projection, budget, DIGEST);
}

describe("PreparedModelContext", () => {
	it("builds the request from the projection", () => {
		expect(prepare().request.messages.map((message) => message.text)).toEqual(["hi"]);
	});

	it("reports the size of its budget, in characters rather than tokens", () => {
		expect(prepare().characters).toBe(2);
	});

	it("reports the revision its projection covers", () => {
		expect(prepare().coveredRevision.value).toBe(1);
	});

	it("is not compacted unless it says so", () => {
		expect(prepare().compacted).toBe(false);
	});

	it("is frozen, down to the projection and its blocks", () => {
		const prepared = prepare();

		expect(Object.isFrozen(prepared)).toBe(true);
		expect(Object.isFrozen(prepared.projection)).toBe(true);
		expect(Object.isFrozen(prepared.projection.blocks)).toBe(true);
		expect(Object.isFrozen(prepared.request)).toBe(true);
	});

	it("refuses a compaction written as a mutation", () => {
		const prepared = prepare();
		const first = prepared.projection.blocks[0];

		expect(Reflect.set(prepared.projection.blocks, 0, undefined)).toBe(false);
		expect(Reflect.set(prepared, "compacted", true)).toBe(false);
		expect(prepared.projection.blocks[0]).toBe(first);
		expect(prepared.compacted).toBe(false);
	});

	it("keeps referential identity of the messages it was given", () => {
		const message = new UserMessage("hi");

		const prepared = prepare(message);

		expect(prepared.projection.blocks[0]?.messages[0]).toBe(message);
	});
});
