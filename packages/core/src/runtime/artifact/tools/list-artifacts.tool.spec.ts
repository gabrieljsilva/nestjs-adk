import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../../adapters/storage/in-memory-artifact-storage.adapter";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { ArtifactName } from "../../../domain/artifact/artifact-name.value-object";
import { CharacterCountOffloadPolicy } from "../../../domain/artifact/character-count-offload.policy";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { SequenceIdGenerator } from "../../../support/sequence-id-generator.double";
import { ArtifactBudget } from "../artifact-budget.value-object";
import { ListArtifactsTool } from "./list-artifacts.tool";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const OTHER_CTX = SessionContext.fromSessionId(SessionId.from("s-2"));
const TOOL_CONTEXT = new ToolContext(
	SESSION,
	AgentRunId.from("r-1"),
	AgentName.from("support"),
	ToolCallId.from("c-1"),
);

interface Listed {
	artifactId: string;
	name?: string;
	mediaType: string;
	isText: boolean;
	characters?: number;
	bytes: number;
	explorable: boolean;
}

function toolOf(threshold = 5, budget = 20_000) {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	const tool = ListArtifactsTool.build(
		storage,
		CharacterCountOffloadPolicy.above(threshold),
		new ArtifactBudget(budget),
	);
	return { storage, tool };
}

async function listWith(storage: InMemoryArtifactStorage, tool: ReturnType<typeof toolOf>["tool"]) {
	return (await tool.handler.invoke({}, TOOL_CONTEXT)) as { artifacts: Listed[]; truncated?: boolean };
}

describe("ListArtifactsTool", () => {
	it("takes no arguments and belongs to the runtime", () => {
		const { tool } = toolOf();

		expect(tool.name).toBe("list_artifacts");
		expect(tool.effect).toBe(ToolEffect.READ);
		expect(tool.schema.parse({ anything: 1 }).isValid).toBe(true);
	});

	it("lists what the session owns, newest first, with the name and whether its shape is explorable", async () => {
		const { storage, tool } = toolOf();
		await storage.put(CTX, ArtifactContent.fromText("a,b\n1,2\n3,4", "text/csv", ArtifactName.fromText("sales.csv")));
		await storage.put(CTX, ArtifactContent.fromBytes(new Uint8Array([1, 2, 3]), "image/png"));
		await storage.put(OTHER_CTX, ArtifactContent.fromText("theirs"));

		const { artifacts } = await listWith(storage, tool);

		expect(artifacts.map((entry) => entry.artifactId)).toEqual(["a-2", "a-1"]);
		expect(artifacts[1]?.name).toBe("sales.csv");
		expect(artifacts[1]?.explorable).toBe(true);
		expect(artifacts[1]?.characters).toBe(11);
		expect(artifacts[0]?.isText).toBe(false);
		expect(artifacts[0]?.explorable).toBe(false);
		expect(artifacts[0]?.bytes).toBe(3);
	});

	it("says a shape the policy calls opaque is not explorable", async () => {
		const { storage, tool } = toolOf(1_000);
		await storage.put(CTX, ArtifactContent.fromText("short", "text/plain"));

		const { artifacts } = await listWith(storage, tool);

		expect(artifacts[0]?.explorable).toBe(false);
	});

	it("answers an empty list for a conversation that owns nothing", async () => {
		const { storage, tool } = toolOf();

		expect((await listWith(storage, tool)).artifacts).toEqual([]);
	});

	it("stops at its own ceiling and says so", async () => {
		const { storage, tool } = toolOf();
		for (let at = 0; at <= ListArtifactsTool.MAX_LISTED; at += 1) {
			await storage.put(CTX, ArtifactContent.fromText(`row ${at}`));
		}

		const answer = await listWith(storage, tool);

		expect(answer.artifacts).toHaveLength(ListArtifactsTool.MAX_LISTED);
		expect(answer.truncated).toBe(true);
	});

	it("keeps the answer inside the budget by dropping entries, and says it did", async () => {
		const { storage, tool } = toolOf(5, 400);
		for (let at = 0; at < 20; at += 1) {
			await storage.put(CTX, ArtifactContent.fromText(`row ${at}`, "text/plain", ArtifactName.fromText(`file-${at}.txt`)));
		}

		const answer = await listWith(storage, tool);

		expect(answer.truncated).toBe(true);
		expect(ArtifactBudget.measure(answer)).toBeLessThanOrEqual(400);
	});
});
