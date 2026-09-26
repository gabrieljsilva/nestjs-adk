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
import { SliceArtifactTool } from "./slice-artifact.tool";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const TOOL_CONTEXT = new ToolContext(
	SESSION,
	AgentRunId.from("r-1"),
	AgentName.from("support"),
	ToolCallId.from("c-1"),
);

const sales = ArtifactContent.fromText(
	["id,name,total", "1,ada,349", "2,bob,12", "3,cy,7", "4,di,90"].join("\n"),
	"text/csv",
);

function toolOf(budget = 20_000) {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { tool: SliceArtifactTool.build(new ArtifactLoader(storage), new ArtifactBudget(budget)), storage };
}

async function sliceOf(content: ArtifactContent, args: Record<string, unknown>, budget = 20_000) {
	const { tool, storage } = toolOf(budget);
	const reference = await storage.put(CTX, content);
	return (await tool.handler.invoke({ artifactId: reference.id.value, ...args }, TOOL_CONTEXT)) as Record<
		string,
		unknown
	>;
}

describe("SliceArtifactTool", () => {
	it("reads the rows and the columns it was asked for, in the order the columns were named", async () => {
		const answer = await sliceOf(sales, { fromRow: 2, toRow: 3, columns: ["total", "name"] });

		expect(answer.columns).toEqual(["total", "name"]);
		expect(answer.rows).toEqual([
			["12", "bob"],
			["7", "cy"],
		]);
		expect(answer.fromRow).toBe(2);
		expect(answer.toRow).toBe(3);
		expect(answer.totalRows).toBe(4);
	});

	it("brings every column when none was named, from the first row", async () => {
		const answer = await sliceOf(sales, { toRow: 1 });

		expect(answer.columns).toEqual(["id", "name", "total"]);
		expect(answer.rows).toEqual([["1", "ada", "349"]]);
	});

	it("refuses a column that is not there and says which ones are", async () => {
		const answer = await sliceOf(sales, { columns: ["amount"] });

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("amount");
		expect(String(answer.reason)).toContain("id, name, total");
	});

	it("refuses text that is not a table, pointing at the tools that read it", async () => {
		const answer = await sliceOf(ArtifactContent.fromText("# Report\n\nprose", "text/markdown"), {});

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("read_artifact");
	});

	it("keeps the answer inside the budget by dropping rows, and says it did", async () => {
		const wide = ArtifactContent.fromText(
			["a,b", ...Array.from({ length: 200 }, (_at, at) => `${at},${"x".repeat(40)}`)].join("\n"),
			"text/csv",
		);

		const answer = await sliceOf(wide, { toRow: 200 }, 500);

		expect(answer.truncated).toBe(true);
		expect(ArtifactBudget.measure(answer)).toBeLessThanOrEqual(500);
	});

	it("refuses arguments a model wrote badly, and bounds the ones it accepts", () => {
		const schema = toolOf().tool.schema;

		expect(schema.parse({ artifactId: "a-1", fromRow: 0 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", fromRow: 5, toRow: 2 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", columns: "name" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1" }).values).toEqual({
			artifactId: "a-1",
			fromRow: 1,
			toRow: 50,
			columns: undefined,
		});
		expect(schema.parse({ artifactId: "a-1", fromRow: 10, toRow: 5000 }).values.toRow).toBe(509);
	});
});
