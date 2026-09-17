import { describe, expect, it } from "vitest";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { ContextProjection } from "../../domain/context/context-projection.value-object";
import { ContextSegment } from "../../domain/diagnostics/context-segment.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { ToolDeclaration } from "../../domain/model/messages/tool-declaration.value-object";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions.value-object";
import { ContextPhotographer } from "./context-photographer.service";

const SUPPORT = AgentName.from("support");
const MODEL = ModelIdentity.of("acme", "primary");

function projectionOf(tools: readonly ToolDeclaration[] = []): ContextProjection {
	return ContextProjection.of([], tools, undefined, PromptInstructions.from("Be brief."));
}

describe("ContextPhotographer", () => {
	it("splits the context into the three sections a provider receives", () => {
		const snapshot = new ContextPhotographer().of(SUPPORT, MODEL, projectionOf());

		expect(snapshot.segments.map((segment) => segment.kind)).toEqual([
			ContextSegment.INSTRUCTIONS,
			ContextSegment.TOOLS,
			ContextSegment.CONVERSATION,
		]);
	});

	it("keeps the agent prompt where a comparison can find it", () => {
		const snapshot = new ContextPhotographer().of(SUPPORT, MODEL, projectionOf());

		expect(snapshot.segment(ContextSegment.INSTRUCTIONS)?.text).toContain("Be brief.");
	});

	it("produces the same bytes twice for the same context", () => {
		const photographer = new ContextPhotographer();
		const tools = [new ToolDeclaration("lookup_order", "finds an order", { type: "object" })];

		const first = photographer.of(SUPPORT, MODEL, projectionOf(tools));
		const second = photographer.of(SUPPORT, MODEL, projectionOf(tools));

		expect(first.text).toBe(second.text);
	});

	it("names the tools, because a declaration that moved is a cache that broke", () => {
		const tools = [new ToolDeclaration("lookup_order", "finds an order", { type: "object" })];

		const snapshot = new ContextPhotographer().of(SUPPORT, MODEL, projectionOf(tools));

		expect(snapshot.segment(ContextSegment.TOOLS)?.text).toContain("lookup_order");
	});
});
