import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../../adapters/storage/in-memory-artifact-storage.adapter";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { SequenceIdGenerator } from "../../../support/sequence-id-generator.double";
import { ArtifactBudget } from "../artifact-budget.value-object";
import { ArtifactLoader } from "../artifact-loader.service";
import { OutlineArtifactTool } from "./outline-artifact.tool";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const TOOL_CONTEXT = new ToolContext(
	SESSION,
	AgentRunId.from("r-1"),
	AgentName.from("support"),
	ToolCallId.from("c-1"),
);

async function outlineOf(content: ArtifactContent, args: Record<string, unknown> = {}, budget = 20_000) {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	const tool = OutlineArtifactTool.build(new ArtifactLoader(storage), new ArtifactBudget(budget));
	const reference = await storage.put(CTX, content);
	return (await tool.handler.invoke({ artifactId: reference.id.value, ...args }, TOOL_CONTEXT)) as Record<
		string,
		unknown
	>;
}

const document = new ArtifactContent(
	JSON.stringify({ orders: [{ id: "A-1", total: 349 }], customer: { name: "ada", tier: "gold" } }),
	"application/json",
);

describe("OutlineArtifactTool", () => {
	it("declares the id and how deep to go", () => {
		const declaration = OutlineArtifactTool.build(
			new ArtifactLoader(new InMemoryArtifactStorage(new SequenceIdGenerator("a"))),
			new ArtifactBudget(100),
		).toDeclaration();

		expect(declaration.name).toBe("outline_artifact");
		expect(JSON.stringify(declaration.parameters)).toContain("depth");
	});

	it("names the keys and the types of a JSON document without carrying a value", async () => {
		const answer = await outlineOf(document);

		expect(answer.kind).toBe("json");
		const outline = answer.outline as Record<string, unknown>;
		expect(Object.keys(outline.properties as Record<string, unknown>)).toEqual(["orders", "customer"]);
		expect(JSON.stringify(outline)).not.toContain("ada");
	});

	it("opens two levels when nobody said how many", async () => {
		const outline = (await outlineOf(document)).outline as Record<string, unknown>;
		const properties = outline.properties as Record<string, Record<string, unknown>>;
		const orders = properties.orders as Record<string, unknown>;

		expect(orders.type).toBe("array");
		expect(orders.items).toEqual(["object(2 keys)"]);
	});

	it("opens as far as it was told to", async () => {
		const outline = (await outlineOf(document, { depth: 3 })).outline as Record<string, unknown>;
		const properties = outline.properties as Record<string, Record<string, unknown>>;
		const items = (properties.orders as Record<string, unknown>).items as Record<string, unknown>[];

		expect(items[0]?.properties).toEqual({
			id: "string(3 characters)",
			total: "number",
		});
	});

	it("measures text instead, and shows how it starts", async () => {
		const answer = await outlineOf(new ArtifactContent("first\nsecond\nthird", "text/plain"));

		expect(answer.kind).toBe("text");
		expect(answer.lines).toBe(3);
		expect(answer.characters).toBe(18);
		expect(answer.bytes).toBe(18);
		expect(answer.firstLines).toEqual(["first", "second", "third"]);
	});

	it("counts bytes and characters apart, because one is the wire and the other the window", async () => {
		const answer = await outlineOf(new ArtifactContent("café", "text/plain"));

		expect(answer.characters).toBe(4);
		expect(answer.bytes).toBe(5);
	});

	it("answers shallower rather than not at all when the outline does not fit", async () => {
		const wide = JSON.stringify(Object.fromEntries(Array.from({ length: 300 }, (_at, at) => [`key-${at}`, { at }])));

		const answer = await outlineOf(new ArtifactContent(wide, "application/json"), { depth: 6 }, 200);

		expect(ArtifactBudget.measure(answer)).toBeLessThanOrEqual(200);
		expect(answer.outline).toBeDefined();
	});

	it("refuses a depth that is not one, instead of guessing", () => {
		const schema = OutlineArtifactTool.build(
			new ArtifactLoader(new InMemoryArtifactStorage(new SequenceIdGenerator("a"))),
			new ArtifactBudget(100),
		).schema;

		expect(schema.parse({ artifactId: "a-1", depth: -1 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", depth: "deep" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1" }).values.depth).toBe(2);
		expect(schema.parse({ artifactId: "a-1", depth: 99 }).values.depth).toBe(6);
	});
});
