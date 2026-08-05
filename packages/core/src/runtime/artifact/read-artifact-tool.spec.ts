import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentName } from "../../domain/agent/agent-name";
import { ArtifactContent } from "../../domain/artifact/artifact-content";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { ToolContext } from "../../domain/tool/tool-context";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ReadArtifactTool } from "./read-artifact-tool";

const SESSION = SessionId.from("s-1");
const OTHER = SessionId.from("s-2");
const report = ArtifactContent.of("a very long report", "text/markdown");

function contextOf(sessionId: SessionId): ToolContext {
	return new ToolContext(sessionId, AgentRunId.from("run-1"), AgentName.from("support"), ToolCallId.from("c-1"));
}

function toolOf(): { tool: ToolDefinition; storage: InMemoryArtifactStorage } {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { tool: ReadArtifactTool.forStorage(storage), storage };
}

describe("ReadArtifactTool", () => {
	it("declares itself with the id the placeholder shows", () => {
		const declaration = toolOf().tool.toDeclaration();

		expect(declaration.name).toBe("read_artifact");
		expect(JSON.stringify(declaration.parameters)).toContain("artifactId");
	});

	it("belongs to the runtime, so no approval policy can stop a model reading what it was told to read", () => {
		expect(toolOf().tool.internal).toBe(true);
	});

	it("gives back the content whole", async () => {
		const { tool, storage } = toolOf();
		const reference = await storage.put(SESSION, report);

		const read = await tool.handler.invoke({ artifactId: reference.id.value }, contextOf(SESSION));

		expect(read).toBe(report.text);
	});

	it("does not read an artifact of another session, even with the right id", async () => {
		const { tool, storage } = toolOf();
		const reference = await storage.put(SESSION, report);

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
		expect(schema.parse({ artifactId: "a-1" }).isValid).toBe(true);
	});
});
