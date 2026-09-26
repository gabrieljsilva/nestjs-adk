import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { CanonicalJson } from "../../common/serialization/canonical-json.service";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ToolContext } from "../../domain/tool/invocation/tool-context.value-object";
import { RuntimeToolRequest } from "../../domain/tool/runtime-tool-request.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { ArtifactBudget } from "./artifact-budget.value-object";
import { ArtifactExplorationTools, ArtifactExplorer } from "./artifact-explorer.service";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const OTHER = SessionId.from("s-2");
const THRESHOLD = 1_200;

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
	it("owns the five tools that answer a question about an artifact without bringing it back", () => {
		const explorer = new ArtifactExplorer(new InMemoryArtifactStorage(new SequenceIdGenerator("a")));

		expect(explorer.getTools().map((tool) => tool.name)).toEqual([
			"list_artifacts",
			"outline_artifact",
			"search_artifact",
			"query_artifact",
			"slice_artifact",
		]);
	});

	it("declares every one of them a read, so an approval policy that holds writes holds none of them", () => {
		const explorer = new ArtifactExplorer(new InMemoryArtifactStorage(new SequenceIdGenerator("a")));

		for (const tool of explorer.getTools()) expect(tool.effect).toBe(ToolEffect.READ);
	});

	it("keeps every answer inside the offload budget, so an answer about an artifact never becomes one", async () => {
		const { invoke } = await exploreWith(ArtifactContent.fromText(buildLargeJson(), "application/json"));

		const answers = [
			await invoke("outline_artifact", { depth: 6 }),
			await invoke("search_artifact", { query: "late delivery", maxMatches: 100, context: 400 }),
			await invoke("query_artifact", { pointer: "" }),
			await invoke("query_artifact", { pointer: "/orders" }),
		];

		for (const answer of answers) expect(ArtifactBudget.measure(answer)).toBeLessThanOrEqual(THRESHOLD);
	});

	it("answers under the threshold that would offload it, which is what stops an answer becoming an artifact", async () => {
		const policy = CharacterCountOffloadPolicy.above(THRESHOLD);
		const { invoke } = await exploreWith(ArtifactContent.fromText(buildLargeJson(), "application/json"));

		const answers = [
			await invoke("list_artifacts", {}),
			await invoke("outline_artifact", { depth: 6 }),
			await invoke("search_artifact", { query: "late delivery", maxMatches: 100, context: 400 }),
			await invoke("query_artifact", { pointer: "" }),
		];

		for (const answer of answers) {
			const decision = policy.decide(CanonicalJson.stringify(answer).length, "application/json");
			expect(decision.isInline).toBe(true);
		}
	});

	it("says when it cut an answer, because a model told it saw everything will act on half", async () => {
		const { invoke } = await exploreWith(ArtifactContent.fromText(buildLargeJson(), "application/json"));

		const found = await invoke("search_artifact", { query: "late delivery", maxMatches: 100 });

		expect(found.truncated).toBe(true);
		expect(found.totalMatches).toBe(200);
		expect((found.matches as unknown[]).length).toBeLessThan(100);
	});

	it("refuses to explore an artifact over the ceiling, with the range read as the way out", async () => {
		const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
		const explorer = new ArtifactExplorer(
			storage,
			CharacterCountOffloadPolicy.above(THRESHOLD),
			new ArtifactBudget(THRESHOLD, 100),
		);
		const reference = await storage.put(CTX, ArtifactContent.fromText("x".repeat(101), "text/plain"));
		const search = explorer.getTools().find((tool) => tool.name === "search_artifact");
		if (search === undefined) throw new Error("expected search_artifact");

		const answer = (await search.handler.invoke(
			{ artifactId: reference.id.value, query: "x" },
			contextOf(SESSION),
		)) as Record<string, unknown>;

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("100");
		expect(String(answer.reason)).toContain("read_artifact(offset, limit)");
	});

	it("reads none of them for another session, even with the right id", async () => {
		const { invoke } = await exploreWith(ArtifactContent.fromText(buildLargeJson(), "application/json"));

		await expect(invoke("outline_artifact", {}, OTHER)).rejects.toBeInstanceOf(ArtifactNotFoundError);
		await expect(invoke("search_artifact", { query: "A-1" }, OTHER)).rejects.toBeInstanceOf(ArtifactNotFoundError);
		await expect(invoke("query_artifact", { pointer: "" }, OTHER)).rejects.toBeInstanceOf(ArtifactNotFoundError);
	});
});

describe("ArtifactExplorationTools", () => {
	const explorer = new ArtifactExplorer(new InMemoryArtifactStorage(new SequenceIdGenerator("a")));

	it("names every tool the explorer builds, so listing the group leaves none of them out", () => {
		const asked = ArtifactExplorationTools.map((tool) => tool.request().name);

		expect(asked).toEqual(explorer.getTools().map((tool) => tool.name));
	});

	it("asks for a request and never for something that runs, whatever an agent lists it beside", () => {
		for (const tool of ArtifactExplorationTools) expect(tool.request()).toBeInstanceOf(RuntimeToolRequest);
	});

	it("declares to the model exactly what the bound tool declares, so opting in changes nothing it reads", () => {
		for (const tool of ArtifactExplorationTools) {
			const asked = tool.request().toDeclaration();
			const built = explorer
				.getTools()
				.find((candidate) => candidate.name === asked.name)
				?.toDeclaration();

			expect(built?.description).toBe(asked.description);
			expect(built?.parameters).toEqual(asked.parameters);
		}
	});

	it("leaves read_artifact out, because every agent with tools already has it", () => {
		expect(ArtifactExplorationTools.map((tool) => tool.request().name)).not.toContain("read_artifact");
	});
});
