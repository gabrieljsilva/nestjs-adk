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
import { SearchArtifactTool } from "./search-artifact.tool";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const TOOL_CONTEXT = new ToolContext(
	SESSION,
	AgentRunId.from("r-1"),
	AgentName.from("support"),
	ToolCallId.from("c-1"),
);

const log = ArtifactContent.fromText(
	["INFO start", "ERROR order A-1 failed", "INFO middle", "ERROR order A-2 failed", "INFO end"].join("\n"),
	"text/plain",
);

function toolOf(budget = 20_000) {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { tool: SearchArtifactTool.build(new ArtifactLoader(storage), new ArtifactBudget(budget)), storage };
}

async function searchIn(content: ArtifactContent, args: Record<string, unknown>, budget = 20_000) {
	const { tool, storage } = toolOf(budget);
	const reference = await storage.put(CTX, content);
	return (await tool.handler.invoke({ artifactId: reference.id.value, ...args }, TOOL_CONTEXT)) as Record<
		string,
		unknown
	>;
}

describe("SearchArtifactTool", () => {
	it("declares a literal query, with the regular expression as the exception", () => {
		const declaration = toolOf().tool.toDeclaration();

		expect(declaration.name).toBe("search_artifact");
		const parameters = JSON.stringify(declaration.parameters);
		expect(parameters).toContain("regex");
		expect(parameters).toContain("maxMatches");
	});

	it("finds a fixed string and says where each hit is", async () => {
		const found = await searchIn(log, { query: "ERROR" });

		expect(found.totalMatches).toBe(2);
		const matches = found.matches as { offset: number; line: number; excerpt: string }[];
		expect(matches[0]?.line).toBe(2);
		expect(matches[1]?.line).toBe(4);
		expect(matches[0]?.excerpt).toContain("ERROR order A-1 failed");
	});

	it("treats the query literally unless it was told otherwise, so a dot is a dot", async () => {
		const found = await searchIn(ArtifactContent.fromText("a.b and axb", "text/plain"), { query: "a.b" });

		expect(found.totalMatches).toBe(1);
		expect(found.isRegex).toBe(false);
	});

	it("reads the query as a pattern when it was asked to", async () => {
		const found = await searchIn(log, { query: "A-\\d", regex: true });

		expect(found.isRegex).toBe(true);
		expect(found.totalMatches).toBe(2);
	});

	it("refuses a pattern that could backtrack, as something the model can correct", async () => {
		const found = await searchIn(log, { query: "(a+)+b", regex: true });

		expect(found.refused).toBe(true);
		expect(String(found.reason)).toContain("repeated group");
		expect(found.matches).toEqual([]);
	});

	it("brings back the number of matches it was asked for, and counts the rest", async () => {
		const found = await searchIn(ArtifactContent.fromText("x".repeat(50), "text/plain"), { query: "x", maxMatches: 3 });

		expect((found.matches as unknown[]).length).toBe(3);
		expect(found.totalMatches).toBe(50);
	});

	it("shows as much around a match as it was asked for", async () => {
		const found = await searchIn(log, { query: "middle", context: 0 });

		expect((found.matches as { excerpt: string }[])[0]?.excerpt).toBe("middle");
	});

	it("keeps the answer inside the budget by dropping matches, and says it did", async () => {
		const found = await searchIn(ArtifactContent.fromText("x".repeat(400), "text/plain"), { query: "x" }, 200);

		expect(found.truncated).toBe(true);
		expect(ArtifactBudget.measure(found)).toBeLessThanOrEqual(200);
	});

	it("refuses arguments a model wrote badly, instead of trusting them", () => {
		const schema = toolOf().tool.schema;

		expect(schema.parse({ artifactId: "a-1" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", query: "" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", query: "x", regex: "yes" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", query: "x", mode: "everything" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", query: "x" }).values).toEqual({
			artifactId: "a-1",
			query: "x",
			regex: false,
			caseSensitive: true,
			mode: "excerpts",
			maxMatches: 20,
			context: 80,
		});
	});

	it("matches letters exactly unless told not to, and never lets the model pick the flags", async () => {
		const exact = await searchIn(log, { query: "error" });
		const loose = await searchIn(log, { query: "error", caseSensitive: false });
		const pattern = await searchIn(log, { query: "error order", regex: true, caseSensitive: false });

		expect(exact.totalMatches).toBe(0);
		expect(loose.totalMatches).toBe(2);
		expect(pattern.totalMatches).toBe(2);
	});

	it("answers the whole line of each match in lines mode, which is what a grep shows", async () => {
		const found = await searchIn(log, { query: "A-2", mode: "lines" });

		expect(found.matches).toEqual([{ offset: 58, line: 4, text: "ERROR order A-2 failed" }]);
	});

	it("answers only how many in count mode, spending nothing on excerpts", async () => {
		const found = await searchIn(log, { query: "INFO", mode: "count" });

		expect(found.totalMatches).toBe(3);
		expect(found.matches).toBeUndefined();
		expect(found.countStopped).toBe(false);
	});

	it("counts past the matches it returns, instead of reporting the page as the total", async () => {
		const found = await searchIn(ArtifactContent.fromText("x".repeat(2_500), "text/plain"), { query: "x" });

		expect((found.matches as unknown[]).length).toBe(20);
		expect(found.totalMatches).toBe(2_500);
	});

	it("says when it stopped counting, so a ceiling never reads as an exact total", async () => {
		const many = ArtifactContent.fromText("x".repeat(SearchArtifactTool.MAX_COUNTED_MATCHES + 5), "text/plain");

		const found = await searchIn(many, { query: "x", mode: "count" });

		expect(found.totalMatches).toBe(SearchArtifactTool.MAX_COUNTED_MATCHES);
		expect(found.countStopped).toBe(true);
	});
});
