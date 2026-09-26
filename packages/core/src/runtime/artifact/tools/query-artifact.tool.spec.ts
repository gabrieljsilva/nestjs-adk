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
import { ArtifactNotExplorableError } from "../errors/artifact-not-explorable.error";
import { QueryArtifactTool } from "./query-artifact.tool";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const TOOL_CONTEXT = new ToolContext(
	SESSION,
	AgentRunId.from("r-1"),
	AgentName.from("support"),
	ToolCallId.from("c-1"),
);

const document = ArtifactContent.fromText(
	JSON.stringify({ orders: [{ id: "A-1", total: 349 }], customer: { name: "ada" } }),
	"application/json",
);

function toolOf(budget = 20_000) {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { tool: QueryArtifactTool.build(new ArtifactLoader(storage), new ArtifactBudget(budget)), storage };
}

async function queryIn(content: ArtifactContent, pointer: string, budget = 20_000) {
	const { tool, storage } = toolOf(budget);
	const reference = await storage.put(CTX, content);
	return (await tool.handler.invoke({ artifactId: reference.id.value, pointer }, TOOL_CONTEXT)) as Record<
		string,
		unknown
	>;
}

describe("QueryArtifactTool", () => {
	it("declares a pointer and nothing that could be evaluated", () => {
		const declaration = toolOf().tool.toDeclaration();

		expect(declaration.name).toBe("query_artifact");
		expect(JSON.stringify(declaration.parameters)).toContain("6901");
	});

	it("reads one value out by pointer", async () => {
		const answer = await queryIn(document, "/orders/0/total");

		expect(answer.value).toBe(349);
		expect(answer.found).toBe(true);
		expect(answer.truncated).toBe(false);
	});

	it("reads the whole document for the empty pointer", async () => {
		expect((await queryIn(document, "")).value).toEqual(JSON.parse(document.text));
	});

	it("says a value is absent rather than inventing one", async () => {
		const answer = await queryIn(document, "/orders/9/total");

		expect(answer.found).toBe(false);
		expect(answer.value).toBeNull();
	});

	it("outlines a value that would not fit, so the next call is a deeper pointer", async () => {
		const wide = ArtifactContent.fromText(
			JSON.stringify({ rows: Array.from({ length: 200 }, (_at, at) => ({ at, note: "something" })) }),
			"application/json",
		);

		const answer = await queryIn(wide, "/rows", 300);

		expect(answer.value).toBeUndefined();
		expect(answer.valueOutline).toBeDefined();
		expect(ArtifactBudget.measure(answer)).toBeLessThanOrEqual(300);
	});

	it("refuses a pointer into an artifact that is not a JSON document", async () => {
		await expect(queryIn(ArtifactContent.fromText("ERROR: a log line", "text/plain"), "/orders")).rejects.toBeInstanceOf(
			ArtifactNotExplorableError,
		);
	});

	it("accepts a pointer and nothing else, so no filter or expression ever reaches an evaluator", () => {
		const schema = toolOf().tool.schema;

		expect(schema.parse({ artifactId: "a-1", pointer: "/orders/0" }).isValid).toBe(true);
		expect(schema.parse({ artifactId: "a-1", pointer: "" }).isValid).toBe(true);
		expect(schema.parse({ artifactId: "a-1", pointer: "$.orders[?(@.total>100)]" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", pointer: "orders.0" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1" }).isValid).toBe(false);
	});
});
