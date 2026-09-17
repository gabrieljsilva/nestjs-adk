import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { ArtifactStorage } from "./artifact-storage.contract";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);

describe("ArtifactStorage", () => {
	it("is the type the runtime depends on, whatever adapter is plugged in", () => {
		expect(new InMemoryArtifactStorage(new SequenceIdGenerator())).toBeInstanceOf(ArtifactStorage);
	});

	it("returns from read exactly what was given to put", async () => {
		const storage: ArtifactStorage = new InMemoryArtifactStorage(new SequenceIdGenerator());
		const content = ArtifactContent.of("a very long report");

		const read = await storage.read(CTX, await storage.put(CTX, content));

		expect(read.text).toBe(content.text);
	});
});
