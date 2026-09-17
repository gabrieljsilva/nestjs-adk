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
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { ReadArtifactTool } from "./read-artifact.tool";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const OTHER = SessionId.from("s-2");
const report = new ArtifactContent("a very long report", "text/markdown");

function contextOf(sessionId: SessionId): ToolContext {
	return new ToolContext(sessionId, AgentRunId.from("run-1"), AgentName.from("support"), ToolCallId.from("c-1"));
}

function toolOf(threshold = 10): { tool: ToolDefinition; storage: InMemoryArtifactStorage } {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { tool: ReadArtifactTool.forStorage(storage, CharacterCountOffloadPolicy.above(threshold)), storage };
}

/** What the model gets back, which is a page plus everything it needs to ask for the next one. */
async function readPage(args: Record<string, unknown>, threshold = 10): Promise<Record<string, unknown>> {
	const { tool, storage } = toolOf(threshold);
	const reference = await storage.put(CTX, report);
	const read = await tool.handler.invoke({ artifactId: reference.id.value, ...args }, contextOf(SESSION));
	return read as Record<string, unknown>;
}

describe("ReadArtifactTool", () => {
	it("declares the id and the window over it", () => {
		const declaration = toolOf().tool.toDeclaration();

		expect(declaration.name).toBe("read_artifact");
		const parameters = JSON.stringify(declaration.parameters);
		expect(parameters).toContain("artifactId");
		expect(parameters).toContain("offset");
		expect(parameters).toContain("limit");
	});

	it("belongs to the runtime, so no approval policy can stop a model reading what it was told to read", () => {
		expect(toolOf().tool.internal).toBe(true);
	});

	it("takes the offload threshold as the page nobody asked for, because that is what fits", async () => {
		const page = await readPage({}, 12);

		expect(page.text).toBe("a very long ");
		expect(page.hasMore).toBe(true);
		expect(page.nextOffset).toBe(12);
	});

	it("says how long the whole thing is, so the model knows what it is holding a page of", async () => {
		const page = await readPage({ offset: 2, limit: 4 });

		expect(page.text).toBe("very");
		expect(page.offset).toBe(2);
		expect(page.totalCharacters).toBe(18);
		expect(page.hasMore).toBe(true);
	});

	it("says when nothing is left, so the model stops asking", async () => {
		const page = await readPage({ offset: 0, limit: 100 });

		expect(page.text).toBe(report.text);
		expect(page.hasMore).toBe(false);
		expect(page.nextOffset).toBeUndefined();
	});

	it("answers a page past the end as empty, because that is how the model finds the end", async () => {
		const page = await readPage({ offset: 500, limit: 10 });

		expect(page.text).toBe("");
		expect(page.hasMore).toBe(false);
		expect(page.offset).toBe(18);
		expect(page.totalCharacters).toBe(18);
	});

	it("does not read an artifact of another session, even with the right id", async () => {
		const { tool, storage } = toolOf();
		const reference = await storage.put(CTX, report);

		const error = await tool.handler
			.invoke({ artifactId: reference.id.value }, contextOf(OTHER))
			.catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(ArtifactNotFoundError);
	});

	it("answers an unknown id as absent", async () => {
		const { tool } = toolOf();

		await expect(tool.handler.invoke({ artifactId: "never-written" }, contextOf(SESSION))).rejects.toBeInstanceOf(
			ArtifactNotFoundError,
		);
	});

	it("refuses arguments a model wrote badly, instead of trusting them", () => {
		const schema = toolOf().tool.schema;

		expect(schema.parse({}).isValid).toBe(false);
		expect(schema.parse({ artifactId: 42 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "  " }).isValid).toBe(false);
		expect(schema.parse("a-1").isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", offset: -1 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", offset: "2" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", limit: 0 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1" }).isValid).toBe(true);
		expect(schema.parse({ artifactId: "a-1", offset: 2, limit: 8 }).isValid).toBe(true);
	});

	it("fills in the page the runtime would take when the model named none", () => {
		expect(toolOf(500).tool.schema.parse({ artifactId: "a-1" }).values).toEqual({
			artifactId: "a-1",
			offset: 0,
			limit: 500,
		});
	});
});
