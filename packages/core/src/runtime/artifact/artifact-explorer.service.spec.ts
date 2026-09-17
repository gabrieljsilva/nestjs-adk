import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { ToolContext } from "../../domain/tool/invocation/tool-context.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { ArtifactBudget } from "./artifact-budget.value-object";
import { ArtifactExplorer } from "./artifact-explorer.service";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const OTHER = SessionId.from("s-2");
const THRESHOLD = 600;

function contextOf(sessionId: SessionId): ToolContext {
	return new ToolContext(sessionId, AgentRunId.from("run-1"), AgentName.from("support"), ToolCallId.from("c-1"));
}

/** A document larger than the budget, so every answer about it has to be one that fits. */
function buildLargeJson(): string {
	return JSON.stringify({
		orders: Array.from({ length: 200 }, (_at, index) => ({ id: `A-${index}`, total: index, note: "late delivery" })),
	});
}

async function exploreWith(content: ArtifactContent): Promise<{
	invoke: (tool: string, args: Record<string, unknown>, sessionId?: SessionId) => Promise<Record<string, unknown>>;
	artifactId: string;
}> {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	const explorer = new ArtifactExplorer(storage, CharacterCountOffloadPolicy.above(THRESHOLD));
	const reference = await storage.put(CTX, content);
	const invoke = async (tool: string, args: Record<string, unknown>, sessionId: SessionId = SESSION) => {
		const definition = explorer.getTools().find((candidate) => candidate.name === tool);
		if (definition === undefined) throw new Error(`no tool named ${tool}`);
		return (await definition.handler.invoke({ artifactId: reference.id.value, ...args }, contextOf(sessionId))) as Record<
			string,
			unknown
		>;
	};
	return { invoke, artifactId: reference.id.value };
}

describe("ArtifactExplorer", () => {
	it("owns the three tools that answer a question about an artifact without bringing it back", () => {
		const explorer = new ArtifactExplorer(new InMemoryArtifactStorage(new SequenceIdGenerator("a")));

		expect(explorer.getTools().map((tool) => tool.name)).toEqual([
			"outline_artifact",
			"search_artifact",
			"query_artifact",
		]);
	});

	it("marks every one of them internal, so no approval policy can stop a model reading what it was told to read", () => {
		const explorer = new ArtifactExplorer(new InMemoryArtifactStorage(new SequenceIdGenerator("a")));

		for (const tool of explorer.getTools()) expect(tool.internal).toBe(true);
	});

	it("keeps every answer inside the offload budget, so an answer about an artifact never becomes one", async () => {
		const { invoke } = await exploreWith(new ArtifactContent(buildLargeJson(), "application/json"));

		const answers = [
			await invoke("outline_artifact", { depth: 6 }),
			await invoke("search_artifact", { query: "late delivery", maxMatches: 100, context: 400 }),
			await invoke("query_artifact", { pointer: "" }),
			await invoke("query_artifact", { pointer: "/orders" }),
		];

		for (const answer of answers) expect(ArtifactBudget.measure(answer)).toBeLessThanOrEqual(THRESHOLD);
	});

	it("says when it cut an answer, because a model told it saw everything will act on half", async () => {
		const { invoke } = await exploreWith(new ArtifactContent(buildLargeJson(), "application/json"));

		const found = await invoke("search_artifact", { query: "late delivery", maxMatches: 100 });

		expect(found.truncated).toBe(true);
		expect(found.totalMatches).toBe(100);
		expect((found.matches as unknown[]).length).toBeLessThan(100);
	});

	it("reads none of them for another session, even with the right id", async () => {
		const { invoke } = await exploreWith(new ArtifactContent(buildLargeJson(), "application/json"));

		await expect(invoke("outline_artifact", {}, OTHER)).rejects.toBeInstanceOf(ArtifactNotFoundError);
		await expect(invoke("search_artifact", { query: "A-1" }, OTHER)).rejects.toBeInstanceOf(ArtifactNotFoundError);
		await expect(invoke("query_artifact", { pointer: "" }, OTHER)).rejects.toBeInstanceOf(ArtifactNotFoundError);
	});
});
